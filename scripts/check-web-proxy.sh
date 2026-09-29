#!/bin/sh
set -eu
# Disposable CI network; replacing API IP must not require restarting the web.
trap 'docker rm -f cdi-proxy-web cdi-proxy-api >/dev/null 2>&1 || true; docker network rm cdi-proxy-test >/dev/null 2>&1 || true' EXIT
docker build -f apps/web/Dockerfile -t cdi-proxy-web:test .
docker network create --subnet 172.28.101.0/24 cdi-proxy-test
docker run -d --name cdi-proxy-api --network cdi-proxy-test --ip 172.28.101.2 --network-alias cdi-upstream -e INSTANCE=first -v "$PWD/apps/web/tests/proxy-fixture.py:/fixture.py:ro" python:3.12-alpine python /fixture.py
docker run -d --name cdi-proxy-web --network cdi-proxy-test --ip 172.28.101.4 -p 127.0.0.1:4180:80 -e API_UPSTREAM=http://cdi-upstream:8000 cdi-proxy-web:test
check_instance() {
  python - "$1" <<'PY'
import json,sys,time,urllib.request
for attempt in range(25):
    try:
        req=urllib.request.Request('http://127.0.0.1:4180/api/knowledge?scope=sales',headers={'Authorization':'Bearer synthetic'})
        with urllib.request.urlopen(req,timeout=3) as response:data=json.load(response)
        if data['instance']==sys.argv[1]:
            assert data['path']=='/api/knowledge?scope=sales' and data['authorized']
            print('PASS proxy instance:',data['instance']);break
    except Exception:pass
    time.sleep(1)
else:raise SystemExit('Proxy did not resolve the replacement API')
PY
}
check_instance first
docker rm -f cdi-proxy-api
docker run -d --name cdi-proxy-api --network cdi-proxy-test --ip 172.28.101.3 --network-alias cdi-upstream -e INSTANCE=second -v "$PWD/apps/web/tests/proxy-fixture.py:/fixture.py:ro" python:3.12-alpine python /fixture.py
check_instance second
