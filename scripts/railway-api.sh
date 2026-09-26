#!/bin/sh
set -eu
python -m cdi.migrate
if [ "${ERP_MODE:-demo}" = demo ]; then
  python -m cdi.seed
fi
exec uvicorn cdi.api:app --host 0.0.0.0 --port "${PORT:-8000}"
