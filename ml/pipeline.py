import os
import json
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import joblib
import numpy as np
import pandas as pd
import psycopg2
import requests
from psycopg2.extras import execute_values
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


# Supervised target for training and scoring (not late_delivery).
LABEL_COL = "is_fraud"
FEATURE_TABLE = "warehouse_order_features"

# Columns that must never be model inputs (alternate labels / legacy targets).
EXCLUDED_FEATURE_COLS = frozenset({"late_delivery"})


@dataclass
class TrainingResult:
    model_version: str
    artifact_path: str
    metrics: Dict[str, float]
    train_row_count: int
    test_row_count: int
    uploaded_artifact_path: Optional[str] = None


def get_pg_conn() -> psycopg2.extensions.connection:
    db_url = os.environ.get("DATABASE_URL") or os.environ.get("DB_URL")
    if not db_url:
        raise ValueError("Missing DATABASE_URL/DB_URL env var.")
    return psycopg2.connect(db_url)


def load_warehouse_df(
    pg_conn: psycopg2.extensions.connection,
    feature_table: str = FEATURE_TABLE,
    label_col: str = LABEL_COL,
) -> pd.DataFrame:
    # Load all rows for simplicity in this classroom project.
    # (In production you'd likely use feature snapshots / partitions.)
    query = f"SELECT * FROM {feature_table} WHERE {label_col} IS NOT NULL"
    return pd.read_sql_query(query, pg_conn)


def feature_columns(df: pd.DataFrame, label_col: str = LABEL_COL) -> Tuple[List[str], List[str]]:
    categorical_cols = [
        "distance_band",
        "carrier",
        "shipping_method",
        "payment_method",
        "device_type",
        "ip_country",
        "promo_code",
        "customer_segment",
        "loyalty_tier",
        "gender",
    ]

    id_cols = ["shipment_id", "order_id", label_col]
    skip = set(id_cols) | EXCLUDED_FEATURE_COLS
    present_categorical = [c for c in categorical_cols if c in df.columns]
    numeric_cols = [c for c in df.columns if c not in present_categorical and c not in skip]
    return numeric_cols, present_categorical


def build_model(numeric_cols: List[str], categorical_cols: List[str]) -> Pipeline:
    numeric_transformer = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]
    )

    categorical_transformer = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("onehot", OneHotEncoder(handle_unknown="ignore")),
        ]
    )

    preprocessor = ColumnTransformer(
        transformers=[
            ("num", numeric_transformer, numeric_cols),
            ("cat", categorical_transformer, categorical_cols),
        ],
        remainder="drop",
    )

    clf = LogisticRegression(max_iter=3000, class_weight="balanced")
    model = Pipeline(steps=[("preprocess", preprocessor), ("clf", clf)])
    return model


def evaluate_binary(
    y_true: np.ndarray, y_proba: np.ndarray, threshold: float = 0.5
) -> Dict[str, float]:
    y_pred = (y_proba >= threshold).astype(int)
    metrics = {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, zero_division=0)),
        "f1": float(f1_score(y_true, y_pred, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_true, y_proba)),
    }
    return metrics


def upload_artifact_to_supabase_storage(
    artifact_path: str,
    model_version: str,
) -> Optional[str]:
    supabase_url = os.environ.get("SUPABASE_URL")
    bucket = os.environ.get("SUPABASE_STORAGE_BUCKET_MODELS", "model-artifacts")
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    anon_key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") or os.environ.get(
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY"
    )

    if not (supabase_url and service_role_key and anon_key):
        return None

    object_path = f"models/{model_version}/model.joblib"
    upload_url = (
        f"{supabase_url}/storage/v1/object/{bucket}/{object_path}"
    )

    headers = {
        "Authorization": f"Bearer {service_role_key}",
        "apikey": anon_key,
        # Overwrite the artifact for a given model_version.
        "x-upsert": "true",
    }

    try:
        with open(artifact_path, "rb") as f:
            resp = requests.post(upload_url, headers=headers, data=f, timeout=60)
        resp.raise_for_status()
        return object_path
    except Exception:
        # Best-effort for classroom deployment; inference can still work if
        # artifacts remain accessible from metadata.
        return None


def write_model_registry(
    pg_conn: psycopg2.extensions.connection,
    model_version: str,
    metrics: Dict[str, float],
    train_row_count: int,
    test_row_count: int,
    artifact_path: str,
    uploaded_artifact_path: Optional[str],
    label_col: str = LABEL_COL,
    feature_table: str = FEATURE_TABLE,
    model_type: str = "logistic_regression",
):
    bucket = os.environ.get("SUPABASE_STORAGE_BUCKET_MODELS", "model-artifacts")
    artifact_bucket = bucket if uploaded_artifact_path else None
    artifact_db_path = uploaded_artifact_path

    with pg_conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO model_registry (
              model_version,
              label_col,
              feature_table,
              model_type,
              metrics_json,
              train_row_count,
              test_row_count,
              artifact_bucket,
              artifact_path
            )
            VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s, %s, %s)
            ON CONFLICT (model_version) DO UPDATE SET
              created_at = NOW(),
              metrics_json = EXCLUDED.metrics_json,
              train_row_count = EXCLUDED.train_row_count,
              test_row_count = EXCLUDED.test_row_count,
              artifact_bucket = EXCLUDED.artifact_bucket,
              artifact_path = EXCLUDED.artifact_path
            """,
            (
                model_version,
                label_col,
                feature_table,
                model_type,
                json.dumps(metrics),
                train_row_count,
                test_row_count,
                artifact_bucket,
                artifact_db_path or artifact_path,
            ),
        )
    pg_conn.commit()


def write_predictions(
    pg_conn: psycopg2.extensions.connection,
    model_version: str,
    predictions_df: pd.DataFrame,
):
    required_cols = {"shipment_id", "order_id", "proba_is_fraud", "predicted_is_fraud"}
    missing = required_cols - set(predictions_df.columns)
    if missing:
        raise ValueError(f"Missing prediction columns: {missing}")

    # Legacy NOT NULL columns (003): predicted_late_delivery, proba_late_delivery.
    # Mirror fraud outputs so inserts satisfy the schema (see 004_predictions_fraud_semantics.sql).
    rows = [
        (
            int(r["shipment_id"]),
            int(r["order_id"]),
            model_version,
            int(r["predicted_is_fraud"]),
            float(r["proba_is_fraud"]),
            int(r["predicted_is_fraud"]),
            float(r["proba_is_fraud"]),
        )
        for _, r in predictions_df.iterrows()
    ]

    with pg_conn.cursor() as cur:
        cur.execute("DELETE FROM predictions WHERE model_version = %s", (model_version,))

        execute_values(
            cur,
            """
            INSERT INTO predictions (
              shipment_id,
              order_id,
              model_version,
              predicted_late_delivery,
              proba_late_delivery,
              predicted_is_fraud,
              proba_is_fraud
            )
            VALUES %s
            """,
            rows,
            page_size=1000,
        )

    pg_conn.commit()


def train_and_score(
    df: pd.DataFrame,
    model_version: str,
    artifact_dir: str,
    label_col: str = LABEL_COL,
):
    numeric_cols, categorical_cols = feature_columns(df, label_col=label_col)

    drop_x = {label_col} | (EXCLUDED_FEATURE_COLS & set(df.columns))
    X = df.drop(columns=list(drop_x))
    y = df[label_col].astype(int).values

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=42,
        stratify=y,
    )

    model = build_model(numeric_cols=numeric_cols, categorical_cols=categorical_cols)
    model.fit(X_train, y_train)

    test_proba = model.predict_proba(X_test)[:, 1]
    metrics = evaluate_binary(y_test, test_proba)

    os.makedirs(artifact_dir, exist_ok=True)
    artifact_path = os.path.join(artifact_dir, "model.joblib")
    joblib.dump(model, artifact_path)

    # Score for all rows (so the UI can show probabilities without
    # needing a separate batch job immediately).
    full_proba = model.predict_proba(X)[:, 1]
    full_pred = (full_proba >= 0.5).astype(int)

    predictions_df = pd.DataFrame(
        {
            "shipment_id": df["shipment_id"].values,
            "order_id": df["order_id"].values,
            "proba_is_fraud": full_proba,
            "predicted_is_fraud": full_pred,
        }
    )

    return model, artifact_path, predictions_df, metrics, len(X_train), len(X_test)


def prepare_feature_matrix(df: pd.DataFrame, label_col: str = LABEL_COL) -> pd.DataFrame:
    """Drop label and excluded columns; same layout as training inputs to the sklearn Pipeline."""
    drop_x = {label_col} | (EXCLUDED_FEATURE_COLS & set(df.columns))
    return df.drop(columns=[c for c in drop_x if c in df.columns])


def fetch_latest_model_registry_row(
    pg_conn: psycopg2.extensions.connection,
    label_col: str = LABEL_COL,
    feature_table: str = FEATURE_TABLE,
) -> Optional[Dict[str, Optional[str]]]:
    with pg_conn.cursor() as cur:
        cur.execute(
            """
            SELECT model_version, artifact_bucket, artifact_path
            FROM model_registry
            WHERE label_col = %s AND feature_table = %s
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (label_col, feature_table),
        )
        row = cur.fetchone()
    if not row:
        return None
    return {
        "model_version": row[0],
        "artifact_bucket": row[1],
        "artifact_path": row[2],
    }


def download_model_joblib(
    model_version: str,
    artifact_bucket: Optional[str],
    artifact_object_path: Optional[str],
    dest_path: str,
) -> bool:
    """Download fitted pipeline from Supabase Storage (service role). Returns False on failure."""
    if not (artifact_bucket and artifact_object_path):
        return False
    supabase_url = os.environ.get("SUPABASE_URL")
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    anon_key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") or os.environ.get(
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY"
    )
    if not (supabase_url and service_role_key):
        return False

    url = f"{supabase_url}/storage/v1/object/{artifact_bucket}/{artifact_object_path}"
    headers = {
        "Authorization": f"Bearer {service_role_key}",
        "apikey": anon_key or service_role_key,
    }
    try:
        resp = requests.get(url, headers=headers, timeout=120)
        if resp.status_code != 200:
            return False
        os.makedirs(os.path.dirname(dest_path) or ".", exist_ok=True)
        with open(dest_path, "wb") as f:
            f.write(resp.content)
        return True
    except Exception:
        return False


def fetch_unscored_warehouse_rows(
    pg_conn: psycopg2.extensions.connection,
    model_version: str,
    feature_table: str = FEATURE_TABLE,
) -> pd.DataFrame:
    q = f"""
    SELECT w.*
    FROM {feature_table} w
    WHERE NOT EXISTS (
      SELECT 1 FROM predictions p
      WHERE p.shipment_id = w.shipment_id AND p.model_version = %s
    )
    """
    return pd.read_sql_query(q, pg_conn, params=(model_version,))


def upsert_predictions_subset(
    pg_conn: psycopg2.extensions.connection,
    model_version: str,
    predictions_df: pd.DataFrame,
):
    """Replace prediction rows for a subset of shipment_ids under the given model_version."""
    if predictions_df.empty:
        return
    required_cols = {"shipment_id", "order_id", "proba_is_fraud", "predicted_is_fraud"}
    missing = required_cols - set(predictions_df.columns)
    if missing:
        raise ValueError(f"Missing prediction columns: {missing}")

    shipment_ids = [int(x) for x in predictions_df["shipment_id"].tolist()]
    rows = [
        (
            int(r["shipment_id"]),
            int(r["order_id"]),
            model_version,
            int(r["predicted_is_fraud"]),
            float(r["proba_is_fraud"]),
            int(r["predicted_is_fraud"]),
            float(r["proba_is_fraud"]),
        )
        for _, r in predictions_df.iterrows()
    ]

    with pg_conn.cursor() as cur:
        cur.execute(
            "DELETE FROM predictions WHERE model_version = %s AND shipment_id = ANY(%s)",
            (model_version, shipment_ids),
        )
        execute_values(
            cur,
            """
            INSERT INTO predictions (
              shipment_id,
              order_id,
              model_version,
              predicted_late_delivery,
              proba_late_delivery,
              predicted_is_fraud,
              proba_is_fraud
            )
            VALUES %s
            """,
            rows,
            page_size=500,
        )
    pg_conn.commit()


def score_unscored_warehouse_rows(
    pg_conn: psycopg2.extensions.connection,
    model,
    model_version: str,
) -> int:
    """Score warehouse rows that lack a predictions row for model_version. Returns count scored."""
    df = fetch_unscored_warehouse_rows(pg_conn, model_version)
    if df.empty:
        return 0
    X = prepare_feature_matrix(df)
    proba = model.predict_proba(X)[:, 1]
    pred = (proba >= 0.5).astype(int)
    out = pd.DataFrame(
        {
            "shipment_id": df["shipment_id"].values,
            "order_id": df["order_id"].values,
            "proba_is_fraud": proba,
            "predicted_is_fraud": pred,
        }
    )
    upsert_predictions_subset(pg_conn, model_version, out)
    return len(out)

