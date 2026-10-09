// Google Sheet import for Sales (QA 2026-10-09, docs/design/SALES-SHEET-SYNC-STRESS-TEST.md §5), the pure part:
// - column matching: saved choice, then exact or synonym, then fuzzy;
// - value parsing: Rupiah, dates, counts, scores, URLs;
// - value mapping for choice fields;
// - the import plan (create / update / unchanged / skip / error per row);
// - the push plan (only changed, mapped cells of rows found by key).
// No I/O here; actions read the sheet and the database and pass plain data in. Tested directly.
import { OPTY_STATUS, PIPELINE_STAGES } from "@/app/sales/pq-constants";
import { BUSINESS_UNITS, CLIENT_TYPES, LEVELS, PRIORITIES, SERVICE_TYPES, STAGES } from "./model";

type Pairs = readonly (readonly [string, string])[];
export type FieldType = "text" | "money" | "int" | "score" | "date" | "bool" | "choice" | "pic" | "url";
export type FieldSpec = {
  key: string; label: string; type: FieldType; required?: boolean;
  options?: Pairs; values?: Record<string, string>; columns?: string[];
};
export type SheetKind = "ot" | "pq";

/** Lower case, accents and punctuation gone, single spaces: "Nama Klien " and "nama-klien" compare equal. */
export const norm = (s: unknown) =>
  String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const BOOL: Pairs = [["true", "Ya"], ["false", "Tidak"]];
const BOOL_WORDS = { ya: "true", yes: "true", y: "true", true: "true", "1": "true", v: "true", checked: "true", qualified: "true", "✓": "true", "✔": "true",
  tidak: "false", no: "false", n: "false", false: "false", "0": "false", "✗": "false", "✘": "false", "not qualified": "false" };
const SERVICE_WORDS = { "managed services": "managed_service", "manage service": "managed_service", "manage services": "managed_service", ms: "managed_service",
  headhunt: "headhunting", "head hunting": "headhunting", outsource: "outsourcing", "project based": "project_based", project: "project_based" };
const LEVEL_WORDS = { sr: "senior", mid: "middle", intermediate: "middle", jr: "junior", entry: "entry_level", "fresh graduate": "entry_level",
  "fresh grad": "entry_level", intern: "internship", magang: "internship", "tech lead": "lead", "team lead": "lead", mgr: "manager" };
const CLIENT_WORDS = { lama: "existing", repeat: "existing", baru: "new" };

/** The fields each Sales sheet can fill; keys are the database columns (as in V1's target-fields). */
export const SHEET_FIELDS: Record<SheetKind, FieldSpec[]> = {
  ot: [
    { key: "opty_no", label: "Opty No", type: "text", columns: ["no opty", "opty id", "id opty", "opportunity no", "nomor opty"] },
    { key: "sales_qualified", label: "Sales Qualified", type: "bool", options: BOOL, values: BOOL_WORDS, columns: ["qualified", "sq"] },
    { key: "client_name", label: "Client Name", type: "text", required: true, columns: ["client", "nama klien", "klien", "customer", "perusahaan", "company", "account"] },
    { key: "service_type_code", label: "Service Type", type: "choice", options: SERVICE_TYPES, values: SERVICE_WORDS, columns: ["jenis layanan", "layanan", "service"] },
    { key: "requirement_summary", label: "Requirement Summary", type: "text", columns: ["kebutuhan", "requirement", "ringkasan kebutuhan"] },
    { key: "opty_status_code", label: "Opty Status", type: "choice", options: STAGES.map((s) => [s.id, s.title] as const),
      values: { won: "win", "closed won": "win", menang: "win", drop: "dropped", lost: "dropped", "closed lost": "dropped", kalah: "dropped", batal: "dropped",
        "cv submitted": "cv_submission", "cv sent": "cv_submission", "submit cv": "cv_submission", proposal: "proposal_sent", penawaran: "proposal_sent",
        "follow up": "need_action", "need follow up": "need_action" },
      columns: ["status", "stage", "status opty"] },
    { key: "progress_notes", label: "Progress Notes", type: "text", columns: ["update terakhir", "update", "progress", "catatan progress"] },
    { key: "estimated_deal_amount", label: "Estimated Deal", type: "money", columns: ["est nilai deal", "nilai deal", "deal value", "estimasi deal", "estimated deal amount"] },
    { key: "detail_requirement", label: "Detail Requirement", type: "text", columns: ["detail", "detail kebutuhan"] },
    { key: "client_type_code", label: "Client Type", type: "choice", options: CLIENT_TYPES, values: CLIENT_WORDS, columns: ["tipe klien", "jenis klien", "tipe"] },
    { key: "sales_pic_name", label: "Sales PIC", type: "pic", required: true, columns: ["pic sales", "sales", "pic", "account manager", "am"] },
    { key: "last_communication_date", label: "Last Communication", type: "date", columns: ["tgl komunikasi terakhir", "komunikasi terakhir", "last contact", "tanggal komunikasi terakhir"] },
    { key: "bante_score", label: "BANTE Score", type: "score", columns: ["bant", "bant score", "bante"] },
    { key: "dropped_reason", label: "Dropped Reason", type: "text", columns: ["alasan drop", "alasan", "drop reason"] },
    { key: "position_name", label: "Positions", type: "text", columns: ["position", "posisi", "role", "jabatan"] },
    { key: "level_code", label: "Level", type: "choice", options: LEVELS, values: LEVEL_WORDS, columns: ["seniority"] },
    { key: "headcount_target", label: "Headcount", type: "int", columns: ["hc", "jumlah orang", "jumlah", "qty"] },
    { key: "price_amount", label: "Price", type: "money", columns: ["harga", "rate", "rate bulan", "rate per bulan", "rate card"] },
  ],
  pq: [
    { key: "opty_no", label: "ID Opty", type: "text", columns: ["opty no", "no opty", "opty id"] },
    { key: "pq_no", label: "PQ Number", type: "text", columns: ["no pq", "pq no", "nomor pq"] },
    { key: "pipeline_stage_code", label: "Pipeline Stage", type: "choice", options: PIPELINE_STAGES,
      values: { ongoing: "on_going", berjalan: "on_going", open: "on_going", won: "win", menang: "win", dropped: "drop", lost: "drop", "on hold": "hold", pending: "hold" },
      columns: ["stage", "tahap"] },
    { key: "opty_status_code", label: "Opty Status", type: "choice", options: OPTY_STATUS,
      values: { win: "won", won: "won", lost: "closed_lost", "closed lost": "closed_lost", drop: "closed_lost", hold: "on_hold", "on hold": "on_hold",
        "need action": "need_action", "waiting feedback": "waiting_feedback" },
      columns: ["status opty", "status"] },
    { key: "client_name", label: "Client Name", type: "text", required: true, columns: ["client", "nama klien", "klien", "customer", "perusahaan", "company"] },
    { key: "client_type_code", label: "Client Type", type: "choice", options: CLIENT_TYPES, values: CLIENT_WORDS, columns: ["tipe klien", "tipe", "jenis klien"] },
    { key: "project_name", label: "Project Name", type: "text", required: true, columns: ["nama project", "project", "proyek", "nama proyek"] },
    { key: "position_name", label: "Positions", type: "text", columns: ["position", "posisi", "role", "jabatan"] },
    { key: "service_type_code", label: "Service Type", type: "choice", required: true, options: SERVICE_TYPES, values: SERVICE_WORDS, columns: ["layanan", "jenis layanan", "service"] },
    { key: "business_unit_code", label: "Business Unit", type: "choice", options: BUSINESS_UNITS, values: { "talent management": "tm" }, columns: ["bu"] },
    { key: "level_code", label: "Level", type: "choice", options: LEVELS, values: LEVEL_WORDS, columns: ["seniority"] },
    { key: "headcount_target", label: "Headcount", type: "int", columns: ["hc", "jumlah orang", "jumlah", "qty"] },
    { key: "priority_code", label: "Priority", type: "choice", options: PRIORITIES,
      values: { urgent: "p0", critical: "p0", high: "p1", tinggi: "p1", medium: "p2", sedang: "p2", normal: "p2", low: "p3", rendah: "p3" }, columns: ["prioritas"] },
    { key: "bant_score", label: "BANTE Score", type: "score", columns: ["bant", "bante", "bant score"] },
    { key: "price_amount", label: "Price", type: "money", columns: ["harga", "rate", "rate bulan", "rate card"] },
    { key: "opty_request_date", label: "Opty Request Date", type: "date", columns: ["tgl request", "tanggal request", "request date"] },
    { key: "approval_date", label: "Approval Date", type: "date", columns: ["tgl approval", "tanggal approval"] },
    { key: "po_doc_url", label: "PO Doc (Link)", type: "url", columns: ["link po", "po link", "po doc"] },
    { key: "sales_pic_name", label: "Sales PIC", type: "pic", required: true, columns: ["pic sales", "sales", "pic", "account manager", "am"] },
    { key: "notes", label: "Details", type: "text", columns: ["keterangan", "notes", "catatan"] },
  ],
};

// ── Columns ──────────────────────────────────────────────────────────────────────────────────────────────────
export type ColumnSource = "saved" | "exact" | "synonym" | "fuzzy" | "ai";
export type ColumnMatch = { field: string; source: ColumnSource };

const tokens = (s: string) => new Set(norm(s).split(" ").filter(Boolean));
function similarity(a: string, b: string): number {
  const x = tokens(a), y = tokens(b);
  if (!x.size || !y.size) return 0;
  let both = 0;
  for (const t of x) if (y.has(t)) both++;
  return both / (x.size + y.size - both);
}

/**
 * A field for every header the person has not decided yet. Saved choices win (an empty one means "ignore"); then
 * the exact label or key, then a known synonym, then the closest name (token overlap ≥ 0.6). Each field is used once.
 */
export function matchColumns(headers: string[], fields: FieldSpec[], saved: Record<string, string> = {}): Record<string, ColumnMatch | null> {
  const out: Record<string, ColumnMatch | null> = {};
  const used = new Set<string>();
  for (const h of headers) {
    if (Object.hasOwn(saved, h)) {
      const f = saved[h];
      out[h] = f && fields.some((x) => x.key === f) && !used.has(f) ? { field: f, source: "saved" } : null;
      if (out[h]) used.add(f);
    }
  }
  const candidates: { h: string; f: string; score: number; source: ColumnSource }[] = [];
  for (const h of headers) {
    if (Object.hasOwn(out, h)) continue;
    const n = norm(h);
    for (const f of fields) {
      if (used.has(f.key)) continue;
      if (n === norm(f.label) || n === norm(f.key)) candidates.push({ h, f: f.key, score: 1, source: "exact" });
      else if (f.columns?.some((c) => norm(c) === n)) candidates.push({ h, f: f.key, score: 0.95, source: "synonym" });
      else {
        const s = Math.max(similarity(h, f.label), ...(f.columns ?? []).map((c) => similarity(h, c)));
        if (s >= 0.6) candidates.push({ h, f: f.key, score: s * 0.9, source: "fuzzy" });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  for (const c of candidates) {
    if (Object.hasOwn(out, c.h) || used.has(c.f)) continue;
    out[c.h] = { field: c.f, source: c.source };
    used.add(c.f);
  }
  for (const h of headers) if (!Object.hasOwn(out, h)) out[h] = null;
  return out;
}

/** Sheets may repeat a header; each column needs its own name for the mapping. */
export function uniqueHeaders(row: unknown[]): string[] {
  const seen = new Map<string, number>();
  return row.map((v, i) => {
    const base = String(v ?? "").trim() || `Kolom ${columnLetter(i)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${columnLetter(i)})`;
  });
}

export function columnLetter(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// ── Values ───────────────────────────────────────────────────────────────────────────────────────────────────
export type Parsed = { ok: true; value: string | number | boolean | null } | { ok: false; error: string };
export type DateOrder = "dmy" | "mdy";
const ok = (value: string | number | boolean | null): Parsed => ({ ok: true, value });
const bad = (error: string): Parsed => ({ ok: false, error });
const blank = (v: unknown) => v == null || (typeof v === "string" && ["", "-", "—", "n/a", "na"].includes(v.trim().toLowerCase()));

/** Rupiah as an integer: 15000000, "Rp 15.000.000", "15.000.000", "15jt", "15,5 juta", "500rb". Other currencies are refused. */
export function parseMoney(v: unknown): Parsed {
  if (blank(v)) return ok(null);
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? ok(Math.round(v)) : bad("Angka tidak valid");
  const s = String(v).trim().toLowerCase();
  if (/(usd|us\$|\$|sgd|eur|€|myr|aud)/.test(s)) return bad("Mata uang bukan Rupiah");
  const m = s.replace(/^rp\.?\s*/, "").replace(/\s+/g, "").match(/^(\d[\d.,]*)(jt|juta|rb|ribu|m|miliar|milyar)?$/);
  if (!m) return bad(`Bukan nominal Rupiah: "${String(v).trim()}"`);
  const [, num, unit] = m;
  const mult = !unit ? 1 : /^(jt|juta)$/.test(unit) ? 1e6 : /^(rb|ribu)$/.test(unit) ? 1e3 : 1e9;
  let n: number;
  if (/^\d{1,3}([.,]\d{3})+$/.test(num)) n = Number(num.replace(/[.,]/g, ""));
  else if (/^\d+$/.test(num)) n = Number(num);
  else if (/^\d+[.,]\d{1,2}$/.test(num)) n = Number(num.replace(",", "."));
  else return bad(`Bukan nominal Rupiah: "${String(v).trim()}"`);
  return ok(Math.round(n * mult));
}

/** A whole count: 3, "3 orang". Ranges ("2-3") are refused rather than guessed. */
export function parseCount(v: unknown): Parsed {
  if (blank(v)) return ok(null);
  if (typeof v === "number") return Number.isInteger(v) && v >= 0 ? ok(v) : bad("Harus bilangan bulat");
  const m = String(v).trim().toLowerCase().match(/^(\d+)(?:[.,]0+)?\s*(orang|org|pax|hc|people|person)?$/);
  return m ? ok(Number(m[1])) : bad(`Bukan jumlah: "${String(v).trim()}"`);
}

/** BANTE 1–5: 4 or "4/5". */
export function parseScore(v: unknown): Parsed {
  if (blank(v)) return ok(null);
  const s = typeof v === "number" ? String(v) : String(v).trim();
  const m = s.match(/^([1-5])(?:\s*\/\s*5)?$/);
  return m ? ok(Number(m[1])) : bad(`Skor harus 1–5: "${s}"`);
}

const MONTHS: Record<string, number> = {
  jan: 1, januari: 1, january: 1, feb: 2, februari: 2, february: 2, mar: 3, maret: 3, march: 3, apr: 4, april: 4,
  mei: 5, may: 5, jun: 6, juni: 6, june: 6, jul: 7, juli: 7, july: 7, agu: 8, agt: 8, agus: 8, agustus: 8, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, okt: 10, oktober: 10, oct: 10, october: 10, nov: 11, november: 11, des: 12, desember: 12, dec: 12, december: 12,
};
const iso = (y: number, m: number, d: number): Parsed => {
  const year = y < 100 ? 2000 + y : y;
  const dt = new Date(Date.UTC(year, m - 1, d));
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && year >= 2000 && year <= 2100
    ? ok(dt.toISOString().slice(0, 10)) : bad("Tanggal tidak ada");
};

/**
 * A date as YYYY-MM-DD from a date cell (Sheets serial number), ISO text, "dd/mm/yyyy" (or mm/dd with `order`),
 * or a month name in Indonesian or English ("1 Okt 2026", "Oct 1, 2026"). Words like "kemarin" are refused.
 */
export function parseDate(v: unknown, order: DateOrder = "dmy"): Parsed {
  if (blank(v)) return ok(null);
  if (typeof v === "number") {
    if (v < 20000 || v > 80000) return bad("Bukan tanggal");
    return ok(new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86_400_000).toISOString().slice(0, 10));
  }
  const s = String(v).trim().toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ");
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) return order === "dmy" ? iso(+m[3], +m[2], +m[1]) : iso(+m[3], +m[1], +m[2]);
  m = s.match(/^(\d{1,2}) ([a-z]+)\.? (\d{2,4})$/);
  if (m && MONTHS[m[2]]) return iso(+m[3], MONTHS[m[2]], +m[1]);
  m = s.match(/^([a-z]+)\.? (\d{1,2}) (\d{2,4})$/);
  if (m && MONTHS[m[1]]) return iso(+m[3], MONTHS[m[1]], +m[2]);
  return bad(`Tanggal tidak terbaca: "${String(v).trim()}"`);
}

export function parseUrl(v: unknown): Parsed {
  if (blank(v)) return ok(null);
  const s = String(v).trim();
  return /^https?:\/\/[^\s]+$/i.test(s) ? ok(s) : bad(`Bukan link: "${s}"`);
}

/** How a sheet value is looked up in value mappings: normalised, or as written when it is only a symbol ("✓"). */
export const valueKey = (raw: unknown) => norm(raw) || String(raw ?? "").trim();

/** The ERP value a sheet value of a choice field means, if it can be told without asking: code, label or a known word. */
export function suggestChoice(raw: unknown, f: FieldSpec, pics: string[] = []): string | null {
  const n = valueKey(raw);
  if (!n) return null;
  if (f.type === "pic") return pics.find((p) => norm(p) === n) ?? null;
  for (const [code, label] of f.options ?? []) if (norm(code) === n || norm(label) === n) return code;
  return f.values?.[n] ?? null;
}

// ── Import plan ──────────────────────────────────────────────────────────────────────────────────────────────
export const KEEP = "__keep__"; // a Sales PIC name kept as written (not an account)
export const EMPTY = "__empty__"; // a sheet value meaning "no value"
export type ValueMaps = Record<string, Record<string, string>>; // field → valueKey(raw) → code | KEEP | EMPTY
export type ImportConfig = { v: 2; tab: string; columns: Record<string, string>; values: ValueMaps; dateOrder: DateOrder };
export type Existing = { id: string; key: string; values: Record<string, unknown> };
export type RowStatus = "create" | "update" | "same" | "skip" | "error";
export type PlanRow = {
  row: number; status: RowStatus; key: string | null; label: string;
  values: Record<string, string | number | boolean | null>; changes: { field: string; old: string | null; new: string | null }[]; issues: string[];
};
export type Distinct = { field: string; label: string; raw: string; count: number; code: string | null; source: "auto" | "saved" | null };
export type ImportPlan = { rows: PlanRow[]; summary: Record<RowStatus, number>; distinct: Distinct[]; missingRequired: string[] };

/** Reads a stored config; V1's plain {header: field} mapping still works (as its columns). */
export function readConfig(raw: string | null | undefined, tab: string): ImportConfig {
  let parsed: unknown = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch { /* treated as empty */ }
  const o = (parsed && typeof parsed === "object" ? parsed : {}) as Partial<ImportConfig> & Record<string, unknown>;
  if (o.v === 2) {
    // Column choices belong to one tab; value mappings and the date order carry over.
    return { v: 2, tab, columns: o.tab === tab ? (o.columns ?? {}) : {}, values: o.values ?? {}, dateOrder: o.dateOrder === "mdy" ? "mdy" : "dmy" };
  }
  const columns = Object.fromEntries(Object.entries(o).filter(([, f]) => typeof f === "string")) as Record<string, string>;
  return { v: 2, tab, columns, values: {}, dateOrder: "dmy" };
}

const display = (v: unknown) => (v == null || v === "" ? null : typeof v === "boolean" ? (v ? "true" : "false") : String(v));
const fingerprint = (client: unknown, position: unknown, pic: unknown) => [client, position, pic].map(norm).join("|");

export function planImport(input: {
  kind: SheetKind; headers: string[]; rows: unknown[][]; columns: Record<string, string>; values: ValueMaps; dateOrder: DateOrder;
  existing: Existing[]; pics: string[];
}): ImportPlan {
  const fields = SHEET_FIELDS[input.kind];
  const byKey = new Map(input.existing.map((e) => [norm(e.key), e]));
  const byPrint = new Map(input.existing.map((e) => [fingerprint(e.values.client_name, e.values.position_name, e.values.sales_pic_name), e]));
  const mapped = input.headers.map((h, i) => ({ i, f: fields.find((x) => x.key === input.columns[h]) })).filter((c): c is { i: number; f: FieldSpec } => !!c.f);
  const missingRequired = fields.filter((f) => f.required && !mapped.some((c) => c.f.key === f.key)).map((f) => f.label);
  const keyCol = mapped.find((c) => c.f.key === "opty_no");

  // Distinct values of choice fields, with what they map to.
  const counts = new Map<string, Distinct>();
  for (const r of input.rows) for (const { i, f } of mapped) {
    if (!["choice", "pic", "bool"].includes(f.type) || blank(r[i])) continue;
    const raw = String(r[i]).trim(), id = `${f.key}\u0000${valueKey(raw)}`;
    const d = counts.get(id);
    if (d) { d.count++; continue; }
    const saved = input.values[f.key]?.[valueKey(raw)];
    const auto = suggestChoice(raw, f, input.pics);
    counts.set(id, { field: f.key, label: f.label, raw, count: 1, code: saved ?? auto, source: saved ? "saved" : auto ? "auto" : null });
  }
  const resolve = (f: FieldSpec, raw: unknown) => counts.get(`${f.key}\u0000${valueKey(raw)}`)?.code ?? null;

  const keysInSheet = new Map<string, number>();
  if (keyCol) for (const r of input.rows) { const k = norm(r[keyCol.i]); if (k) keysInSheet.set(k, (keysInSheet.get(k) ?? 0) + 1); }
  const printsInSheet = new Set<string>();

  const out: PlanRow[] = input.rows.map((r, idx) => {
    const row: PlanRow = { row: idx + 2, status: "create", key: null, label: "", values: {}, changes: [], issues: [] };
    const filled = mapped.filter(({ i }) => !blank(r[i]));
    if (filled.length === 0) return { ...row, status: "skip", issues: ["Baris kosong"] };
    for (const { i, f } of mapped) {
      const v = r[i];
      if (blank(v)) continue;
      let p: Parsed;
      switch (f.type) {
        case "money": p = parseMoney(v); break;
        case "int": p = parseCount(v); break;
        case "score": p = parseScore(v); break;
        case "date": p = parseDate(v, input.dateOrder); break;
        case "url": p = parseUrl(v); break;
        case "choice": case "pic": case "bool": {
          const code = resolve(f, v);
          if (code === EMPTY) { p = ok(null); break; }
          if (code === KEEP) { p = ok(String(v).trim()); break; }
          p = code == null ? bad(`${f.label} "${String(v).trim()}" belum dipetakan`) : ok(f.type === "bool" ? code === "true" : code);
          break;
        }
        default: p = ok(String(v).trim());
      }
      if (p.ok) row.values[f.key] = p.value;
      else row.issues.push(`${f.label}: ${p.error}`);
    }
    row.key = typeof row.values.opty_no === "string" ? row.values.opty_no : null;
    row.label = String(row.values.client_name ?? "");
    if (filled.length === 1 && !fields.some((f) => f.required && row.values[f.key] != null && f.key !== "opty_no")) {
      return { ...row, status: "skip", issues: ["Baris judul atau catatan"] };
    }
    const existing = row.key ? byKey.get(norm(row.key)) : undefined;
    if (row.key && (keysInSheet.get(norm(row.key)) ?? 0) > 1) row.issues.push(`Opty No ${row.key} muncul lebih dari sekali di sheet`);
    if (!existing) for (const f of fields) if (f.required && row.values[f.key] == null && !row.issues.some((x) => x.startsWith(f.label))) row.issues.push(`${f.label} wajib diisi`);
    if (row.issues.length) return { ...row, status: "error" };
    if (existing) {
      // Blank cells never clear what the ERP has; only values the sheet states are compared.
      for (const [field, value] of Object.entries(row.values)) {
        if (field === "opty_no") continue;
        const before = display(existing.values[field]), after = display(value);
        if (before !== after) row.changes.push({ field, old: before, new: after });
      }
      return { ...row, status: row.changes.length ? "update" : "same" };
    }
    if (!row.key) {
      const print = fingerprint(row.values.client_name, row.values.position_name, row.values.sales_pic_name);
      const twin = byPrint.get(print);
      if (twin) return { ...row, status: "skip", issues: [`Mirip ${twin.key} (klien, posisi dan PIC sama). Isi Opty No di sheet untuk mengubahnya.`] };
      if (printsInSheet.has(print)) return { ...row, status: "error", issues: ["Baris kembar di sheet (klien, posisi dan PIC sama, tanpa Opty No)"] };
      printsInSheet.add(print);
    }
    return row;
  });
  const summary = { create: 0, update: 0, same: 0, skip: 0, error: 0 } as Record<RowStatus, number>;
  for (const r of out) summary[r.status]++;
  return { rows: out, summary, distinct: [...counts.values()], missingRequired };
}

// ── Push plan ────────────────────────────────────────────────────────────────────────────────────────────────
export type PushCell = { row: number; col: number; old: string | null; value: string | number };
export type PushPlan = { cells: PushCell[]; append: (string | number)[][]; keyMissing: boolean; rowsTouched: number };

/**
 * ERP → sheet without damage: only mapped columns, only rows whose Opty No is found, only cells whose meaning differs.
 * Choice values are written the way the sheet already writes them ("WIN" stays "WIN"); empty ERP values never clear a
 * cell. Records not in the sheet are offered as appended rows. Text that a sheet would run as a formula is quoted.
 */
export function planPush(input: {
  kind: SheetKind; headers: string[]; rows: unknown[][]; columns: Record<string, string>; values: ValueMaps; dateOrder: DateOrder;
  records: Existing[]; pics: string[];
}): PushPlan {
  const fields = SHEET_FIELDS[input.kind];
  const mapped = input.headers.map((h, i) => ({ i, f: fields.find((x) => x.key === input.columns[h]) })).filter((c): c is { i: number; f: FieldSpec } => !!c.f);
  const keyCol = mapped.find((c) => c.f.key === "opty_no");
  if (!keyCol) return { cells: [], append: [], keyMissing: true, rowsTouched: 0 };
  const plan = planImport({ ...input, existing: [] });
  // How this sheet writes each code, from its own values (first seen wins).
  const spelled = new Map<string, string>();
  for (const d of plan.distinct) if (d.code && !spelled.has(`${d.field}\u0000${d.code}`)) spelled.set(`${d.field}\u0000${d.code}`, d.raw);
  const cellValue = (f: FieldSpec, v: unknown): string | number | null => {
    if (v == null || v === "") return null;
    if (f.type === "bool") return spelled.get(`${f.key}\u0000${v ? "true" : "false"}`) ?? (v ? "Ya" : "Tidak");
    if (f.type === "choice") return spelled.get(`${f.key}\u0000${v}`) ?? f.options?.find(([c]) => c === v)?.[1] ?? String(v);
    if (f.type === "money" || f.type === "int" || f.type === "score") return Number(v);
    const s = String(v);
    return /^[=+\-@]/.test(s) ? `'${s}` : s;
  };
  const rowOf = new Map<string, number>();
  input.rows.forEach((r, i) => { const k = norm(r[keyCol.i]); if (k && !rowOf.has(k)) rowOf.set(k, i); });
  const cells: PushCell[] = [];
  const touched = new Set<number>();
  const append: (string | number)[][] = [];
  const width = Math.max(...mapped.map((c) => c.i)) + 1;
  for (const rec of input.records) {
    const at = rowOf.get(norm(rec.key));
    if (at === undefined) {
      const line: (string | number)[] = Array(width).fill("");
      for (const { i, f } of mapped) line[i] = f.key === "opty_no" ? rec.key : cellValue(f, rec.values[f.key]) ?? "";
      append.push(line);
      continue;
    }
    const sheetRow = plan.rows[at];
    for (const { i, f } of mapped) {
      if (f.key === "opty_no") continue;
      const want = rec.values[f.key];
      if (want == null || want === "") continue;
      const now = sheetRow.values[f.key];
      if (display(now) === display(want)) continue;
      const value = cellValue(f, want);
      if (value == null) continue;
      cells.push({ row: at + 2, col: i, old: input.rows[at][i] == null ? null : String(input.rows[at][i]), value });
      touched.add(at);
    }
  }
  return { cells, append, keyMissing: false, rowsTouched: touched.size };
}
