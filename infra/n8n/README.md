# Optional supporting automation

Start `docker compose --env-file .env -f infra/docker-compose.yml --profile automation up -d n8n` and open http://localhost:5678. Configure the owner account. Import `register-source.example.json`.

Before activation, bind both placeholder header credentials: an inbound webhook secret and `Authorization: Bearer <API_ACCESS_TOKEN>` for the Intelligence API. Set the same API token in the application environment. The example is intentionally inactive until these credentials are supplied.

Input: `{ "opportunity_id": "OPP-001", "name": "brief.md", "text": "Actual source content, at least 20 characters", "source_url": "https://original.example/reference" }`.

The workflow only registers evidence through Python. It never approves a pack, writes arbitrary ERP records, or sends an external message. P0 stores source URLs as provenance and does not fetch them.
