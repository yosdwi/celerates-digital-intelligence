# ADR-005: Pull the pinned MinIO image from Quay

Status: Accepted — 2026-09-22

GitHub Actions and Railway could not pull `minio/minio:RELEASE.2025-04-22T22-12-26Z` from Docker Hub. The registry returned access denied. The identical release on `quay.io/minio/minio` successfully deployed on Railway.

Use `quay.io/minio/minio:RELEASE.2025-04-22T22-12-26Z` for Compose and Railway. This resolves a packaging blocker; MinIO/S3 object storage, document provenance, and the repository's other architecture decisions remain unchanged. Durable volumes are required for both PostgreSQL and MinIO before deployment acceptance.
