"""
Score warehouse rows that are missing predictions for the latest registered model.

Intended for cron (e.g. GitHub Actions) after new orders are inserted on the web app.
Requires DATABASE_URL and a trained model (Storage artifact or local artifacts/ path).
"""

import argparse
import os
import tempfile

import joblib
from dotenv import load_dotenv

from ml.pipeline import (
    FEATURE_TABLE,
    LABEL_COL,
    download_model_joblib,
    fetch_latest_model_registry_row,
    get_pg_conn,
    score_unscored_warehouse_rows,
)


def resolve_model_path(model_version: str, artifact_bucket: str | None, artifact_path: str | None) -> str:
    env_path = os.environ.get("MODEL_JOBLIB_PATH")
    if env_path and os.path.isfile(env_path):
        return env_path

    local = os.path.join("artifacts", model_version, "model.joblib")
    if os.path.isfile(local):
        return local

    if artifact_bucket and artifact_path:
        fd, tmp = tempfile.mkstemp(suffix=".joblib")
        os.close(fd)
        if download_model_joblib(model_version, artifact_bucket, artifact_path, tmp):
            return tmp

    raise FileNotFoundError(
        "Could not load model.joblib (set MODEL_JOBLIB_PATH, place file under "
        f"artifacts/{model_version}/, or ensure Storage upload + SUPABASE_* env vars)."
    )


def main():
    parser = argparse.ArgumentParser(description="Score unscored warehouse rows for latest model.")
    parser.add_argument(
        "--model-version",
        default=None,
        help="Override model_version (default: latest in model_registry).",
    )
    args = parser.parse_args()

    load_dotenv()
    load_dotenv("ml-deploy/.env.local", override=False)

    pg_conn = get_pg_conn()
    try:
        meta = fetch_latest_model_registry_row(
            pg_conn, label_col=LABEL_COL, feature_table=FEATURE_TABLE
        )
        if not meta:
            raise RuntimeError("model_registry has no rows for this label/feature table.")

        model_version = args.model_version or meta["model_version"]
        if args.model_version:
            artifact_object = f"models/{model_version}/model.joblib"
        else:
            artifact_object = meta.get("artifact_path")
        path = resolve_model_path(
            model_version,
            meta.get("artifact_bucket"),
            artifact_object,
        )

        model = joblib.load(path)
        n = score_unscored_warehouse_rows(pg_conn, model, model_version)
        print(f"Scored {n} row(s) for model_version={model_version}")
    finally:
        try:
            pg_conn.close()
        except Exception:
            pass


if __name__ == "__main__":
    main()
