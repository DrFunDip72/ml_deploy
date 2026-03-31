-- Add fraud-oriented prediction fields while keeping backward compatibility.

ALTER TABLE predictions
  ADD COLUMN IF NOT EXISTS order_id INTEGER REFERENCES orders(order_id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS predicted_is_fraud INTEGER,
  ADD COLUMN IF NOT EXISTS proba_is_fraud DOUBLE PRECISION;

-- Backfill existing rows from late-delivery columns when present.
UPDATE predictions
SET
  order_id = COALESCE(
    order_id,
    (
      SELECT s.order_id
      FROM shipments s
      WHERE s.shipment_id = predictions.shipment_id
      LIMIT 1
    )
  ),
  predicted_is_fraud = COALESCE(predicted_is_fraud, predicted_late_delivery),
  proba_is_fraud = COALESCE(proba_is_fraud, proba_late_delivery)
WHERE
  order_id IS NULL
  OR predicted_is_fraud IS NULL
  OR proba_is_fraud IS NULL;

ALTER TABLE predictions
  ALTER COLUMN order_id SET NOT NULL,
  ALTER COLUMN predicted_is_fraud SET NOT NULL,
  ALTER COLUMN proba_is_fraud SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'predictions_order_id_model_version_key'
  ) THEN
    ALTER TABLE predictions
      ADD CONSTRAINT predictions_order_id_model_version_key UNIQUE (order_id, model_version);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_predictions_order_id ON predictions(order_id);
