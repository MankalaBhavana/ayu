# Ayu Polyclinic & Emergency Clinic — Hospital Information System

Full-stack hospital management system built with a **FastAPI** (Python 3.11+) backend and a **React 18 / Vite** (TypeScript) frontend. The production build serves both the API and the SPA frontend as a unified service on port `8000`.

---

## Architecture

```
ayu/
├── Dockerfile                   # Production multi-stage Docker build (Full-stack)
├── docker-compose.yml           # Production Docker Compose (PostgreSQL 16 + App)
├── .dockerignore                # Production container exclusions
├── .env.example                 # Environment variable template
├── routes.md                    # Complete API route reference (275 endpoints)
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
│   └── requirements.txt         # Python dependencies
└── frontend/                    # React/Vite SPA
    ├── src/
    │   ├── App.tsx              # Main application (routing, sidebar, auth)
    │   ├── pages/               # Page components per module
    │   ├── components/          # Shared UI components
    │   ├── lib/                 # Utilities, API client, constants
    │   └── styles.css           # Global stylesheet
    ├── public/                  # Static assets (logos, favicons)
    ├── dist/                    # Pre-built production bundle (committed & served by backend)
    ├── Dockerfile               # Standalone frontend build (Node → Nginx)
    ├── nginx.conf               # Nginx config for frontend-only container
    └── package.json             # Node dependencies & test scripts
```

---

## Technical Stack

| Layer | Technology | Details |
|---|---|---|
| **Backend** | Python 3.11+, FastAPI, Uvicorn, Gunicorn | High-performance ASGI REST API with Pydantic v2 validation |
| **Database** | PostgreSQL 14+, SQLAlchemy 2.0, psycopg2 | 116 relational ORM models + parameterized financial SQL |
| **Frontend** | React 18, TypeScript, Vite 5 | SPA with reactive UI, dark/light modes, role-based views |
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

### Date & Time Handling (IST, no drift)

Every module uses one convention, so dates and times can never drift:

| Layer | Rule |
|---|---|
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

# 3. Configure environment
cp .env.example .env
# Edit .env with your local PostgreSQL credentials

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
npm run test:run     # Run test suite (100 tests)
```

---

## Deployment Guide

### Option 1: Docker Compose (Recommended — Full-Stack + PostgreSQL in 1 Command)

Orchestrates PostgreSQL 16 and the unified application container with automatic health checks and persistent volume storage:

```bash
cp .env.example .env
docker compose up -d --build
```
The application will be live at `http://localhost:8000`.

### Option 2: Unified Container (FastAPI + Prebuilt Frontend)

Build the production image and point it to an external PostgreSQL instance (AWS RDS, Supabase, Neon, etc.):

```bash
docker build -t ayu-app .
docker run -d \
  -p 8000:8000 \
  -e DATABASE_URL="postgresql://user:password@db-host:5432/hospital" \
  --env-file .env \
  ayu-app
```

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

- [ ] Set strong secrets for `SESSION_PEPPER` and `ADMIN_ROUTE_AUTH_SECRET` in `.env`
- [ ] Set `SESSION_COOKIE_SECURE=true` for HTTPS
- [ ] Configure `CORS_ALLOWED_ORIGINS` for your production domains
- [ ] Configure `DATABASE_URL` pointing to your PostgreSQL instance
- [ ] Set up reverse proxy (Nginx / Caddy / Cloudflare) with TLS on port 80/443
- [ ] Configure automated PostgreSQL backup schedule

---

## Design Notes

### Unified Process Serving
`frontend/dist/` is pre-compiled and committed to the repository. The backend FastAPI process directly serves static assets and SPA client routing via `StaticFiles` and `FileResponse`, removing the need for a separate Node.js runtime in production.

### ORM vs. Raw SQL
- **ORM (SQLAlchemy 2.0):** Used for standard CRUD, module relationships, authentication, and state management.
- **Raw Parameterized SQL:** Used for business-critical calculations in `legacy_queries.py` and `billing_service.py` (stock FIFO/FEFO ledger calculations, cashier drawer balancing, invoice settlements, revenue reporting).
