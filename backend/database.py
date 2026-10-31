import os
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from psycopg.types.datetime import TimestamptzBinaryLoader, TimestamptzLoader
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session

BASE_DIR = os.path.dirname(__file__)
PROJECT_ROOT = os.path.abspath(os.path.join(BASE_DIR, ".."))
# Same .env resolution order as the original Flask app: project root first,
# then backend/.env, neither overriding already-set environment variables.
load_dotenv(os.path.join(PROJECT_ROOT, ".env"), override=False)
load_dotenv(os.path.join(BASE_DIR, ".env"), override=False)

DATABASE_URL = (os.getenv("DATABASE_URL") or "").strip()
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is required. Set it in your .env file, e.g. "
        "DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@127.0.0.1:5432/hospai"
    )

if DATABASE_URL.startswith("sqlite"):
    raise RuntimeError("SQLite is strictly prohibited. The application must use PostgreSQL exclusively.")

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = "postgresql://" + DATABASE_URL[len("postgres://"):]

if not (DATABASE_URL.startswith("postgresql://") or DATABASE_URL.startswith("postgresql+")):
    raise RuntimeError("DATABASE_URL must be a PostgreSQL connection string (postgresql://...).")

if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL[len("postgresql://"):]

# ----------------------------------------------------------- time handling --
# Single timestamp convention for the whole HIMS:
#   * PostgreSQL: every timestamp column is TIMESTAMPTZ (an absolute instant),
#     so stored values can never drift whatever the server/session timezone is.
#   * DB session: TimeZone=Asia/Kolkata, so NOW()/CURRENT_DATE/DATE(col) and
#     naive literals/params are all evaluated in IST.
#   * Python: datetimes are naive and mean IST wall-clock time. TIMESTAMPTZ
#     values are loaded as naive IST (loader below), and naive values written
#     back are interpreted by PostgreSQL in the IST session timezone.
#   * API: datetimes are serialised with an explicit +05:30 offset
#     (see to_ist_isoformat, wired into FastAPI's encoder in main.py).
DB_TIMEZONE = "Asia/Kolkata"
IST_TIMEZONE = timezone(timedelta(hours=5, minutes=30))

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    future=True,
    connect_args={"options": f"-c timezone={DB_TIMEZONE}"},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

DEFAULT_HOSPITAL_CODE = (os.getenv("DEFAULT_HOSPITAL_CODE") or "hosp-default").strip().lower()


def to_naive_ist(value: datetime) -> datetime:
    """Normalise any datetime to naive IST wall-clock time (naive input is assumed IST)."""
    if value.tzinfo is None:
        return value
    return value.astimezone(IST_TIMEZONE).replace(tzinfo=None)


def to_ist_isoformat(value: datetime) -> str:
    """ISO-8601 string with an explicit +05:30 offset (naive input is assumed IST)."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=IST_TIMEZONE)
    return value.astimezone(IST_TIMEZONE).isoformat()


class _ISTTimestamptzLoader(TimestamptzLoader):
    def load(self, data):
        return to_naive_ist(super().load(data))


class _ISTTimestamptzBinaryLoader(TimestamptzBinaryLoader):
    def load(self, data):
        return to_naive_ist(super().load(data))


@event.listens_for(engine, "connect")
def _configure_ist_connection(dbapi_connection, _connection_record):
    # Belt and braces in case a pooler drops the startup "options" parameter.
    with dbapi_connection.cursor() as cur:
        cur.execute(f"SET TIME ZONE '{DB_TIMEZONE}'")
    dbapi_connection.commit()
    dbapi_connection.adapters.register_loader("timestamptz", _ISTTimestamptzLoader)
    dbapi_connection.adapters.register_loader("timestamptz", _ISTTimestamptzBinaryLoader)


def get_db():
    """FastAPI dependency: yields a SQLAlchemy Session per-request."""
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@contextmanager
def db_session():
    """Context-manager form for use outside request handlers (startup, scripts)."""
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
