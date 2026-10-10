// Workflow templates (QA doc pages 18–19, 2026-10-09; docs/design/ENTERPRISE-LAYER-HOME-WORKFLOWS.md phase 3). Each
// template describes:
// - its schedule and settings with defaults;
// - the steps the canvas shows;
// - which settings the editor offers.
// The work itself is in runners.ts. Pure, tested directly.

export type Schedule = { every: "hours" | "day" | "week"; hours?: number; at?: string; weekday?: number; weekdaysOnly?: boolean };
export type WorkflowConfig = { schedule: Schedule } & Record<string, unknown>;
export type Field = { key: string; label: string; type: "number" | "select"; options?: { value: string; label: string }[]; min?: number; max?: number };
export type Step = { id: string; kind: "trigger" | "step" | "action"; title: string; detail: string };
export type Template = {
  key: string; name: string; description: string; category: "Absensi" | "Timesheet" | "Sales" | "Integrasi";
  defaults: WorkflowConfig; fields: Field[]; steps: (c: WorkflowConfig) => Step[];
};

const DIVISIONS = [
  { value: "hr", label: "Human Resources" }, { value: "pmo", label: "PMO" }, { value: "tm", label: "Talent Management" },
  { value: "ta", label: "Talent Acquisition" }, { value: "sales", label: "Sales" },
];
const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

/** "Setiap hari kerja 09:30", "Setiap 6 jam", "Setiap Senin 08:00". */
export function describeSchedule(s: Schedule): string {
  if (s.every === "hours") return `Setiap ${s.hours ?? 1} jam`;
  if (s.every === "week") return `Setiap ${DAYS[s.weekday ?? 1]} ${s.at ?? "08:00"}`;
  return `Setiap ${s.weekdaysOnly ? "hari kerja" : "hari"} ${s.at ?? "08:00"}`;
}
const division = (v: unknown) => DIVISIONS.find((d) => d.value === v)?.label ?? String(v ?? "-");

export const TEMPLATES: Template[] = [
  {
    key: "attendance_missing",
    name: "Reminder absensi",
    description: "Setiap hari kerja, cari talent aktif yang belum check-in dan kirim ringkasannya ke divisi yang dipilih.",
    category: "Absensi",
    defaults: { schedule: { every: "day", at: "09:30", weekdaysOnly: true }, notify: "hr" },
    fields: [{ key: "notify", label: "Kirim ringkasan ke divisi", type: "select", options: DIVISIONS }],
    steps: (c) => [
      { id: "t", kind: "trigger", title: "Jadwal", detail: describeSchedule(c.schedule) },
      { id: "s1", kind: "step", title: "Cari talent belum check-in", detail: "Talent aktif tanpa absensi hari ini" },
      { id: "a1", kind: "action", title: "Notifikasi ke divisi", detail: division(c.notify) },
    ],
  },
  {
    key: "timesheet_missing",
    name: "Reminder timesheet",
    description: "Setiap minggu, cari talent aktif yang belum mengirim timesheet dalam N hari terakhir dan kirim ringkasannya.",
    category: "Timesheet",
    defaults: { schedule: { every: "week", weekday: 1, at: "08:00" }, days: 30, notify: "pmo" },
    fields: [
      { key: "days", label: "Belum kirim timesheet dalam (hari)", type: "number", min: 7, max: 90 },
      { key: "notify", label: "Kirim ringkasan ke divisi", type: "select", options: DIVISIONS },
    ],
    steps: (c) => [
      { id: "t", kind: "trigger", title: "Jadwal", detail: describeSchedule(c.schedule) },
      { id: "s1", kind: "step", title: "Cari timesheet belum masuk", detail: `Tidak ada submission ${c.days ?? 30} hari terakhir` },
      { id: "a1", kind: "action", title: "Notifikasi ke divisi", detail: division(c.notify) },
    ],
  },
  {
    key: "sheet_sync",
    name: "Sheet sync berkala",
    description: "Tarik data dari Google Sheet yang terhubung secara berkala dengan aturan import yang sama: baris error dicatat, tidak ada yang hilang diam-diam.",
    category: "Integrasi",
    defaults: { schedule: { every: "hours", hours: 6 }, tracker: "ot" },
    fields: [{ key: "tracker", label: "Sheet", type: "select", options: [{ value: "ot", label: "Opportunity Tracker" }, { value: "pq", label: "PQ Tracker" }] }],
    steps: (c) => [
      { id: "t", kind: "trigger", title: "Jadwal", detail: describeSchedule(c.schedule) },
      { id: "s1", kind: "step", title: "Baca Google Sheet", detail: c.tracker === "pq" ? "Sheet PQ Tracker" : "Sheet Opportunity Tracker" },
      { id: "s2", kind: "step", title: "Import baris valid", detail: "Baru & diubah, dicatat di Riwayat" },
      { id: "a1", kind: "action", title: "Kabari pemilik bila ada error", detail: "Notifikasi" },
    ],
  },
  {
    key: "stale_deals",
    name: "Deal macet",
    description: "Setiap hari kerja, ingatkan setiap Sales PIC tentang deal terbuka yang tidak ada komunikasi selama N hari.",
    category: "Sales",
    defaults: { schedule: { every: "day", at: "08:00", weekdaysOnly: true }, days: 14 },
    fields: [{ key: "days", label: "Tanpa komunikasi selama (hari)", type: "number", min: 3, max: 90 }],
    steps: (c) => [
      { id: "t", kind: "trigger", title: "Jadwal", detail: describeSchedule(c.schedule) },
      { id: "s1", kind: "step", title: "Cari deal macet", detail: `Stage terbuka, tanpa komunikasi ${c.days ?? 14} hari` },
      { id: "a1", kind: "action", title: "Notifikasi ke Sales PIC", detail: "Satu notifikasi per PIC" },
    ],
  },
];
export const templateOf = (key: string) => TEMPLATES.find((t) => t.key === key) ?? null;

/** A config the person sent, kept only where it is valid for the template (unknown keys and bad values dropped). */
export function cleanConfig(t: Template, raw: unknown): WorkflowConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const s = (r.schedule && typeof r.schedule === "object" ? r.schedule : {}) as Partial<Schedule>;
  const d = t.defaults.schedule;
  const every = s.every === "hours" || s.every === "day" || s.every === "week" ? s.every : d.every;
  const at = typeof s.at === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s.at) ? s.at : d.at ?? "08:00";
  const schedule: Schedule = every === "hours"
    ? { every, hours: Math.min(24, Math.max(1, Math.round(Number(s.hours ?? d.hours ?? 6)) || 6)) }
    : every === "week"
      ? { every, at, weekday: Math.min(6, Math.max(0, Math.round(Number(s.weekday ?? d.weekday ?? 1)) || 0)) }
      : { every, at, weekdaysOnly: s.weekdaysOnly === undefined ? !!d.weekdaysOnly : !!s.weekdaysOnly };
  const out: WorkflowConfig = { ...t.defaults, schedule };
  for (const f of t.fields) {
    const v = r[f.key];
    if (f.type === "number") {
      const n = Math.round(Number(v));
      if (Number.isFinite(n) && n >= (f.min ?? -Infinity) && n <= (f.max ?? Infinity)) out[f.key] = n;
    } else if (f.options?.some((o) => o.value === v)) out[f.key] = v;
  }
  return out;
}

const JAKARTA = 7 * 3600_000; // UTC+7, no daylight saving

/** The next run strictly after `from`, in Asia/Jakarta wall time. */
export function nextRun(s: Schedule, from: Date): Date {
  if (s.every === "hours") return new Date(from.getTime() + (s.hours ?? 1) * 3600_000);
  const [hh, mm] = (s.at ?? "08:00").split(":").map(Number);
  const local = new Date(from.getTime() + JAKARTA); // fields read as UTC = Jakarta wall time
  for (let add = 0; add <= 8; add++) {
    const c = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + add, hh, mm));
    const day = c.getUTCDay();
    if (c.getTime() <= local.getTime()) continue;
    if (s.every === "week" && day !== (s.weekday ?? 1)) continue;
    if (s.every === "day" && s.weekdaysOnly && (day === 0 || day === 6)) continue;
    return new Date(c.getTime() - JAKARTA);
  }
  return new Date(from.getTime() + 86_400_000);
}
