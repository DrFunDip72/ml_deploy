import argparse
import os
from datetime import datetime

from dotenv import load_dotenv

from ml.pipeline import (
    FEATURE_TABLE,
    LABEL_COL,
    get_pg_conn,
    load_warehouse_df,
    train_and_score,
    upload_artifact_to_supabase_storage,
    write_model_registry,
    write_predictions,
)


def main():
    parser = argparse.ArgumentParser(description="Train and register late_delivery model.")
    parser.add_argument(
        "--model-version",
        default=None,
        help="Optional explicit model_version (otherwise auto-generated).",
    )
    parser.add_argument(
        "--artifact-dir",
        default="artifacts",
        help="Base local artifact directory (default: artifacts).",
    )
    args = parser.parse_args()

    load_dotenv()

    run_ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    model_version = args.model_version or f"late_delivery_{run_ts}"
    artifact_dir = os.path.join(args.artifact_dir, model_version)

    pg_conn = get_pg_conn()
    try:
        df = load_warehouse_df(pg_conn, feature_table=FEATURE_TABLE, label_col=LABEL_COL)
        if df.empty:
            raise RuntimeError("No training rows loaded from warehouse table.")

        _, artifact_path, predictions_df, metrics, train_rows, test_rows = train_and_score(
            df=df,
            model_version=model_version,
            artifact_dir=artifact_dir,
            label_col=LABEL_COL,
        )

        uploaded_artifact_path = upload_artifact_to_supabase_storage(
            artifact_path=artifact_path,
            model_version=model_version,
        )

        write_model_registry(
            pg_conn=pg_conn,
            model_version=model_version,
            metrics=metrics,
            train_row_count=train_rows,
            test_row_count=test_rows,
            artifact_path=artifact_path,
            uploaded_artifact_path=uploaded_artifact_path,
            label_col=LABEL_COL,
            feature_table=FEATURE_TABLE,
        )

        write_predictions(
            pg_conn=pg_conn,
            model_version=model_version,
            predictions_df=predictions_df,
        )

        print("Training completed")
        print(f"  model_version: {model_version}")
        print(f"  metrics: {metrics}")
        if uploaded_artifact_path:
            print(f"  uploaded_artifact_path: {uploaded_artifact_path}")
    finally:
        try:
            pg_conn.close()
        except Exception:
            pass


if __name__ == "__main__":
    main()

