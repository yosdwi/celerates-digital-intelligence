"""Read-only deployment check. Run inside the Intelligence image; never prints credentials or records."""
import argparse
import json

import httpx

from cdi.config import settings
from cdi.db import connect, one
from cdi.erp import erp
from cdi.storage import storage

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--web-base-url', required=True, help='Trusted operator-configured HTTPS web origin')
args = parser.parse_args()
if not args.web_base_url.startswith('https://'):
    raise SystemExit('An HTTPS web origin is required')
cfg = settings()
assert cfg.erp_mode == 'http', 'ERP must be connected; demo is not an integration check'
assert cfg.api_access_token, 'This deployment check requires the configured pilot credential'
with connect() as conn:
    conn.execute('SET TRANSACTION READ ONLY')
    migration = one(conn, 'SELECT name,sha256 FROM schema_migrations WHERE name=%s', ('002_closed_loop_foundation.sql',))
    assert migration and migration['sha256'], 'Foundation migration/checksum missing'
    assert one(conn, "SELECT extversion FROM pg_extension WHERE extname='vector'"), 'pgvector missing'
storage().healthy()
resources = erp().list('opportunity')
with httpx.Client(base_url=args.web_base_url.rstrip('/'), timeout=30) as client:
    public = client.get('/api/opportunities')
    assert public.status_code == 401, 'Anonymous operational access must be denied'
    headers = {'Authorization': 'Bearer ' + cfg.api_access_token}
    response = client.get('/api/system', headers=headers)
    response.raise_for_status()
    system = response.json()
    assert system['erp'] == 'http' and not system['demo'], 'Public proxy did not reach the connected API'
    for path in ['/api/opportunities', '/api/knowledge', '/api/outcomes']:
        response = client.get(path, headers=headers)
        response.raise_for_status()
        assert isinstance(response.json()['items'], list), 'Invalid public API contract'
print(json.dumps({'check':'closed-loop-runtime','status':'PASS','erp_mode':cfg.erp_mode,
                  'model_mode':system['model_mode'],'granted_opportunities':len(resources),
                  'migration':migration['name'],'storage':'healthy','anonymous_access':public.status_code,
                  'public_authenticated_routes':'opportunities, knowledge, outcomes'}))
