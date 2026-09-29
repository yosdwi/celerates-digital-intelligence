# Python Integration Worker

The worker is a separate **process/container** sharing the versioned `cdi` Python package with the API. This avoids duplicated domain code in a P0 monorepo.

- `python -m cdi.worker`: claim durable PostgreSQL jobs, ingest documents, run/resume LangGraph.
- `python -m cdi.intake samples/customers.csv --entity customer`: extract, normalize and validate without changing ERP.
- Add `--approve` to load a fully valid batch through the ERP action adapter.
- Connectors: `FileSource`, `RestSource`, `PostgresSource`; explicit `SQLServerSource` / `JiraSource` placeholders.

No critical integration rule belongs in n8n. The optional n8n example invokes the typed document-registration boundary only.
