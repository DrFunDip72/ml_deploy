-- Forward-only migration to retarget warehouse labels for fraud modeling.
-- This keeps historical migration files immutable.

ALTER TABLE warehouse_order_features
  ADD COLUMN IF NOT EXISTS is_fraud INTEGER;

UPDATE warehouse_order_features wof
SET is_fraud = o.is_fraud
FROM orders o
WHERE o.order_id = wof.order_id
  AND (wof.is_fraud IS DISTINCT FROM o.is_fraud);

-- Keep a dedicated index for the new fraud label used by training filters.
CREATE INDEX IF NOT EXISTS idx_warehouse_is_fraud
  ON warehouse_order_features(is_fraud);
