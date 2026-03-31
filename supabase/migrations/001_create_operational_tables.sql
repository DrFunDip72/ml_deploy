-- Operational tables imported from the provided SQLite `shop.db`.
-- Single-schema approach: everything lives in the one Supabase Postgres project.

-- Keep migrations idempotent for classroom iteration.

CREATE TABLE IF NOT EXISTS customers (
  customer_id INTEGER PRIMARY KEY,
  full_name TEXT,
  email TEXT,
  gender TEXT,
  birthdate TEXT,
  created_at TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  customer_segment TEXT,
  loyalty_tier TEXT,
  is_active INTEGER
);

CREATE TABLE IF NOT EXISTS orders (
  order_id INTEGER PRIMARY KEY,
  customer_id INTEGER,
  order_datetime TEXT,
  billing_zip TEXT,
  shipping_zip TEXT,
  shipping_state TEXT,
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
  is_fraud INTEGER
);

CREATE TABLE IF NOT EXISTS order_items (
  order_item_id INTEGER PRIMARY KEY,
  order_id INTEGER,
  product_id INTEGER,
  quantity INTEGER,
  unit_price DOUBLE PRECISION,
  line_total DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS products (
  product_id INTEGER PRIMARY KEY,
  sku TEXT,
  product_name TEXT,
  category TEXT,
  price DOUBLE PRECISION,
  cost DOUBLE PRECISION,
  is_active INTEGER
);

CREATE TABLE IF NOT EXISTS product_reviews (
  review_id INTEGER PRIMARY KEY,
  customer_id INTEGER,
  product_id INTEGER,
  rating INTEGER,
  review_datetime TEXT,
  review_text TEXT
);

CREATE TABLE IF NOT EXISTS shipments (
  shipment_id INTEGER PRIMARY KEY,
  order_id INTEGER,
  ship_datetime TEXT,
  carrier TEXT,
  shipping_method TEXT,
  distance_band TEXT,
  promised_days INTEGER,
  actual_days INTEGER,
  late_delivery INTEGER
);

-- Helpful indexes for joins + later modeling.
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_product_reviews_customer_id ON product_reviews(customer_id);
CREATE INDEX IF NOT EXISTS idx_product_reviews_product_id ON product_reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_shipments_order_id ON shipments(order_id);
CREATE INDEX IF NOT EXISTS idx_shipments_late_delivery ON shipments(late_delivery);

