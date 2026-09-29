"""Run with the API environment installed; no database connection is required."""
import json
from pathlib import Path
from cdi.api import app
root = Path(__file__).resolve().parents[1]
(root / 'packages/contracts/openapi.json').write_text(json.dumps(app.openapi(), indent=2) + '\n')
print('Exported packages/contracts/openapi.json')
