FROM python:3.12-slim

WORKDIR /app

# Install uv
# Pin uv version to avoid supply-chain attacks via :latest
COPY --from=ghcr.io/astral-sh/uv:0.7.8 /uv /usr/local/bin/uv

# Create non-root user
RUN groupadd --gid 1001 appgroup && \
    useradd --uid 1001 --gid appgroup --shell /bin/bash --create-home appuser

COPY pyproject.toml uv.lock* ./
RUN uv sync --frozen --no-dev

COPY . .

RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 8000
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
