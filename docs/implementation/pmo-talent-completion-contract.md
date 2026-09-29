# PMO and Talent completion: contract additions (doc 22, P2 and P3)

This file is the coordination contract between the Celerates and ConForm work streams of [doc 22](../22-pmo-talent-operational-completion.md). It extends `/api/celerates/v1`. The rules of `celerates-bast-digital/docs/celerates-integration-v1.md` still apply unless a section below says otherwise: bearer token, `X-Celerates-Actor` on mutations, `Idempotency-Key` on mutations, and the error envelope.

## 1. `GET /talents/attendance?employee_id&year&month` — the Talent's daily attendance log

- **Period.** `year` and `month` name a Payroll cycle, as for `/talents/requirements`; the closing day is 20. Omitting both means the current cycle.
- **Data.** Read-only. It reuses the Payroll projection, the `attendance` rows and the corrections; it adds no rule.
- **Status codes.** `404 talent_not_found`.

```json
{"employee_id":"…","cycle":{…Cycle…},"source":"conform:pama","evaluated_through":"2026-09-20",
 "days":[{"work_date":"2026-09-01","check_in":"07:58","check_out":"17:02","origin":"pipeline",
          "state":"complete","gap":null,"reason":"…raw AttendanceClosingReason…",
          "evidence_count":0,
          "correction":{"id":"…","status":"approved","resolution_type":"missing_clock_in","absence_type":null,
                        "proposed_check_in":"08:00","proposed_check_out":null,"rejection_reason":null}}]}
```

Field notes:
- **`days`:** one entry per date in the cycle up to `evaluated_through`, ascending.
- **`check_in` / `check_out`:** `HH:MM` in Asia/Jakarta, or `null`.
- **`origin`:** `pipeline`, `manual`, or `null` when there is no source row.
- **`state`:** one of the following.

  | Value | Meaning |
  |---|---|
  | `complete` | Nothing needed. |
  | `needs_action` | The Talent must act, as in `/talents/requirements`. |
  | `waiting_review` | A correction is submitted and waits for PMO. |
  | `excused` | An approved absence: sakit, izin, cuti or libur. |
  | `unverified` | The source has not confirmed the day yet. |
  | `not_required` | A weekend or holiday with no requirement. |

- **`gap`:** `missing_clock_in`, `missing_clock_out`, `missing_both`, or `null`.
- **`correction`:** the latest correction for the day, or `null`.

## 2. Task list and task evidence (Talent Mobile rules, unchanged)

The period is the BAST **calendar month** (`year`, `month`), which is the same period Talent Mobile uses for tasks. Omitting both means the current month.

### `GET /talents/tasks?employee_id&year&month`

```json
{"employee_id":"…","period":{"year":2026,"month":9,"start":"2026-09-01","end":"2026-09-30","label":"September 2026"},
 "summary":{"total":14,"complete":11,"missing":3,"staged":1},
 "items":[{"task_key":"…","title":"…","work_date":"2026-09-03","task_source":"redmine","status":"Closed",
           "evidence_count":0,"staged_count":1,"complete":false}]}
```

- Items are ordered with missing ones first, then by `work_date` descending.

### `POST /talents/tasks/{task_key}/evidence`

- Multipart fields: `employee_id`, `year`, `month`, `file`, and optional `caption`. `Idempotency-Key` is required.
- Response: `201 {"status":"staged"|"already_present"}`.
- Errors:

  | Status | Code |
  |---|---|
  | 404 | `task_not_found` |
  | 409 | `task_changed` |
  | 413 | `file_too_large` |
  | 415 | `unsupported_type` |

### `POST /talents/tasks/submit`

- JSON body: `{employee_id, year, month}`. `Idempotency-Key` is required.
- Response: `200 {"status":"submitted","count":N}`.
- Errors: `409 nothing_staged`, or `409 task_changed`.
- The audit actor is `X-Celerates-Actor`, for example `celerates-talent:<uuid>`.

Task evidence has **no PMO approval**, which is the existing behaviour.

## 3. Links without expiry

- `expires_at` is **nullable** everywhere a link is passed: campaign `approve` `links[]` and the direct message below.
- `null` means the link never expires by time. Celerates enforces single use and supersession.
- Dispatch skips a link for expiry only when `expires_at` is non-null and in the past.

## 4. `POST /talents/messages` — direct message to one Talent (PMO action, "Kirim pengingat" and test send)

- **Body:** `{employee_id, year, month, link:{url, expires_at|null}}`. `Idempotency-Key` is required.
- **Prefix check:** `url` must start with `CELERATES_PUBLIC_URL` when that setting is configured.
- **Message.** One personal DM to the bound JID.
  - Content: a greeting with the Talent's name, then the open attendance days in the cycle and the tasks without evidence in the month, then the link.
  - With nothing open, the message says everything is complete and still carries the link.
  - The message carries no ids, JIDs or phone numbers.
- **Checks before sending:**
  1. The kill switch → `409 kill_switch`.
  2. WhatsApp binding → `409 not_bound`.
  3. A direct message to the same employee in the last **10 minutes** → `409 recently_sent`.

  The campaign sending window does **not** apply: this is a single, human-initiated message.
- **Sending:** through the existing bridge gateway with `request_id = celerates-direct:<id>`.
- **Transport outcomes:**

  | Outcome | Response |
  |---|---|
  | `bridge_unavailable` | `503 transport_unavailable` (retryable) |
  | `bridge_auth_failed` | `503 transport_auth_failed` |
  | `delivery_outcome_unknown` | `202 {"status":"unknown"}` |

- **Response:** `201 {"status":"sent","message_id":"<id>","sent_at":"…"}`.
- **Audit.** The message is recorded in a new table, `celerates_direct_messages`.
- **Dedupe with campaigns.** A direct message counts as a recent send for the campaigns' 20-hour cross-campaign dedupe.

## 5. Campaign audience includes tasks

- **Audience.** A Talent enters the snapshot when they have actionable attendance days in the cycle **or** tasks without evidence in the calendar month named by the cycle (`year`, `month`).
- **Fingerprint.** Covers both.
- **Blocker.** It stays active while either set is open, and it is re-checked at dispatch.
- **Message.** `compose_talent_message` mentions both counts.

## 6. WhatsApp re-entry: the bot `masuk` → a fresh Celerates link (Celerates is the grant authority)

**Celerates endpoint:** `POST {CELERATES_PUBLIC_URL}/api/internal/talent/links`.
- Authentication: `Authorization: Bearer <CELERATES_SERVICE_TOKEN>`, the same shared secret, compared in constant time. The endpoint returns `503` when the secret is unconfigured and `401` when it is wrong.
- Body: `{"employee_id":"…"}`.
- `200 {"url":"https://…/go/<code>","expires_at":null}` → a new single-use grant to `/me`. It supersedes older unused grants.
- `404 {"error":{"code":"no_account"}}` when the employee has no active linked Talent account.

**ConForm bot.**
- A DM from a **bound** JID whose text is `masuk`, `login` or `link` (case-insensitive, whole message) calls this endpoint when both `CELERATES_PUBLIC_URL` and the service token are configured.
- The bot replies with the link, plus a note that the link can be used once.
- On `no_account`, the bot replies that the Celerates account is not active yet and to contact PMO.
- When the integration is unconfigured, the existing behaviour is unchanged.
- An unbound JID keeps the existing not-bound reply.
