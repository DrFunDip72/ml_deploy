-- Model registry + predictions for traceability and inference reads.

CREATE TABLE IF NOT EXISTS model_registry (
  model_version TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  label_col TEXT NOT NULL,
  feature_table TEXT NOT NULL,

  model_type TEXT,

  -- JSON metrics for quick comparisons
  metrics_json JSONB,

  train_row_count INTEGER,
  test_row_count INTEGER,

  -- Supabase Storage metadata (best-effort; may be NULL if upload fails)
  artifact_bucket TEXT,
  artifact_path TEXT
);

CREATE TABLE IF NOT EXISTS predictions (
  shipment_id INTEGER NOT NULL REFERENCES warehouse_order_features(shipment_id) ON DELETE CASCADE,
  model_version TEXT NOT NULL REFERENCES model_registry(model_version) ON DELETE CASCADE,

  predicted_late_delivery INTEGER NOT NULL,
  proba_late_delivery DOUBLE PRECISION NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (shipment_id, model_version)
);

CREATE INDEX IF NOT EXISTS idx_predictions_model_version ON predictions(model_version);
CREATE INDEX IF NOT EXISTS idx_predictions_shipment_id ON predictions(shipment_id);

