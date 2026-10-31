# syntax=docker/dockerfile:1
# =============================================================================
# Frontend (React + Vite) - multi-stage image served by nginx
#   build context: ./frontend
# =============================================================================

# ---- Stage 1: install dependencies (cached separately from source) ----------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- Stage 2: build the static bundle ----------------------------------------
FROM deps AS build

# Build-time settings. Branding values are optional: empty means the defaults
# in src/lib/clinicConfig.ts are used.
ARG VITE_API_BASE=/api
ARG VITE_CLINIC_NAME=
ARG VITE_CLINIC_TAGLINE=
ARG VITE_DOCTOR_NAME=
ARG VITE_DOCTOR_QUALIFICATIONS=
ARG VITE_DOCTOR_REG_NO=
ARG VITE_CLINIC_ADDRESS_LINE1=
ARG VITE_CLINIC_ADDRESS_LINE2=
ARG VITE_CLINIC_ADDRESS_LINE3=
ARG VITE_CLINIC_PHONE=
ARG VITE_CLINIC_EMAIL=
ARG VITE_DEFAULT_PHARMACY_NAME=
ENV VITE_API_BASE=$VITE_API_BASE \
    VITE_CLINIC_NAME=$VITE_CLINIC_NAME \
    VITE_CLINIC_TAGLINE=$VITE_CLINIC_TAGLINE \
    VITE_DOCTOR_NAME=$VITE_DOCTOR_NAME \
    VITE_DOCTOR_QUALIFICATIONS=$VITE_DOCTOR_QUALIFICATIONS \
    VITE_DOCTOR_REG_NO=$VITE_DOCTOR_REG_NO \
    VITE_CLINIC_ADDRESS_LINE1=$VITE_CLINIC_ADDRESS_LINE1 \
    VITE_CLINIC_ADDRESS_LINE2=$VITE_CLINIC_ADDRESS_LINE2 \
    VITE_CLINIC_ADDRESS_LINE3=$VITE_CLINIC_ADDRESS_LINE3 \
    VITE_CLINIC_PHONE=$VITE_CLINIC_PHONE \
    VITE_CLINIC_EMAIL=$VITE_CLINIC_EMAIL \
    VITE_DEFAULT_PHARMACY_NAME=$VITE_DEFAULT_PHARMACY_NAME

COPY . .
RUN npm run build

# ---- Stage 3: nginx runtime (static files + /api reverse proxy) -------------
FROM nginx:1.29-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
