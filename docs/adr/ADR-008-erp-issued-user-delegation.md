# ADR-008 — ERP-issued user delegation for the embedded Agent

Status: accepted for Operating Substrate M1 (2026-09-26). Supersedes nothing; narrows how ADR-007 grants apply to interactive use.

## Context

The Agent runs inside ERP pages, but its reasoning, retrieval and run history live in the Intelligence service. Until now Intelligence knew only two identities:

- configured workspace principals, a long-lived token typed into the Intelligence web;
- a single ERP machine principal, `intelligence-pilot`, whose reads are limited to Owner-granted Sales records.

Neither identifies the ERP user who is asking. A long-lived secret must not reach ERP browsers.

## Decision

1. **ERP is the issuer.** An ERP server route (the Agent BFF, `/api/agent/*`) authenticates the NextAuth session through the existing Owner-pilot guard. It then mints a **delegation assertion**: a compact JWS signed with Ed25519 (`alg=EdDSA`, `kid`).
   - Claims: `iss=celerates-erp:<environment>`, `aud=celerates-intelligence`, `sub=<users.id>`, `name`, `owner`, `access[{division,level}]`, `scope=["agent"]`, `ctx{path,module,entity}`, `iat`, `exp` (≤ 5 minutes), `jti`.
   - The private key exists only in ERP (`AGENT_DELEGATION_PRIVATE_KEY`, `AGENT_DELEGATION_KID`).
2. **The browser never sees it.** It travels only server-to-server: BFF → Intelligence, and Intelligence → ERP contract.
3. **Intelligence verifies, never mints.**
   - It holds public keys only (`ERP_DELEGATION_PUBLIC_KEYS`, JSON `kid → PEM`) and checks signature, issuer, audience, lifetime and scope.
   - It maps the assertion to a *delegated principal* (`erp:<sub>`, role `agent`). A delegated principal cannot use workspace review/curation routes, and `curator` is never derived.
4. **ERP re-authorizes every delegated call.**
   - Intelligence calls `/api/integration/v1/agent/*` with the machine read token **and** the assertion (`X-ERP-Delegation`).
   - ERP verifies its own signature, reloads the user from the database (active status, Owner flag, division access) and applies the existing module policy (`canReadModule`).
   - Claims inside the assertion are never trusted for authorization by ERP.
5. **Interactive reads use user authority instead of record grants.** For `agent/*` reads the present user's current ERP authority replaces the Owner record grant. Grants remain mandatory for unattended service access (Pre-Sales worker, event feed); nothing in the existing contract changes.
6. **Fail closed and degrade gracefully.**
   - Missing keys → the Agent BFF returns 503 and the panel keeps `Perlu perhatian` and `Masukan` working exactly as before.
   - Bad signature, audience, issuer, lifetime, or an inactive user → 401/403, no data.

## Consequences

- The manual workspace token is no longer needed for the Agent. The Intelligence web keeps it until Console sign-in is built.
- The Owner-only pilot boundary is unchanged: only users admitted by ERP middleware can obtain an assertion.
- Asymmetric keys mean a compromised Intelligence service cannot forge ERP users.
- Key rotation: add the new public key to Intelligence, switch ERP `kid`/private key, then remove the old key. ERP accepts previous keys listed in `AGENT_DELEGATION_PREVIOUS_PUBLIC_KEYS`.
- Assertions carry no write scope in M1. Writes arrive with ERP-held proposals (ADR-010, not yet required); replay protection by `jti` becomes mandatory then.
