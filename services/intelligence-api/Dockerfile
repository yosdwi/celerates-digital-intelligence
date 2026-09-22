FROM python:3.12-slim
WORKDIR /workspace
COPY --from=ghcr.io/astral-sh/uv:0.12.17 /uv /usr/local/bin/uv
COPY services/intelligence-api/pyproject.toml services/intelligence-api/uv.lock services/intelligence-api/
COPY services/intelligence-api/cdi services/intelligence-api/cdi
RUN uv sync --project services/intelligence-api --frozen --no-dev
# Docling is installed for the standard Compose path. CPU wheels avoid CUDA libraries.
RUN uv pip install --python services/intelligence-api/.venv/bin/python --torch-backend=cpu 'docling==2.129.0'
COPY infra/postgres infra/postgres
COPY samples samples
COPY scripts scripts
ENV PATH="/workspace/services/intelligence-api/.venv/bin:$PATH" PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["uvicorn","cdi.api:app","--host","0.0.0.0","--port","8000"]
