# IS 455 ML Deploy (Chapter 17)

This project deploys an end-to-end ML pipeline for predicting `is_fraud` using:
- **Next.js on Vercel** (UI + API)
- **Supabase Postgres** (operational tables + denormalized warehouse features + model registry + predictions)
- **Python scikit-learn** (training + evaluation + model versioning)
- **GitHub Actions cron** (scheduled retraining)

## Repo layout (high level)
- `shop.db`: source SQLite database
- `supabase/migrations/*.sql`: SQL migrations that create Supabase tables
- `scripts/import_shop_to_supabase.py`: loads `shop.db` into Supabase
- `warehouse_order_features`: denormalized features table with `is_fraud` target
- `ml/train.py` + `ml/pipeline.py`: training + registry/prediction writes
- `ml-deploy/`: Next.js app (Vercel project)

## Required environment variables
Copy `.env.example` to `.env.local` for local work and set real values:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_STORAGE_BUCKET_MODELS`

## One-time local setup (optional)
1. Apply SQL migrations in order: `001` -> `002` -> `003` -> `004` -> `005`
   - `004_predictions_fraud_semantics.sql` adds fraud-oriented prediction columns
   - `005_warehouse_features_add_is_fraud.sql` adds/populates `warehouse_order_features.is_fraud`
2. Run:
   - `python scripts/import_shop_to_supabase.py --sqlite-path shop.db`
   - `python ml/train.py --artifact-dir artifacts`
3. Start the UI:
   - `cd ml-deploy && npm run dev`

## Demo flow checklist
1. Open `/` and place a customer order.
2. On `/`, load orders by customer email and confirm fraud score/predicted class appears when available.
3. Open `/admin`, enter `ADMIN_DEMO_PASSCODE`, and load orders.
4. Mark an order as Fraud (`1`) or Clean (`0`) and confirm the update persists.
5. Re-run `python ml/train.py --artifact-dir artifacts` after new labels to refresh model outputs.

## Scheduled retraining
`.github/workflows/retrain.yml` runs nightly:
1. Applies migrations
2. Imports `shop.db`
3. Trains a new model version and writes predictions to Supabase

## Vercel URL
Once the app is deployed to production, it includes:
- Customer order placement form
- Customer order lookup by email (with fraud score/predicted class)
- Admin review page (`/admin`) to mark `orders.is_fraud`
- Fraud predictions from the latest model version


added line
