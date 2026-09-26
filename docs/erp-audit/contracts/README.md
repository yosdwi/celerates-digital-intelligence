# Proposed envelope checks

These are synthetic checks of the common v1 contract envelopes, not tests of a deployed ERP API. Resource DTOs and strict per-command payload schemas, authentication, authorization, persistence and replay integration tests remain implementation work.

Use a disposable Python environment; the audit used Python 3.12 and `jsonschema==4.26.0`:

```bash
python -m venv /absolute/scratch/erp-contract-check
/absolute/scratch/erp-contract-check/bin/python -m pip install jsonschema==4.26.0
/absolute/scratch/erp-contract-check/bin/python docs/erp-audit/contracts/check-contract.py
```

The checker includes its own RFC3339 date-time format check so missing optional format-validation packages cannot silently accept invalid timestamps. Sixteen positive/negative checks pass in [contract-check.json](../evidence/contract-check.json). No network or live data is used by the checker itself.
