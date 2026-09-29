# P0 verification record

## Observed locally

- React/TypeScript production build passes.
- Ruff source/test checks pass.
- PostgreSQL migration including pgvector and LangGraph checkpoint tables executes successfully.
- 13 backend integration tests pass: complete workflow, persisted edit versions, stale-review rejection, clarification cycles, source upload validation, source-owned facts, model and ERP retry, negative ERP acknowledgement, scoped retrieval, approved intake and replay, HTTP adapter shape, workspace token gate, and worker claim.
- Demo seed executes real workflows to create the New / Clarification Required / Ready for Sales states; 11 artifacts are persisted for each analyzed opportunity.

## Local runtime constraints

This execution environment does not provide Docker or a native PostgreSQL daemon. Local database verification used a PostgreSQL WASM build with pgvector over the PostgreSQL wire protocol, exercising the same migrations, psycopg SQL and LangGraph PostgreSQL saver. Filesystem object storage was explicitly selected for those tests. This is a verification harness outside the repository; it is not the shipped deployment architecture.

Chromium initialization is constrained in this execution environment, so local browser acceptance has not yet completed. Browser tests are committed and Railway/live verification is being performed separately. A native PostgreSQL + MinIO + full Compose browser run is also configured in GitHub Actions.

Real ERP/model-provider credentials were not supplied. Connected adapters are implemented but live production compatibility is not claimed. Docling PDF parsing may require its first-use model downloads.

## Deployment verification

Railway deployment is in progress at the user's explicit request. Final service health, live URL and observed browser results will be recorded here after deployment.
