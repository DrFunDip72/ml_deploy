-- Incremental refresh of warehouse_order_features for one order (e.g. new web orders).
-- Mirrors the logic in 002_create_warehouse_features.sql plus is_fraud (005).

CREATE OR REPLACE FUNCTION public.sync_warehouse_for_order(p_order_id integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
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
    customer_order_count,
    is_fraud
  )
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
    WHERE oi.order_id = p_order_id
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
    WHERE oi.order_id = p_order_id
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
    co.customer_order_count,
    o.is_fraud
  FROM shipments s
  JOIN orders o ON o.order_id = s.order_id
  JOIN customers c ON c.customer_id = o.customer_id
  LEFT JOIN order_item_base oib ON oib.order_id = o.order_id
  LEFT JOIN order_item_weighted_products oiw ON oiw.order_id = o.order_id
  LEFT JOIN customer_reviews cr ON cr.customer_id = c.customer_id
  LEFT JOIN customer_orders co ON co.customer_id = c.customer_id
  WHERE o.order_id = p_order_id
  ON CONFLICT (shipment_id) DO UPDATE SET
    order_id = EXCLUDED.order_id,
    late_delivery = EXCLUDED.late_delivery,
    promised_days = EXCLUDED.promised_days,
    distance_band = EXCLUDED.distance_band,
    carrier = EXCLUDED.carrier,
    shipping_method = EXCLUDED.shipping_method,
    payment_method = EXCLUDED.payment_method,
    device_type = EXCLUDED.device_type,
    ip_country = EXCLUDED.ip_country,
    promo_used = EXCLUDED.promo_used,
    promo_code = EXCLUDED.promo_code,
    order_subtotal = EXCLUDED.order_subtotal,
    shipping_fee = EXCLUDED.shipping_fee,
    tax_amount = EXCLUDED.tax_amount,
    order_total = EXCLUDED.order_total,
    risk_score = EXCLUDED.risk_score,
    customer_segment = EXCLUDED.customer_segment,
    loyalty_tier = EXCLUDED.loyalty_tier,
    gender = EXCLUDED.gender,
    order_hour = EXCLUDED.order_hour,
    order_dayofweek = EXCLUDED.order_dayofweek,
    order_month = EXCLUDED.order_month,
    order_item_count = EXCLUDED.order_item_count,
    total_quantity = EXCLUDED.total_quantity,
    avg_unit_price = EXCLUDED.avg_unit_price,
    order_items_total = EXCLUDED.order_items_total,
    distinct_products = EXCLUDED.distinct_products,
    avg_product_price = EXCLUDED.avg_product_price,
    avg_product_cost = EXCLUDED.avg_product_cost,
    avg_product_margin = EXCLUDED.avg_product_margin,
    customer_avg_review_rating = EXCLUDED.customer_avg_review_rating,
    customer_review_count = EXCLUDED.customer_review_count,
    customer_total_spend = EXCLUDED.customer_total_spend,
    customer_order_count = EXCLUDED.customer_order_count,
    is_fraud = EXCLUDED.is_fraud;
$$;

GRANT EXECUTE ON FUNCTION public.sync_warehouse_for_order(integer) TO service_role;
