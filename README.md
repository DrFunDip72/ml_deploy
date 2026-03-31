# IS 455 ML Deploy (Chapter 17)

This project deploys an end-to-end ML pipeline for predicting `late_delivery` using:
- **Next.js on Vercel** (UI + API)
- **Supabase Postgres** (operational tables + denormalized warehouse features + model registry + predictions)
- **Python scikit-learn** (training + evaluation + model versioning)
- **GitHub Actions cron** (scheduled retraining)

## Repo layout (high level)
- `shop.db`: source SQLite database
- `supabase/migrations/*.sql`: SQL migrations that create Supabase tables
- `scripts/import_shop_to_supabase.py`: loads `shop.db` into Supabase
- `warehouse_order_features`: denormalized features table (created by migration `002_...`)
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
1. Apply SQL migrations in order: `001` -> `002` -> `003`
2. Run:
   - `python scripts/import_shop_to_supabase.py --sqlite-path shop.db`
   - `python ml/train.py --artifact-dir artifacts`
3. Start the UI:
   - `cd ml-deploy && npm run dev`

## Scheduled retraining
`.github/workflows/retrain.yml` runs nightly:
1. Applies migrations
2. Imports `shop.db`
3. Trains a new model version and writes predictions to Supabase

## Vercel URL
Once the app is deployed to production, the homepage shows:
- Latest model version
- Training metrics
- Top predictions
- A small prediction lookup form (`shipment_id`)

