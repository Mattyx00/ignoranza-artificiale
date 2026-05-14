# ---------------------------------------------------------------------------
# Stage 1 — builder
# Install Python dependencies with uv into an isolated virtual environment.
# uv, pyproject.toml, and uv.lock are NOT copied to the final image.
# ---------------------------------------------------------------------------
FROM python:3.14-slim AS builder

WORKDIR /build

# Pin uv version to avoid supply-chain attacks via :latest
COPY --from=ghcr.io/astral-sh/uv:0.7.8 /uv /usr/local/bin/uv

COPY pyproject.toml uv.lock* ./

# Install production dependencies directly into /opt/venv so shebangs are correct at runtime.
ENV UV_PROJECT_ENVIRONMENT=/opt/venv
RUN uv sync --frozen --no-dev

# ---------------------------------------------------------------------------
# Stage 2 — runner
# Minimal image: only the virtualenv and application source code.
# No uv, no pyproject.toml, no uv.lock, no build toolchain.
# ---------------------------------------------------------------------------
FROM python:3.14-slim AS runner

WORKDIR /app

# Create non-root user — same UID/GID as the builder stage for consistency.
RUN groupadd --gid 1001 appgroup && \
    useradd --uid 1001 --gid appgroup --shell /bin/bash --create-home appuser

# Copy the pre-built virtual environment to /opt/venv — outside the bind-mounted /app.
COPY --from=builder /opt/venv /opt/venv

# Copy only the application source code and agent definitions.
COPY app/ ./app/
COPY agents/ ./agents/
COPY alembic/ ./alembic/
COPY alembic.ini ./alembic.ini
COPY entrypoint.sh ./entrypoint.sh

RUN chmod +x ./entrypoint.sh && \
    chown -R appuser:appgroup /app
USER appuser

# /opt/venv is owned by root but readable by all — that's fine for execution.
ENV PATH="/opt/venv/bin:$PATH"

EXPOSE 8000
CMD ["bash", "./entrypoint.sh"]
