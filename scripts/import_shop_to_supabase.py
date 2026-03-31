import argparse
import os
import sqlite3
from typing import Dict, List, Tuple

import psycopg2
from dotenv import load_dotenv


SQLITE_TABLES: List[str] = [
    "customers",
    "orders",
    "order_items",
    "products",
    "product_reviews",
    "shipments",
]


def get_sqlite_conn(sqlite_path: str) -> sqlite3.Connection:
    if not os.path.exists(sqlite_path):
        raise FileNotFoundError(f"SQLite DB not found: {sqlite_path}")
    return sqlite3.connect(sqlite_path)


def get_postgres_conn() -> psycopg2.extensions.connection:
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        raise ValueError("Missing DATABASE_URL env var.")
    return psycopg2.connect(db_url)


def fetch_sqlite_table(
    cur: sqlite3.Cursor, table: str
) -> Tuple[List[str], List[Tuple]]:
    cols = [row[1] for row in cur.execute(f"PRAGMA table_info({table})").fetchall()]
    rows = cur.execute(f"SELECT {', '.join(cols)} FROM {table}").fetchall()
    return cols, rows


def fetch_postgres_count(pg_cur: psycopg2.extensions.cursor, table: str) -> int:
    pg_cur.execute(f"SELECT COUNT(*) FROM {table}")
    return int(pg_cur.fetchone()[0])


def assert_pk_unique(pg_cur: psycopg2.extensions.cursor, table: str, pk_col: str):
    # If the dataset is already clean, this should be 0.
    pg_cur.execute(
        f"""
        SELECT COUNT(*) FROM (
          SELECT {pk_col}
          FROM {table}
          GROUP BY {pk_col}
          HAVING COUNT(*) > 1
        ) sub
        """
    )
    dup_cnt = int(pg_cur.fetchone()[0])
    if dup_cnt != 0:
        raise RuntimeError(f"Primary key duplicates detected in {table}.{pk_col}")


def main():
    parser = argparse.ArgumentParser(
        description="Import local SQLite shop.db into Supabase Postgres."
    )
    parser.add_argument(
        "--sqlite-path",
        default="shop.db",
        help="Path to the SQLite database file (default: shop.db).",
    )
    args = parser.parse_args()

    load_dotenv()
    sqlite_path = args.sqlite_path

    sqlite_conn = get_sqlite_conn(sqlite_path)
    sqlite_cur = sqlite_conn.cursor()

    pk_map: Dict[str, str] = {
        "customers": "customer_id",
        "orders": "order_id",
        "order_items": "order_item_id",
        "products": "product_id",
        "product_reviews": "review_id",
        "shipments": "shipment_id",
    }

    pg_conn = get_postgres_conn()
    pg_conn.autocommit = False
    pg_cur = pg_conn.cursor()

    try:
        print("Import started...")

        # Import order matters for FKs in a real schema; in this simplified
        # project we just load in a deterministic order.
        for table in SQLITE_TABLES:
            cols, rows = fetch_sqlite_table(sqlite_cur, table)
            if not cols:
                raise RuntimeError(f"No columns found for table {table}")

            # Clear first so we have deterministic counts/validation.
            pg_cur.execute(f"DELETE FROM {table};")

            placeholders = ", ".join(["%s"] * len(cols))
            insert_sql = (
                f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({placeholders})"
            )
            pg_cur.executemany(insert_sql, rows)
            print(f"  - {table}: inserted {len(rows)} rows")

        # Validate row counts.
        for table in SQLITE_TABLES:
            sqlite_cnt = sqlite_cur.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            pg_cnt = fetch_postgres_count(pg_cur, table)
            if int(sqlite_cnt) != int(pg_cnt):
                raise RuntimeError(
                    f"Row count mismatch for {table}: sqlite={sqlite_cnt}, postgres={pg_cnt}"
                )

        # Validate PK uniqueness.
        for table, pk_col in pk_map.items():
            assert_pk_unique(pg_cur, table, pk_col)

        pg_conn.commit()
        print("Import complete. Validation passed.")
    except Exception:
        pg_conn.rollback()
        raise
    finally:
        try:
            pg_cur.close()
        except Exception:
            pass
        try:
            pg_conn.close()
        except Exception:
            pass
        try:
            sqlite_conn.close()
        except Exception:
            pass


if __name__ == "__main__":
    main()

