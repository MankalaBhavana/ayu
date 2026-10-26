import os
import sys
from pathlib import Path

# Add backend directory to sys.path if not present
BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine.url import make_url

# Load environment
load_dotenv(PROJECT_ROOT / ".env", override=False)
load_dotenv(BACKEND_DIR / ".env", override=False)

from database import DATABASE_URL, engine, db_session
from models import Base
import security
import legacy_sql
import legacy_queries


def ensure_database_exists():
    """Ensure the target PostgreSQL database exists.
    If it does not exist, connects to the default maintenance DB ('postgres')
    and creates the target database automatically.
    """
    if not DATABASE_URL or not DATABASE_URL.startswith("postgresql"):
        return

    url = make_url(DATABASE_URL)
    target_db = url.database
    if not target_db:
        return

    try:
        # Connect to 'postgres' maintenance database with AUTOCOMMIT
        maintenance_url = url.set(database="postgres")
        m_engine = create_engine(maintenance_url, isolation_level="AUTOCOMMIT")
        with m_engine.connect() as conn:
            exists = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :dbname"),
                {"dbname": target_db},
            ).scalar()
            if not exists:
                print(f"[INIT_DB] Database '{target_db}' does not exist. Creating database...")
                clean_name = target_db.replace('"', '""')
                conn.execute(text(f'CREATE DATABASE "{clean_name}"'))
                print(f"[INIT_DB] Database '{target_db}' created successfully.")
            else:
                print(f"[INIT_DB] Database '{target_db}' exists.")
        m_engine.dispose()
    except Exception as exc:
        # On managed cloud hosts (RDS, Neon, Supabase), connecting to maintenance db or CREATEDB
        # may be disallowed if the database was already created. Safely proceed.
        print(f"[INIT_DB] Notice: Could not inspect/create database via maintenance DB ({exc}). Proceeding...")


def run_sql_migrations(target_engine):
    """Execute raw SQL migration files in backend directory (idempotent)."""
    migration_files = [
        "migrations_insurance_providers.sql",
        "migrations_billing_v2.sql",
    ]
    with target_engine.connect() as conn:
        for fname in migration_files:
            fpath = BACKEND_DIR / fname
            if fpath.is_file():
                print(f"[INIT_DB] Applying migration {fname}...")
                with open(fpath, "r", encoding="utf-8") as f:
                    content = f.read()
                conn.execute(text(content))
        conn.commit()


def init_all():
    """Full database bootstrap:
    1. Ensure database exists
    2. Create all SQLAlchemy models (Base.metadata.create_all)
    3. Apply SQL migrations (insurance providers, billing v2)
    4. Seed initial default users & clinical defaults
    5. Ensure lab diagnostics and pharmacy master schemas
    """
    print("[INIT_DB] Starting database initialization...")
    ensure_database_exists()

    print("[INIT_DB] Creating ORM tables from SQLAlchemy models...")
    Base.metadata.create_all(bind=engine)
    print(f"[INIT_DB] Verified {len(Base.metadata.tables)} ORM tables.")

    print("[INIT_DB] Applying SQL migrations...")
    run_sql_migrations(engine)

    print("[INIT_DB] Seeding baseline accounts, masters, and legacy tables...")
    with db_session() as db:
        security.create_default_users(db)
        security.create_default_clinical_master(db)
        with legacy_sql.get_connection(db) as conn:
            legacy_queries.ensure_lab_diagnostics_tables(conn)
            legacy_queries.ensure_pharmacy_master_schema(conn)
        db.commit()

    print("[INIT_DB] Database initialization completed successfully.")


if __name__ == "__main__":
    init_all()
