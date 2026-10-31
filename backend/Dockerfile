# syntax=docker/dockerfile:1
# =============================================================================
# Backend (FastAPI) - multi-stage image
#   build context: ./backend
# =============================================================================

# ---- Stage 1: install Python dependencies into an isolated virtualenv --------
FROM python:3.13-slim AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /build
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# ---- Stage 2: slim runtime ---------------------------------------------------
FROM python:3.13-slim AS runtime

# The slim base image already ships zone data, so TZ resolves without apt.
# TZ only affects process-level clocks/logs. Application timestamps are always
# IST regardless (see README "Time Zones").
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    TZ=Asia/Kolkata \
    PORT=8000 \
    WEB_CONCURRENCY=2

RUN useradd --create-home --uid 10001 appuser

WORKDIR /app
COPY --from=builder /opt/venv /opt/venv
COPY --chown=appuser:appuser . .
RUN mkdir -p /app/uploads && chown -R appuser:appuser /app/uploads

USER appuser
EXPOSE 8000

# No curl in the slim image: probe with the Python stdlib instead.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["python", "-c", "import os, urllib.request; urllib.request.urlopen(f\"http://127.0.0.1:{os.environ.get('PORT', '8000')}/api/health\", timeout=4)"]

# Schemas and migrations are applied automatically on startup (init_db.py).
CMD ["sh", "-c", "exec gunicorn main:app -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:${PORT} --workers ${WEB_CONCURRENCY} --timeout 120 --access-logfile -"]
