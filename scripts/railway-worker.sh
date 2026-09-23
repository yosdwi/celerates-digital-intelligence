#!/bin/sh
set -eu
python - <<'PY'
import os,time,urllib.request
url=os.environ.get('INTELLIGENCE_API_INTERNAL_URL','http://intelligence-api.railway.internal:8000')+'/ready'
for attempt in range(180):
    try:
        urllib.request.urlopen(url,timeout=5)
        break
    except Exception:
        time.sleep(2)
else:
    raise RuntimeError('Intelligence API migrations/seed are not ready')
PY
exec python -m cdi.worker
