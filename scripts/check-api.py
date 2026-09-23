"""A dependency-free Compose smoke check; exits nonzero if the functional seed is broken."""
import json
import os
import urllib.request

base = os.getenv('CDI_API_URL', 'http://localhost:8000')
def read(path):
    with urllib.request.urlopen(base + path, timeout=10) as response:
        return json.load(response)

assert read('/ready')['status'] == 'ready'
items = read('/api/opportunities')['items']
assert len(items) >= 3
assert {i['status'] for i in items} >= {'NEW', 'CLARIFICATION_REQUIRED', 'READY_FOR_SALES'}
ready = read('/api/opportunities/OPP-003')
assert len(ready['artifacts']) == 11
assert all(a['review_state'] == 'APPROVED' for a in ready['artifacts'])
assert ready['run']['state'] == 'READY_FOR_SALES'
print('P0 smoke passed: readiness, seeded states, 11 reviewed artifacts and ERP outcome.')
