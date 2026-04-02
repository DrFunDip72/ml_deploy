-- Denormalized analytical layer (warehouse.db equivalent).
-- One row per shipment / training target, with engineered aggregates.

CREATE TABLE IF NOT EXISTS warehouse_order_features (
  shipment_id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL,

  -- Target label
  late_delivery INTEGER NOT NULL,

  -- Shipment features
  promised_days INTEGER,
  distance_band TEXT,
  carrier TEXT,
  shipping_method TEXT,

  -- Order features
  payment_method TEXT,
  device_type TEXT,
  ip_country TEXT,
  promo_used INTEGER,
  promo_code TEXT,
  order_subtotal DOUBLE PRECISION,
  shipping_fee DOUBLE PRECISION,
  tax_amount DOUBLE PRECISION,
  order_total DOUBLE PRECISION,
  risk_score DOUBLE PRECISION,

  -- Customer features
  customer_segment TEXT,
  loyalty_tier TEXT,
  gender TEXT,

  -- Derived from order_datetime
  order_hour INTEGER,
  order_dayofweek INTEGER,
  order_month INTEGER,

  -- Order-item aggregates
  order_item_count INTEGER,
  total_quantity INTEGER,
  avg_unit_price DOUBLE PRECISION,
  order_items_total DOUBLE PRECISION,
  distinct_products INTEGER,

  avg_product_price DOUBLE PRECISION,
  avg_product_cost DOUBLE PRECISION,
  avg_product_margin DOUBLE PRECISION,

  -- Customer behavior aggregates
  customer_avg_review_rating DOUBLE PRECISION,
  customer_review_count INTEGER,
  customer_total_spend DOUBLE PRECISION,
  customer_order_count INTEGER
);

-- CASCADE: predictions (003) references warehouse_order_features; re-runs must clear both.
TRUNCATE TABLE warehouse_order_features CASCADE;

WITH
order_item_base AS (
  SELECT
    oi.order_id,
    COUNT(*)::int AS order_item_count,
    SUM(oi.quantity)::int AS total_quantity,
    AVG(oi.unit_price)::double precision AS avg_unit_price,
    SUM(oi.line_total)::double precision AS order_items_total,
    COUNT(DISTINCT oi.product_id)::int AS distinct_products
  FROM order_items oi
  GROUP BY oi.order_id
),
order_item_weighted_products AS (
  SELECT
    oi.order_id,
    CASE
      WHEN SUM(oi.quantity) = 0 THEN NULL
      ELSE (SUM(p.price * oi.quantity) / SUM(oi.quantity))::double precision
    END AS avg_product_price,
    CASE
      WHEN SUM(oi.quantity) = 0 THEN NULL
      ELSE (SUM(p.cost * oi.quantity) / SUM(oi.quantity))::double precision
    END AS avg_product_cost
  FROM order_items oi
  JOIN products p ON p.product_id = oi.product_id
  GROUP BY oi.order_id
),
customer_reviews AS (
  SELECT
    pr.customer_id,
    AVG(pr.rating)::double precision AS customer_avg_review_rating,
    COUNT(*)::int AS customer_review_count
  FROM product_reviews pr
  GROUP BY pr.customer_id
),
customer_orders AS (
  SELECT
    o.customer_id,
    SUM(o.order_total)::double precision AS customer_total_spend,
    COUNT(*)::int AS customer_order_count
  FROM orders o
  GROUP BY o.customer_id
)
INSERT INTO warehouse_order_features (
  shipment_id,
  order_id,
  late_delivery,
  promised_days,
  distance_band,
  carrier,
  shipping_method,
  payment_method,
  device_type,
  ip_country,
  promo_used,
  promo_code,
  order_subtotal,
  shipping_fee,
  tax_amount,
  order_total,
  risk_score,
  customer_segment,
  loyalty_tier,
  gender,
  order_hour,
  order_dayofweek,
  order_month,
  order_item_count,
  total_quantity,
  avg_unit_price,
  order_items_total,
  distinct_products,
  avg_product_price,
  avg_product_cost,
  avg_product_margin,
  customer_avg_review_rating,
  customer_review_count,
  customer_total_spend,
  customer_order_count
)
SELECT
  s.shipment_id,
  o.order_id,
  s.late_delivery,
  s.promised_days,
  s.distance_band,
  s.carrier,
  s.shipping_method,
  o.payment_method,
  o.device_type,
  o.ip_country,
  o.promo_used,
  o.promo_code,
  o.order_subtotal,
  o.shipping_fee,
  o.tax_amount,
  o.order_total,
  o.risk_score,
  c.customer_segment,
  c.loyalty_tier,
  c.gender,
  EXTRACT(HOUR FROM to_timestamp(o.order_datetime, 'YYYY-MM-DD HH24:MI:SS'))::int AS order_hour,
  EXTRACT(DOW FROM to_timestamp(o.order_datetime, 'YYYY-MM-DD HH24:MI:SS'))::int AS order_dayofweek,
  EXTRACT(MONTH FROM to_timestamp(o.order_datetime, 'YYYY-MM-DD HH24:MI:SS'))::int AS order_month,
  oib.order_item_count,
  oib.total_quantity,
  oib.avg_unit_price,
  oib.order_items_total,
  oib.distinct_products,
  oiw.avg_product_price,
  oiw.avg_product_cost,
  (oiw.avg_product_price - oiw.avg_product_cost)::double precision AS avg_product_margin,
  cr.customer_avg_review_rating,
  cr.customer_review_count,
  co.customer_total_spend,
  co.customer_order_count
FROM shipments s
JOIN orders o ON o.order_id = s.order_id
JOIN customers c ON c.customer_id = o.customer_id
LEFT JOIN order_item_base oib ON oib.order_id = o.order_id
LEFT JOIN order_item_weighted_products oiw ON oiw.order_id = o.order_id
LEFT JOIN customer_reviews cr ON cr.customer_id = c.customer_id
LEFT JOIN customer_orders co ON co.customer_id = c.customer_id;

CREATE INDEX IF NOT EXISTS idx_warehouse_label ON warehouse_order_features(late_delivery);

