# ERP Snapshot Reference

This directory tracks the ERP source snapshot used for the Celerates Digital Intelligence ERP audit and production-readiness workstream.

## Snapshot expected

- File: `celerates-erp-main.zip`
- Source repository supplied by stakeholder: `abirohmattest/celerates-erp`
- Snapshot date supplied in working session: 2026-09-23
- Local snapshot size: 1,770,780 bytes (~1.7 MB)
- SHA-256: `7c022ed3dd7759fb3317cbd9eebde882050f13a45b865ccc75e37b87f04ddee7`
- ZIP entries: 542

Top-level contents observed in the snapshot:

- `.claude/`
- `src/`
- `public/`
- `messages/`
- `package.json`
- `package-lock.json`
- `drizzle.config.ts`
- `next.config.mjs`
- `tsconfig.json`

The snapshot contains approximately 277 `.tsx` files and 128 `.ts` files, plus supporting assets/configuration.

## Purpose

The snapshot is a **read-only audit input**. It is not the canonical ERP repository and must not be treated as the production source of truth.

Use it to:

1. independently audit the current ERP implementation;
2. reconstruct the as-is business and technical architecture;
3. assess production/deployment readiness;
4. define the Google Sheets -> ERP transition and cut-over approach;
5. define ERP read/event/action contracts for the Intelligence Layer;
6. prepare a Railway production-like deployment plan;
7. design a user-review / BA requirement-delta feedback loop;
8. produce an implementation backlog before changing ERP code.

## Important rules

- Do not silently rewrite or modernize the ERP while auditing it.
- Separate observed facts from recommendations.
- Preserve current business flows unless a change is backed by user feedback, stakeholder direction, a security/reliability defect, or a documented architecture reason.
- Do not make the Intelligence Layer query or write arbitrary ERP tables directly. The target integration is a controlled ERP adapter/API boundary.
- Google Sheets and other current sources are transitional; the target operating model is ERP as the primary operational workspace.
- Do not infer that NocoDB is part of this snapshot unless source evidence is found. Stakeholder discussion mentioned NocoDB, but the inspected ZIP did not show an explicit NocoDB code dependency.

## Binary snapshot note

The GitHub connector used by ChatGPT can create text files and Git objects but does not expose a direct mounted-file upload parameter for arbitrary binary ZIP files. The binary snapshot should be placed at this exact path when uploaded manually or by a Git-capable runner:

`references/erp/celerates-erp-main.zip`

Before using it, verify the SHA-256 above.

The audit handoff is in [`../../HANDOFF-ERP-AUDIT-ASTRA.md`](../../HANDOFF-ERP-AUDIT-ASTRA.md).
