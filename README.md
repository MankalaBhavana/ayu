# Ayu Polyclinic & Emergency Clinic — Hospital Information System

Full-stack hospital management system built with **FastAPI** (Python) backend and
**React/Vite** (TypeScript) frontend, served as a single `uvicorn` process.

## Architecture

```
ayu/
├── backend/                 # FastAPI application
│   ├── main.py              # App entry point, CORS, routers, static serving
│   ├── database.py          # SQLAlchemy engine/session (PostgreSQL)
│   ├── models.py            # 115+ ORM models (reflected from Postgres schema)
│   ├── security.py          # Auth, sessions, permissions, seed users
│   ├── legacy_queries.py    # Business-critical SQL (pharmacy, billing, etc.)
│   ├── legacy_sql.py        # Compatibility shim for legacy queries
│   ├── export_utils.py      # PDF/CSV/Excel export utilities
│   ├── billing_service.py   # Billing & invoicing logic
│   ├── routers/             # FastAPI routers (one per module)
│   │   ├── auth.py          # Authentication & platform admin
│   │   ├── patients.py      # Patient registration & records
│   │   ├── clinical.py      # Clinical workflows & prescriptions
│   │   ├── pharmacy.py      # Pharmacy, dispensing, inventory
│   │   ├── billing.py       # Billing, invoices, payments
│   │   ├── diagnostics.py   # Lab & diagnostic orders/reports
│   │   ├── employees_bed.py # Employee management & bed allocation
│   │   ├── lab_ot_accounts_hr.py  # Lab, OT, accounts, HR modules
│   │   ├── reports_exports.py     # Reports & data exports
│   │   └── config.py        # System configuration
│   ├── assets/              # Logos & branding for PDF exports
│   ├── uploads/             # Runtime file uploads (gitignored)
│   └── requirements.txt     # Python dependencies
├── frontend/                # React/Vite SPA
│   ├── src/
│   │   ├── App.tsx          # Main application (routing, sidebar, auth)
│   │   ├── pages/           # Page components per module
│   │   ├── components/      # Shared UI components
│   │   ├── lib/             # Utilities, API client, constants
│   │   └── styles.css       # Global stylesheet
│   ├── public/              # Static assets (logos, favicons)
│   ├── dist/                # Production build (committed, served by backend)
│   ├── Dockerfile           # Multi-stage build (Node → Nginx)
│   ├── nginx.conf           # Nginx config for containerized deployment
│   └── package.json         # Node dependencies
├── routes.md                # Complete API route reference (275 endpoints)
├── .env.example             # Environment variable template
└── README.md                # This file
```

## Quick Start

### Prerequisites
- Python 3.11+
- PostgreSQL 14+
- Node.js 20+ (for frontend development only)

### Backend Setup

```bash
# Create and activate virtual environment
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your PostgreSQL connection string

# Start the server
uvicorn main:app --reload --app-dir backend
```

The app serves both the API (`/api/...`) and the pre-built frontend on
`http://127.0.0.1:8000/`.

### Frontend Development

```bash
cd frontend
npm install
npm run dev          # Dev server on http://localhost:5173 (proxies /api → backend)
npm run build        # Production build → dist/
npm run test:run     # Run test suite
```

### Default Accounts

Created automatically on first run:

| Username   | Password       | Role     |
|------------|----------------|----------|
| employee   | employee123    | Admin    |
| staff      | staff123       | Staff    |
| pharmacy   | pharmacy123    | Pharmacy |

## Database

Restore from a PostgreSQL dump and point `DATABASE_URL` at it:

```bash
createdb hospital
psql -d hospital -f backups/hospai_postgres_backup_fastapi.sql
# or using pg_restore:
pg_restore --no-owner -d hospital backups/hospai_postgres_backup_fastapi.dump
```

Update `DATABASE_URL` in `.env` to match your local Postgres instance.

## Deployment

### Docker (Frontend + Nginx)

```bash
docker build -f frontend/Dockerfile \
  --build-arg VITE_API_BASE=/api \
  --build-arg VITE_API_URL=/api \
  -t ayu-frontend .
```

### Production Checklist

- [ ] Set strong `SESSION_PEPPER` and `ADMIN_ROUTE_AUTH_SECRET` in `.env`
- [ ] Set `SESSION_COOKIE_SECURE=true` for HTTPS
- [ ] Configure `CORS_ALLOWED_ORIGINS` for your domain
- [ ] Use a production WSGI server: `gunicorn -k uvicorn.workers.UvicornWorker main:app`
- [ ] Set up PostgreSQL connection pooling (PgBouncer recommended)
- [ ] Configure reverse proxy (Nginx/Caddy) with TLS
- [ ] Set up database backups schedule

## Design Notes

### ORM vs. Raw SQL

Straightforward CRUD operations use SQLAlchemy ORM (`db.query(Model)`) directly
in routers and `security.py`. Complex business-critical queries (pharmacy
dispensing, stock ledger, invoice settlements, revenue aggregates) are in
`legacy_queries.py` — the same proven SQL running through the FastAPI-injected
session via `legacy_sql.py`.

### Frontend Build in Git

`frontend/dist/` is intentionally committed so the repo runs out of the box
with just the backend started — no Node.js required for deployment.
