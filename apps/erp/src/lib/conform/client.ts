// The one server-side client for ConForm's Celerates integration API v1 (doc 21 §5, ADR-019).
// Configured only by CONFORM_BASE_URL and CONFORM_SERVICE_TOKEN; moving ConForm next to Celerates is a config change.
// The browser never sees the token or the ConForm URL. Every mutation names the Celerates actor.
import { randomUUID } from "node:crypto";

export class ConformError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryable = false,
    public body: unknown = null,
  ) {
    super(message);
  }
}

export function conformBase(): string | null {
  const raw = process.env.CONFORM_BASE_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    return (url.origin + url.pathname).replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export const conformConfigured = () => Boolean(conformBase() && (process.env.CONFORM_SERVICE_TOKEN ?? "").length >= 32);

type Options = { actor?: string; idempotencyKey?: string; timeoutMs?: number; body?: unknown; form?: FormData; accept?: "json" | "binary" };

async function call(method: "GET" | "POST" | "PUT", path: string, options: Options = {}): Promise<Response> {
  const base = conformBase();
  const token = process.env.CONFORM_SERVICE_TOKEN ?? "";
  if (!base || token.length < 32) throw new ConformError(503, "conform_unconfigured", "ConForm belum dikonfigurasi.", true);
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, "X-Correlation-Id": randomUUID() };
  if (options.actor) headers["X-Celerates-Actor"] = options.actor.slice(0, 200);
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
  let body: BodyInit | undefined;
  if (options.form) body = options.form;
  else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  const response = await fetch(`${base}/api/celerates/v1${path}`, {
    method,
    headers,
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(options.timeoutMs ?? 20000),
  }).catch((error: unknown) => {
    const timeout = error instanceof Error && error.name === "TimeoutError";
    throw new ConformError(503, timeout ? "conform_timeout" : "conform_unreachable", "ConForm belum dapat dihubungi.", true);
  });
  if (!response.ok) {
    const parsed = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string; retryable?: boolean } } | null;
    const error = parsed?.error;
    throw new ConformError(response.status, error?.code ?? `http_${response.status}`, error?.message ?? "ConForm menolak permintaan.", Boolean(error?.retryable) || response.status >= 500, parsed);
  }
  return response;
}

export const conform = {
  async get<T>(path: string, options: Options = {}): Promise<T> {
    return (await (await call("GET", path, options)).json()) as T;
  },
  async post<T>(path: string, body: unknown, options: Options = {}): Promise<T> {
    return (await (await call("POST", path, { ...options, body })).json()) as T;
  },
  async put<T>(path: string, body: unknown, options: Options = {}): Promise<T> {
    return (await (await call("PUT", path, { ...options, body })).json()) as T;
  },
  async postForm<T>(path: string, form: FormData, options: Options = {}): Promise<T> {
    return (await (await call("POST", path, { ...options, form })).json()) as T;
  },
  /** Binary pass-through (evidence image, BAST PDF, canonical CSV): the caller streams it to an authorized user. */
  async raw(method: "GET" | "POST", path: string, options: Options = {}): Promise<Response> {
    return call(method, path, options);
  },
};

export const qs = (params: Record<string, string | number | null | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== null && value !== undefined && value !== "") search.set(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : "";
};

// ---- Contract types (celerates-bast-digital/docs/celerates-integration-v1.md) ---------------------------------
export type Cycle = { id: string; label: string; year: number; month: number; start: string; end: string; closing_day: number };
export type TalentStatus = "NEEDS_TALENT_ACTION" | "WAITING_SUBMITTED" | "COMPLETE";
export type Readiness = {
  cycle: Cycle;
  evaluated_through: string | null;
  summary: { total_talents: number; complete: number; waiting_submitted: number; needs_talent_action: number; unverified: number };
  talents: { employee_id: string; nrp: string; name: string; role: string; status: TalentStatus; actionable_days: number; waiting_days: number; unverified_days: number; whatsapp_bound: boolean }[];
  pending_corrections: number;
  sources: { source_key: string; label: string; last_success_at: string | null; age_seconds: number | null }[];
  bast: { report_type: "developer" | "iotoperation"; ready: boolean; ready_talents: number; total_talents: number }[];
};
export type Requirement = {
  requirement_id: string;
  kind: "attendance_gap";
  work_date: string;
  attendance_key: string | null;
  gap: "missing_clock_in" | "missing_clock_out" | "missing_both";
  raw_check_in: string | null;
  raw_check_out: string | null;
  state: "needs_action" | "waiting_review";
  reason: string;
  allowed_actions: ("worked" | "sakit" | "izin" | "cuti" | "libur")[];
  has_evidence: boolean;
  correction: { id: string; status: string | null; resolution_type: string | null; absence_type: string | null; proposed_check_in: string | null; proposed_check_out: string | null; rejection_reason: string | null } | null;
};
export type TalentRequirements = {
  cycle: Cycle;
  evaluated_through: string | null;
  talent: { employee_id: string; nrp: string; name: string; role: string; status: TalentStatus; actionable_days: number; waiting_days: number; unverified_days: number };
  requirements: Requirement[];
};
export type TalentLookup = { employee_id: string; nrp: string; name: string; role: string; whatsapp_bound: boolean };
export type Correction = {
  id: string;
  status: string;
  employee_id: string;
  nrp?: string;
  name?: string;
  role?: string;
  work_date: string;
  resolution_type: string;
  absence_type?: string | null;
  raw_check_in?: string | null;
  raw_check_out?: string | null;
  proposed_check_in?: string | null;
  proposed_check_out?: string | null;
  evidence?: { content_type: string | null; byte_size: number | null; caption: string; uploaded_at: string | null };
  submitted_at?: string | null;
  reviewable: boolean;
  reviewability_reason?: string | null;
  reviewed_by?: string | null;
  rejection_reason?: string | null;
  cycle?: Cycle;
};
export type CampaignRecipient = { id: string; employee_id: string; nrp: string; name: string; eligibility: "eligible" | "not_bound"; actionable_days: number; missing_tasks?: number; state: string; attempt_count: number; last_error: string | null; sent_at: string | null; has_link: boolean };
export type Campaign = {
  id: string;
  kind: "talent_attendance";
  state: "draft" | "running" | "paused" | "completed" | "stopped";
  cycle: Cycle;
  policy: { window_start_hour: number; window_end_hour: number; batch_size: number; cooldown_seconds: number; min_interval_seconds: number; max_attempts: number };
  created_by: string;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
  finished_at: string | null;
  next_dispatch_at: string | null;
  pause_reason: string | null;
  message_preview: string;
  counts: Record<string, number> & { total: number; eligible: number };
  recipients: CampaignRecipient[];
  events: { event: string; actor: string; recipient_id: string | null; at: string }[];
};
export type CampaignSummary = { id: string; state: Campaign["state"]; cycle: Cycle; created_by: string; created_at: string; approved_by: string | null; pause_reason: string | null; counts: Record<string, number> };
export type BastJob = { id: string; status: "pending" | "running" | "succeeded" | "failed" | "cancelled" | "stale"; report_type: string; year: number; month: number; mode: string; forced: boolean; requested_by: string; result: { artifact_name?: string; fingerprint?: string } | null; error_code: string | null; created_at: string; finished_at: string | null };

/** Doc 22 §1: the Talent's daily attendance log for a Payroll cycle (read-through; ConForm is the record). */
export type AttendanceDayState = "complete" | "needs_action" | "waiting_review" | "excused" | "unverified" | "not_required";
export type TalentAttendanceDay = {
  work_date: string;
  check_in: string | null;
  check_out: string | null;
  origin: "pipeline" | "manual" | null;
  state: AttendanceDayState;
  gap: Requirement["gap"] | null;
  reason: string;
  evidence_count: number;
  correction: Requirement["correction"];
};
export type TalentAttendance = { employee_id: string; cycle: Cycle; source: string; evaluated_through: string | null; days: TalentAttendanceDay[] };

/** Doc 22 §2: tasks for a calendar month, with evidence counts (no PMO approval). */
export type TalentTask = { task_key: string; title: string; work_date: string; task_source: string; status: string; evidence_count: number; staged_count: number; complete: boolean };
export type TalentTasks = {
  employee_id: string;
  period: { year: number; month: number; start: string; end: string; label: string };
  summary: { total: number; complete: number; missing: number; staged: number };
  items: TalentTask[];
};
