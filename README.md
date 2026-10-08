# HospAI — FastAPI Backend (converted from Flask)

This is the Flask backend converted to **FastAPI**, mounted with the same React/Vite
frontend, running as a single `uvicorn` process.

## What changed

- **`backend/models.py`** — every table (115 of them) as a SQLAlchemy ORM model,
  reflected directly from your restored Postgres database, so it matches your real
  schema exactly (not hand-typed).
- **`backend/database.py`** — SQLAlchemy engine/session + the `get_db()` FastAPI
  dependency (`Depends(get_db)`), reading `DATABASE_URL` from `.env` exactly like before.
- **`backend/security.py`** — the auth/session/permission layer (login, sessions,
  hospitals, default seed users), rewritten as real `db.query(Model)` ORM code.
- **`backend/routers/`** — one FastAPI router per module (auth, patients, clinical,
  employees/bed, billing, pharmacy, lab/OT/accounts/HR, reports/exports), together
  covering all of the original app's ~220 endpoints, each using
  `Depends(get_db)` / `Depends(require_permissions(...))` for dependency injection.
- **`backend/legacy_queries.py`** / **`backend/legacy_sql.py`** — see "Design note" below.
- **`backend/main.py`** — the FastAPI app: CORS, all routers, the global exception
  handler, and the static file mount that serves the built frontend from
  `frontend/dist/`, with SPA fallback to `index.html` for client-side routes —
  so `uvicorn main:app` serves *both* API and UI on one port, same as the original.

## Design note: where `db.query()` vs. raw SQL is used

Per what we agreed: straightforward, single/two-table CRUD (departments, lab
vendors, OT theatres, accounts ledger, HR attendance/payroll/leaves, vendor
payments, doctor payouts, employees, sessions, hospitals, etc.) is written as
genuine SQLAlchemy ORM (`db.query(Model)...`) directly in the routers and in
`security.py`.

The original app's `utils/database.py` (9,400+ lines, 212 functions) contains a
lot of hand-written, business-critical SQL — patient UHID generation, pharmacy
dispensing/stock ledger, invoice/insurance settlement, revenue and dashboard
aggregates, supplier ledgers, etc. Rather than blindly re-deriving all of that
by hand under time pressure (real risk of subtle billing/clinical bugs), it was
mechanically ported into `legacy_queries.py`: same SQL, same logic, but running
through the **one FastAPI-injected `db` session** (never a second connection)
via a small compatibility shim in `legacy_sql.py`. This was explicitly agreed
as the approach for "complex aggregate queries."

This has been tested end-to-end against your actual restored data (login,
patients, dashboard analytics, pharmacy summary, reports overview, accounts,
HR, lab, OT, billing all verified returning real records).

## What was simplified

A handful of **export/print** endpoints (`/api/dashboard/export/pdf`, the
custom "standard module" PDF export) originally built a very specific branded
PDF layout with dozens of one-off SQL queries embedded directly in `app.py`.
These were re-implemented to produce the same *data* (dashboard revenue/payment
figures, reports overview) as working PDF/CSV/Excel downloads, but using a
simpler generic layout rather than reproducing the exact original pixel-level
PDF design. Also, the original code registered **two** handlers for
`GET /api/reports/export/pdf` (a leftover duplicate — the first one silently
shadowed the second); this was consolidated into one.

## Running it

```bash
cd HospAI-FastAPI
python -m venv .venv && source .venv/bin/activate      # or your preferred way
pip install -r backend/requirements.txt
# .env is already in the project root and in backend/ with your provided values
uvicorn main:app --reload --app-dir backend
```

Then open `http://127.0.0.1:8000/` — the frontend is served from there, and it
talks to `/api/...` on the same origin. Default seed accounts (created on first
run if they don't already exist):

- `employee` / `employee123` (admin)
- `staff` / `staff123`
- `pharmacy` / `pharmacy123`

## Database

`backups/hospai_postgres_backup_fastapi.sql` (and `.dump`) is a fresh dump of
the exact same schema plus your existing data (patients, invoices, employees,
etc. all carried over — no schema changes were made). Restore it into a local
Postgres and point `DATABASE_URL` at it:

```bash
createdb hospai
psql -d hospai -f backups/hospai_postgres_backup_fastapi.sql
# or, from the .dump (pg_restore custom format):
pg_restore --no-owner -d hospai backups/hospai_postgres_backup_fastapi.dump
```

Update the password/host/port in `.env`'s `DATABASE_URL` to match your local
Postgres instance.
