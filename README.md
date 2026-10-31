# Ayu Polyclinic & Emergency Clinic — Hospital Information System

Full-stack hospital management system built with a **FastAPI** (Python 3.11+) backend and a **React 18 / Vite** (TypeScript) frontend. In Docker it runs as three containers: PostgreSQL, the FastAPI backend, and an nginx container serving the SPA and proxying `/api` to the backend. All dates and times are stored without drift and shown in **IST** (see [Time Zones](#time-zones)).

---

## Architecture

```
ayu/
├── docker-compose.yml           # db (PostgreSQL 16) + backend + frontend
├── db.env                       # PostgreSQL container settings (template)
├── app.env                      # Backend settings (template)
├── routes.md                    # Complete API route reference (275 paths / 356 operations)
├── README.md                    # System documentation
├── backend/                     # FastAPI application
│   ├── main.py                  # App entry point, CORS, routers, static serving
│   ├── init_db.py               # Auto-provisions DB, 116 ORM tables, migrations & seeds
│   ├── database.py              # SQLAlchemy engine/session (PostgreSQL)
│   ├── models.py                # 116 ORM models (DeclarativeBase)
│   ├── security.py              # Auth, sessions, RBAC permissions, baseline seeds
│   ├── legacy_queries.py        # Business-critical SQL (pharmacy, billing, lab)
│   ├── legacy_sql.py            # Compatibility shim for legacy queries
│   ├── export_utils.py          # PDF/CSV/Excel export utilities
│   ├── billing_service.py       # Billing & invoicing logic
│   ├── migrations_billing_v2.sql # Cashier, receipts, advances, and doctor shares
│   ├── migrations_insurance_providers.sql # Insurance provider master list
│   ├── routers/                 # FastAPI routers (one per module)
│   │   ├── auth.py              # Authentication & platform admin
│   │   ├── patients.py          # Patient registration & records
│   │   ├── clinical.py          # Clinical workflows & prescriptions
│   │   ├── pharmacy.py          # Pharmacy, dispensing, inventory
│   │   ├── billing.py           # Billing, invoices, payments
│   │   ├── diagnostics.py       # Lab & diagnostic orders/reports
│   │   ├── employees_bed.py     # Employee management & bed allocation
│   │   ├── lab_ot_accounts_hr.py# Lab, OT, accounts, HR modules
│   │   ├── reports_exports.py   # Reports & data exports
│   │   └── config.py            # System configuration
│   ├── assets/                  # Logos & branding for PDF exports
│   ├── uploads/                 # Runtime file uploads (gitignored)
│   ├── migrations_timestamptz.sql # Normalises all timestamps to TIMESTAMPTZ
│   ├── requirements.txt         # Pinned Python dependencies
│   ├── Dockerfile               # Multi-stage backend image (venv builder → slim runtime)
│   └── .dockerignore            # Backend build-context exclusions
└── frontend/                    # React/Vite SPA
    ├── src/
    │   ├── App.tsx              # Main application (routing, sidebar, auth)
    │   ├── pages/               # Page components per module
    │   ├── components/          # Shared UI components
    │   ├── lib/                 # Utilities, API client, constants
    │   └── styles.css           # Global stylesheet
    ├── public/                  # Static assets (logos, favicons)
    ├── dist/                    # Pre-built production bundle (committed & served by backend)
    ├── Dockerfile               # Multi-stage frontend image (deps → Vite build → nginx)
    ├── .dockerignore            # Frontend build-context exclusions
    ├── nginx.conf               # SPA routing + /api reverse proxy to backend:8000
    └── package.json             # Node dependencies & test scripts
```

---

## Technical Stack

| Layer | Technology | Details |
|---|---|---|
| **Backend** | Python 3.11+, FastAPI, Uvicorn, Gunicorn | High-performance ASGI REST API with Pydantic v2 validation |
| **Database** | PostgreSQL 14+, SQLAlchemy 2.1, psycopg 3 | 116 relational ORM models + parameterized financial SQL; all timestamps `TIMESTAMPTZ` |
| **Frontend** | React 18, TypeScript, Vite 8 | SPA with reactive UI, dark/light modes, role-based views |
| **Styling** | Vanilla CSS Design System | Responsive layout, print media styles, custom variables |
| **Documents** | `fpdf2`, `pypdf`, `openpyxl`, `python-docx`, `jspdf` | Dynamic letterheads, discharge summaries, bill prints, Excel reports |
| **AI & Cloud** | Google Gemini (`google-genai`), AWS S3 (`boto3`) | Symptom AI summaries, cloud file uploads, OCR support |
| **Testing** | Vitest, Testing Library, Jest, Puppeteer, Pytest | 100% test pass rate across 24 test suites |

---

## Database Auto-Provisioning

When deploying to a clean or existing PostgreSQL server, schemas and seeds are **automatically initialized on application startup** via `backend/init_db.py`:

1. **Database Check/Creation:** Checks if the target database (e.g. `hospital`) exists; creates it automatically via maintenance connection if absent.
2. **116 Table Schemas:** Executes `Base.metadata.create_all(bind=engine)` to create all tables.
3. **Additive SQL Migrations:** Executes `migrations_insurance_providers.sql` and `migrations_billing_v2.sql` (cashier drawers, receipts, split payments, doctor shares).
4. **Master Seeding:** Ensures lab/diagnostic and pharmacy tables, creates clinical master defaults, and registers the baseline admin user.
5. **Timestamp Normalisation:** `migrations_timestamptz.sql` converts any remaining `timestamp without time zone` column to `TIMESTAMPTZ` (existing values are read as IST, so nothing shifts). It is idempotent and a no-op once converted.

You can also run initialization manually from the command line:

```bash
python backend/init_db.py
```

---|---|
| PostgreSQL | Every timestamp column is `TIMESTAMPTZ` (an absolute instant). Calendar-only fields stay `DATE`. |
| DB session | Each connection runs with `TimeZone=Asia/Kolkata` (`backend/database.py`), so `NOW()`, `CURRENT_DATE`, `DATE(col)` and naive literals are IST. |
| Python | Datetimes are naive and mean IST. Use `legacy_queries.current_ist_datetime()` for "now"; never `datetime.now()` / `date.today()` (server-local, UTC in Docker). |
| API | Datetimes are serialised with an explicit `+05:30` offset. |
| Frontend | Use the helpers in `frontend/src/lib/format.ts`: `todayIST()`, `currentMonthIST()`, `toISTDateKey()`, `formatIST()` / `formatDateOnlyIST()` / `formatTimeIST()`, `toISTDateTimeLocal()`, `nowISTISOString()`. Never use `toISOString()` for a calendar date (it is UTC: "yesterday" between 00:00 and 05:30 IST) or `toLocale*String()` without the IST timezone. |

---

## Default Accounts

Created automatically on first boot:

| Username | Password | Role | Access Level |
|---|---|---|---|
| `admin` (or `DEFAULT_ADMIN_USERNAME`) | `admin@123` (or `DEFAULT_ADMIN_PASSWORD`) | Admin / Owner | Full Access to All Modules |
| `employee` | `employee123` | Admin | Administrative Access |
| `staff` | `staff123` | Staff | Reception, Patients & Billing |
| `pharmacy` | `pharmacy123` | Pharmacy | Dispensing & Inventory |

---

## Quick Start (Local Development)

### Prerequisites
- Python 3.11+
- PostgreSQL 14+
- Node.js 20+ (for frontend development only)

### Backend Setup
```bash
# 1. Create and activate virtual environment
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

# 2. Install dependencies
pip install -r backend/requirements.txt

# 3. Configure environment: edit app.env (it is loaded automatically).
#    For local runs set DATABASE_URL host to 127.0.0.1 instead of "db".

# 4. Start backend server
uvicorn main:app --reload --app-dir backend
```
The server is available at `http://127.0.0.1:8000/`.

### Frontend Development (Optional)
```bash
cd frontend
npm install
npm run dev          # Dev server at http://localhost:5173 (proxies /api → backend)
npm run build        # Production build → frontend/dist/
npm run test:run     # Run test suite
```

---

## Deployment Guide

### Option 1: Docker Compose (Recommended)

Three containers with health checks and persistent volumes:

| Service | Image / Dockerfile | Purpose | Port |
|---|---|---|---|
| `db` | `postgres:16-alpine` + `db.env` | PostgreSQL (server time zone IST) | `127.0.0.1:5432` |
| `backend` | `backend/Dockerfile` + `app.env` | FastAPI on gunicorn/uvicorn; auto-migrates on start | internal `8000` |
| `frontend` | `frontend/Dockerfile` | nginx serving the SPA, proxying `/api/*` → `backend:8000` | `80` |

```bash
# 1. Set real values in db.env and app.env (password must match in both)
# 2. Build and start
docker compose up -d --build
```
The application will be live at `http://localhost/`.

Clinic branding baked into the frontend bundle can be overridden with build args, e.g. `docker compose build --build-arg VITE_CLINIC_NAME="My Clinic" frontend` (see `frontend/Dockerfile`).

### Option 2: Individual Images (external PostgreSQL)

```bash
docker build -t ayu-backend ./backend
docker run -d --name backend --env-file app.env -p 8000:8000 ayu-backend

docker build -t ayu-frontend ./frontend
docker run -d --link backend -p 80:80 ayu-frontend
```
Point `DATABASE_URL` in `app.env` at your PostgreSQL (AWS RDS, Supabase, Neon, ...). Managed databases default to UTC; that is fine because the app sets IST on every connection.

### Option 3: Traditional Linux VPS (Gunicorn + Systemd)

```bash
# 1. Install backend requirements
pip install -r backend/requirements.txt

# 2. (Optional) Run explicit schema migration
python backend/init_db.py

# 3. Start production server with 4 workers
gunicorn -k uvicorn.workers.UvicornWorker main:app \
  --chdir backend \
  --bind 0.0.0.0:8000 \
  --workers 4
```

---

## Production Checklist

- [ ] Replace every `change-me` value in `db.env` / `app.env` (keep real values out of git: `git update-index --skip-worktree db.env app.env`)
- [ ] Set strong secrets for `SESSION_PEPPER` and `ADMIN_ROUTE_AUTH_SECRET` in `app.env`
- [ ] Set `SESSION_COOKIE_SECURE=true` for HTTPS
- [ ] Configure `CORS_ALLOWED_ORIGINS` for your production domains
- [ ] Configure `DATABASE_URL` pointing to your PostgreSQL instance
- [ ] Set up reverse proxy (Nginx / Caddy / Cloudflare) with TLS on port 80/443
- [ ] Configure automated PostgreSQL backup schedule
- [ ] Keep `TZ=Asia/Kolkata` in `db.env` / `app.env` (see [Time Zones](#time-zones))

---

## Design Notes

### Unified Process Serving
`frontend/dist/` is pre-compiled and committed to the repository. When the backend runs outside Docker it serves those static assets and SPA routes itself via `StaticFiles` and `FileResponse`, so a single process runs the whole app. In Docker the frontend image builds its own bundle and nginx serves it.

### ORM vs. Raw SQL
- **ORM (SQLAlchemy 2.0):** Used for standard CRUD, module relationships, authentication, and state management.
- **Raw Parameterized SQL:** Used for business-critical calculations in `legacy_queries.py` and `billing_service.py` (stock FIFO/FEFO ledger calculations, cashier drawer balancing, invoice settlements, revenue reporting).

---

## Time Zones

The HIMS works in **India Standard Time (IST, Asia/Kolkata, UTC+05:30)** for every module, and no date or time can drift between the database, the server and the browser.

### How it works

| Layer | What happens |
|---|---|
| **PostgreSQL storage** | Every timestamp column is `TIMESTAMPTZ`. Postgres stores it internally in **UTC** (an absolute instant) and keeps no zone with the value. Calendar-only fields (DOB, expiry, bill date) are `DATE`. |
| **DB connection** | The backend sets `TimeZone=Asia/Kolkata` on every connection (`backend/database.py`). Postgres converts stored UTC instants to IST when reading, and treats naive input as IST when writing. `NOW()`, `CURRENT_DATE` and `DATE(created_at)` are therefore IST. |
| **Backend (Python)** | Datetimes are naive values meaning IST. "Now" comes from `current_ist_datetime()`; server-local `datetime.now()` / `date.today()` are never used (containers run on UTC by default). |
| **API (JSON)** | Every datetime is sent with an explicit offset: `2026-10-31T12:20:00+05:30`. Incoming `Z`/offset timestamps are converted correctly; naive ones are read as IST. |
| **Frontend** | All display and "today" logic uses the helpers in `frontend/src/lib/format.ts` with `timeZone: "Asia/Kolkata"`, so screens show IST even on a device set to another time zone. |

Example: a payment at 01:15 AM IST on 31 Oct 2026 is stored internally as `2026-10-30 19:45:00 UTC`, and is returned by the API and shown on every screen as `31 Oct 2026, 01:15 AM` (IST, still dated 31 Oct).

### Do we need to set a time zone in `db.env` / `app.env`?

Not for correctness: the application enforces IST itself, so data stays correct even on a UTC server or managed database. Both files still set it, deliberately:

| File | Setting | Effect |
|---|---|---|
| `db.env` | `TZ=Asia/Kolkata`, `PGTZ=Asia/Kolkata` | Server default zone for new volumes, Postgres logs, and `psql` sessions inside the container show IST. `docker-compose.yml` also starts Postgres with `-c timezone=Asia/Kolkata` so existing volumes show IST too. |
| `app.env` | `TZ=Asia/Kolkata` | Container clock and log timestamps are IST. |

Do not change these to another zone. The application's time zone is fixed to IST by design and is not configurable.

### Existing databases

On startup, `backend/migrations_timestamptz.sql` converts any remaining `timestamp without time zone` column to `TIMESTAMPTZ`, reading old values as IST, so nothing shown on screen changes. It is idempotent (a no-op once converted). **Take a database backup before the first deploy of this version**; each table is rewritten once.

### Rules for new code

- **Database:** declare timestamps as `DateTime(timezone=True)` (ORM) or `TIMESTAMPTZ` (raw SQL), never plain `TIMESTAMP`.
- **Backend:** use `current_ist_datetime()` for "now" and `.date()` of it for "today".
- **Frontend:** use `todayIST()` / `currentMonthIST()` for date inputs and filters; `formatIST()`, `formatDateOnlyIST()`, `formatTimeIST()` for display; `toISTDateTimeLocal()` for `datetime-local` inputs; `nowISTISOString()` when sending "now".
- **Never** use `toISOString()` for a calendar date (it is UTC, so it gives yesterday's date between 00:00 and 05:30 IST), or `toLocale*String()` / `getHours()` / `getDate()` on server timestamps without the IST helpers.

### Checking it directly in the database

```sql
SHOW timezone;                                     -- Asia/Kolkata in app sessions
SELECT created_at FROM audit_logs LIMIT 1;          -- shown in the session zone
SELECT created_at AT TIME ZONE 'UTC' FROM audit_logs LIMIT 1;  -- the internal UTC value
```
