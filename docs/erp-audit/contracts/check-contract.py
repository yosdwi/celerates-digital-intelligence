"""Validate proposed envelopes/negative fixtures, NOT a live ERP contract.

Requires Python 3 and jsonschema. Run from any working directory.
No network calls, ERP dependencies or operational data are used.
"""
import copy
import json
import re
from datetime import datetime
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

root = Path(__file__).resolve().parent
schema = json.loads((root / "erp-intelligence-v1.schema.json").read_text())
fixtures = json.loads((root / "fixtures.json").read_text())
Draft202012Validator.check_schema(schema)
formats = FormatChecker()

@formats.checks("date-time")
def rfc3339_datetime(value):
    # Keep this check active even without jsonschema's optional format packages.
    if not isinstance(value, str):
        return True
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})", value):
        return False
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).tzinfo is not None
    except ValueError:
        return False

validator = Draft202012Validator(schema, format_checker=formats)
checks = []
for name, value in fixtures.items():
    validator.validate(value)
    checks.append(f"valid {name} envelope")

def rejects(label, fixture, edit):
    value = copy.deepcopy(fixtures[fixture])
    edit(value)
    if validator.is_valid(value):
        raise AssertionError(f"Expected invalid envelope: {label}")
    checks.append(f"rejects {label}")

rejects("forbidden command kind", "command", lambda v: v.update(kind="payroll.update"))
rejects("missing approval reference", "command", lambda v: v.pop("approval_id"))
rejects("invalid approval UUID", "command", lambda v: v.update(approval_id="approved by AI"))
rejects("model-supplied actor", "command", lambda v: v.update(actor="owner"))
rejects("zero expected version", "command", lambda v: v.update(expected_version=0))
rejects("missing target on update", "command", lambda v: v.update(target=None))
rejects("existing target on create", "command", lambda v: v.update(kind="task.create"))
rejects("unknown event", "event", lambda v: v.update(event_type="anything.changed"))
rejects("invalid event timestamp", "event", lambda v: v.update(occurred_at="yesterday"))
rejects("untyped aggregate", "event", lambda v: v["aggregate"].pop("type"))
rejects("missing provenance", "read", lambda v: v.update(source_refs=[]))
rejects("unsupported schema version", "read", lambda v: v.update(schema_version="2.0"))

create = copy.deepcopy(fixtures["command"])
create.update(kind="task.create", target=None, expected_version=None,
              payload={"title": "Synthetic reviewed task"})
validator.validate(create)
checks.append("valid create envelope")
print(json.dumps({"scope": "Proposed common envelopes only; no provider or authorization proof",
                  "checks_passed": len(checks), "checks": checks}, indent=2))
