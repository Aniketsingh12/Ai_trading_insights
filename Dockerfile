# Single-service image: builds the React app, then serves it from FastAPI.
# One container, one URL, no CORS between frontend and backend.

# ---------- stage 1: build the frontend ----------
FROM node:20-slim AS web
WORKDIR /web

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci

COPY frontend/ ./
# Same-origin in this deployment: the app calls /api on its own host, so
# VITE_API_URL is intentionally left unset here.
RUN npm run build

# ---------- stage 2: python runtime ----------
FROM python:3.11-slim AS runtime
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
# main.py serves this directory when it exists.
COPY --from=web /web/dist ./static

EXPOSE 8000
# Railway/Render inject $PORT; default to 8000 for a plain `docker run`.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
