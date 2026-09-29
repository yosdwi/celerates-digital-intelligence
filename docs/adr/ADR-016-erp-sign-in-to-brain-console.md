# ADR-016 — ERP sign-in to the Brain Console

Status: accepted (2026-09-26). Extends ADR-008 (ERP-issued user delegation).

## Context

The Brain Console's Agent & learning view — runs, feedback, evaluation — is for managers who work in ERP. Until now it needed a shared workspace token. Sharing that token is a distribution and revocation problem, and it also grants Pre-Sales review and knowledge approval.

## Decision

1. **ERP issues a console sign-in to Owners.**
   - `GET /api/agent/console` (ERP session, Owner only) mints an Ed25519 assertion with the same key as ADR-008:
     - `aud = celerates-intelligence-console`;
     - `scope = ["console"]`;
     - lifetime 2 h (Intelligence accepts at most 8 h).
   - ERP answers with a `303` to `{INTELLIGENCE_CONSOLE_URL or INTELLIGENCE_BASE_URL}/app/agent#erp_token=…`.
   - The token is in the URL fragment, which browsers never send to a server. The Intelligence web stores it for the tab (`sessionStorage`) and removes it from the address bar and history.
2. **Intelligence accepts it only for the Brain Console Agent views.**
   - The console routes accept either a curator workspace token or a verified console sign-in: issuer, audience, scope, lifetime and Owner flag are all checked.
   - The sign-in is **not** a workspace principal, so Pre-Sales review and knowledge approval still require a named workspace token.
   - It is **not** an Agent delegation (different audience and scope).
3. **The web shows only Agent & learning** for an ERP sign-in. The ERP Agent panel shows Owners a *Brain Console* link.

## Consequences

- Managers open the console from ERP with their own identity. Revoking ERP access stops new sign-ins, and an issued sign-in expires within 2 hours.
- There is no revocation list for already-issued sign-ins. The short lifetime bounds exposure, and a denylist by `jti` can be added if needed.
- No new secret: the existing delegation key pair signs and verifies.
