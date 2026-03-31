# Data Dictionary: `warehouse_order_features`

This table is the denormalized analytical layer (the `warehouse.db` equivalent) used for modeling and inference.

## Row grain
- One row per `shipment_id` (target: whether that shipment was late).

## Target column
- `late_delivery` (INTEGER): `1` = late, `0` = not late.

## Core shipment/order/customer features
- `promised_days` (INTEGER): promised shipping duration.
- `distance_band` (TEXT): categorical distance bucket.
- `carrier` (TEXT): shipping carrier.
- `shipping_method` (TEXT): shipping method name/code.
- `payment_method` (TEXT): payment method used for the order.
- `device_type` (TEXT): device type used at checkout.
- `ip_country` (TEXT): customer IP country.
- `promo_used` (INTEGER): whether a promotion was used.
- `promo_code` (TEXT): promotion code (may be NULL/empty).
- `order_subtotal` (DOUBLE PRECISION): order subtotal amount.
- `shipping_fee` (DOUBLE PRECISION): shipping fee amount.
- `tax_amount` (DOUBLE PRECISION): tax amount.
- `order_total` (DOUBLE PRECISION): total order amount.
- `risk_score` (DOUBLE PRECISION): risk score feature from the order.
- `customer_segment` (TEXT): customer segment category.
- `loyalty_tier` (TEXT): loyalty tier.
- `gender` (TEXT): customer gender.

## Derived from `orders.order_datetime`
- `order_hour` (INTEGER): hour of day (0-23).
- `order_dayofweek` (INTEGER): day of week (Postgres `EXTRACT(DOW)`).
- `order_month` (INTEGER): month number (1-12).

## Order-item aggregates
- `order_item_count` (INTEGER): number of line items in the order.
- `total_quantity` (INTEGER): total quantity across all items.
- `avg_unit_price` (DOUBLE PRECISION): average unit price of items.
- `order_items_total` (DOUBLE PRECISION): sum of `order_items.line_total`.
- `distinct_products` (INTEGER): number of distinct products in the order.
- `avg_product_price` (DOUBLE PRECISION): quantity-weighted average product price.
- `avg_product_cost` (DOUBLE PRECISION): quantity-weighted average product cost.
- `avg_product_margin` (DOUBLE PRECISION): `avg_product_price - avg_product_cost`.

## Customer aggregates
- `customer_avg_review_rating` (DOUBLE PRECISION): average review rating for the customer.
- `customer_review_count` (INTEGER): number of reviews written by the customer.
- `customer_total_spend` (DOUBLE PRECISION): sum of `orders.order_total` for the customer.
- `customer_order_count` (INTEGER): number of orders for the customer.

