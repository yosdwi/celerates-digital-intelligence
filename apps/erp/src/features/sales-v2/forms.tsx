"use client";
// Create Opportunity and Extension Request in Crisp dialogs. Fields, names, required flags and server actions are the
// V1 ones, unchanged (docs/design/SALES-V2-CRISP-UX-CONTRACT.md §10); only the presentation is new.
// Contract §12: the dialog closes only from ×, Batal or Simpan (not Escape or a click outside), and what was typed is
// kept as a draft until it is saved or reset.
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { BriefcaseBusiness, ChevronDown, Plus, Repeat, Sparkles, SquarePen } from "lucide-react";
import { Button, Checkbox, Dialog, DialogBody, DialogFooter, FormField, Input, InputShell, Menu, MenuItem, Select, Textarea } from "@crisp-ui-kit/crisp";
import { MoneyInput } from "@/components/form-fields";
import { useToast } from "@/components/toast-provider";
import { createOpportunityTracker, updateOpportunityTracker } from "@/app/sales/opportunity-tracker/actions";
import { createExtensionRequestFromSales } from "@/app/sales/actions";
import { getExtensionPrefill } from "@/app/sales/ai-actions";
import { BANTE_SCORES, BUSINESS_UNITS, CLIENT_TYPES, LEVELS, LEVEL_LABEL, PRICE_PERIODS, PRIORITIES, SERVICE_TYPES, STAGES, STAGE_LABEL, editValues, type Opportunity } from "./model";
import { mergeFill, updateSuggestions, type AiForm, type AiResult, type Suggestion } from "./ai-fill";

export const isRedirect = (err: unknown) => typeof (err as { digest?: unknown })?.digest === "string" && (err as { digest: string }).digest.startsWith("NEXT_REDIRECT");

/**
 * Contract §12: a form dialog closes only from ×, Batal or Simpan. Crisp's Dialog reports ×, Escape and outside clicks
 * alike as onOpenChange(false), so the click that lands on its close button is noted first (capture phase runs before
 * the button's own handler). Returns the Dialog's onOpenChange.
 */
export function useCloseFromXOnly(open: boolean, close: () => void) {
  const viaClose = useRef(false);
  useEffect(() => {
    if (!open) return;
    const mark = (e: MouseEvent) => { viaClose.current = !!(e.target as Element | null)?.closest?.(".crisp-dialog-close"); };
    document.addEventListener("click", mark, true);
    return () => document.removeEventListener("click", mark, true);
  }, [open]);
  return (o: boolean) => { if (!o && viaClose.current) close(); viaClose.current = false; };
}

export const readDraft = (form: HTMLFormElement | null, skip: string[] = []) => {
  const d: Record<string, string> = {};
  if (form) new FormData(form).forEach((v, k) => { if (typeof v === "string" && !skip.includes(k)) d[k] = v; });
  return d;
};

type Pairs = readonly (readonly [string, string])[];
export const opts = (pairs: Pairs) => pairs.map(([value, label]) => ({ value, label }));

export type FormOptions = {
  leadOptions: { id: string; lead_no: string; client_name: string }[];
  positionSuggestions: string[];
  employeeOptions: { value: string; label: string }[];
  /** Sales PIC choices: the Sales accounts (loadSalesPics). */
  salesPics: string[];
};

/** The signed-in person's name, as Sales PIC lists show it. */
export function useMyName(): string | null {
  return ((useSession().data?.user as { fullName?: string } | undefined)?.fullName ?? null);
}

/**
 * Sales PIC picked from the Sales accounts (QA 2026-10-09), stored as the name. A stored name that differs only in case
 * or spaces opens as the account's name, so saving tidies it; any other old name stays selectable, marked "nama lama".
 * A new record starts with the signed-in person when they are on the list.
 */
export function SalesPicSelect({ options, defaultValue }: { options: string[]; defaultValue?: string }) {
  const me = useMyName();
  const stored = defaultValue?.trim() ?? "";
  const canonical = stored ? options.find((o) => o.toLowerCase() === stored.replace(/\s+/g, " ").toLowerCase()) ?? stored : "";
  const [value, setValue] = useState(canonical || (me && options.includes(me) ? me : ""));
  const list = value && !options.includes(value) ? [...options, value] : options;
  return (
    <Select name="sales_pic_name" required searchable value={value} onValueChange={setValue} placeholder="Pilih Sales PIC"
      options={list.map((n) => ({ value: n, label: options.includes(n) ? n : `${n} (nama lama)` }))} />
  );
}

/** A label above a Crisp control; `span` widens it to the full row. */
export function F({ label, required, span, hint, children }: { label: string; required?: boolean; span?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <FormField label={label} required={required} description={hint} className={span ? "sm:col-span-3" : undefined}>
      {children}
    </FormField>
  );
}

export type Draft = Record<string, string>;
export type CreateRequest = { kind: "opportunity" | "extension"; status?: string } | null;

export function Money({ name, defaultValue }: { name: string; defaultValue?: string }) {
  return (
    <InputShell>
      <MoneyInput name={name} defaultValue={defaultValue} className="crisp-input-value" />
    </InputShell>
  );
}

export function PositionInput({ suggestions, defaultValue }: { suggestions: string[]; defaultValue?: string }) {
  const listId = useId();
  return (
    <>
      <Input name="position_name" list={listId} autoComplete="off" defaultValue={defaultValue} />
      <datalist id={listId}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
    </>
  );
}

/** Shared submit: run the existing action, close, confirm, refresh the workspace. Errors stay in the dialog. */
export function useSubmit(action: (fd: FormData) => Promise<void>, onDone: () => void) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { showToast } = useToast();
  const t = useTranslations("common");
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      try {
        await action(fd);
        onDone();
        showToast(t("savedSuccess"));
        router.refresh();
      } catch (err) {
        // V1's update action ends with a redirect back to return_to (this workspace URL): that is the success path.
        if (isRedirect(err)) { onDone(); showToast(t("savedSuccess")); throw err; }
        showToast((err as Error)?.message || t("saveFailed"), "error");
      }
    });
  }
  return { pending, onSubmit, t };
}

type FormProps = { options: FormOptions; draft: Draft; formRef: React.RefObject<HTMLFormElement | null>; onDone: () => void; onCancel: () => void; onReset: () => void };

export function DraftFooter({ pending, onCancel, onReset, t, resetLabel = "Kosongkan form" }: { pending: boolean; onCancel: () => void; onReset: () => void; t: (k: string) => string; resetLabel?: string }) {
  return (
    <DialogFooter>
      {resetLabel && <button type="button" onClick={onReset} disabled={pending} className="mr-auto text-[0.75rem] text-slate-500 hover:text-slate-800 hover:underline">{resetLabel}</button>}
      <Button type="button" intent="neutral" size="sm" onClick={onCancel} disabled={pending}>{t("cancel")}</Button>
      <Button type="submit" intent="primary" size="sm" loading={pending}>{pending ? t("saving") : t("save")}</Button>
    </DialogFooter>
  );
}

export type AiFillResult = AiResult & { lastMail: string | null };

/** The ✦ / ↺ hint on a field the AI or the Extension prefill filled; otherwise the field's own hint. */
export const fillHint = (aiKeys: string[], prefilled: string[] = []) => (key: string, hint?: string) =>
  aiKeys.includes(key) ? "✦ Diisi AI, periksa" : prefilled.includes(key) ? "↺ Dari kontrak sebelumnya, periksa" : hint;

/**
 * AI form fill (roadmap #3, api/agent/extract): pasted text, or a PO / PKS file where `file` is set, → proposed fields.
 * Nothing is saved: the caller puts the values in its form, marked, for the person to check. Neither the text nor the
 * file is kept. With `opportunityId` and nothing pasted, the server reads that Opportunity's latest emails.
 */
export function AiFill({ form, onFill, label, placeholder, file = false, initialText = "", opportunityId, defaultOpen = false }: {
  form: AiForm; onFill: (r: AiFillResult) => void; label: string; placeholder: string; file?: boolean; initialText?: string; opportunityId?: string; defaultOpen?: boolean;
}) {
  const [text, setText] = useState(initialText);
  const [doc, setDoc] = useState<File | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const call = (body: BodyInit, json: boolean) => start(async () => {
    setError(null);
    const res = await fetch("/api/agent/extract", { method: "POST", headers: json ? { "Content-Type": "application/json" } : undefined, body }).catch(() => null);
    const out = await res?.json().catch(() => ({}));
    if (!res?.ok) { setError(out?.error ?? "AI belum tersedia."); return; }
    const r: AiFillResult = { fields: out?.fields ?? {}, contacts: out?.contacts ?? [], lastMail: out?.lastMail ?? null };
    if (!Object.keys(r.fields).length && !r.contacts.length && !r.lastMail) { setError("AI tidak menemukan data yang bisa diisi."); return; }
    onFill(r);
  });
  const fromEmails = !!opportunityId && !text.trim();
  const runText = () => call(JSON.stringify({ form, text, opportunityId }), true);
  const runFile = () => { if (!doc) return; const fd = new FormData(); fd.set("form", form); fd.set("file", doc); call(fd, false); };
  return (
    <details className="mb-3 rounded-lg border border-violet-200 bg-violet-50/50 px-3 py-2" data-ai-fill={form} open={defaultOpen || undefined}>
      <summary className="flex cursor-pointer items-center gap-1.5 text-[0.8125rem] font-medium text-violet-900"><Sparkles size={14} /> {label}</summary>
      <div className="mt-2 space-y-2">
        {file && (
          <div className="flex flex-wrap items-center gap-2">
            <input type="file" accept=".pdf,.docx,.png,.jpg,.jpeg" aria-label="Berkas PO / PKS" className="max-w-full text-[0.75rem]" onChange={(e) => setDoc(e.target.files?.[0] ?? null)} />
            <Button type="button" size="sm" intent="primary" loading={pending && !!doc} disabled={!doc || pending} onClick={runFile}><Sparkles size={13} /> Baca dokumen</Button>
          </div>
        )}
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder={placeholder} aria-label={label} />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" intent={file ? "neutral" : "primary"} loading={pending && !doc} disabled={pending || (!fromEmails && text.trim().length < 10)} onClick={runText}>
            <Sparkles size={13} /> {fromEmails ? "Usulkan dari email terbaru" : "Isi dengan AI"}
          </Button>
          <span className="text-[0.75rem] text-slate-500">
            {pending && file && doc ? "Membaca dokumen; hasil scan bisa makan waktu sampai 1 menit." : "Hasil AI ditandai ✦; periksa sebelum menyimpan."}
          </span>
        </div>
        {error && <p className="text-[0.75rem] text-red-600">{error}</p>}
      </div>
    </details>
  );
}

type FillProps = { aiKeys?: string[]; onAiFill?: (r: AiFillResult) => void };

function OpportunityForm({ options, draft: d, formRef, onDone, onCancel, onReset, status, aiKeys = [], onAiFill }: FormProps & FillProps & { status?: string }) {
  const { pending, onSubmit, t } = useSubmit(createOpportunityTracker, onDone);
  const ai = fillHint(aiKeys);
  const [leadId, setLeadId] = useState(d.lead_id ?? "");
  const lead = options.leadOptions.find((l) => l.id === leadId);
  const clientDefault = leadId === (d.lead_id ?? "") && d.client_name != null ? d.client_name : lead?.client_name ?? "";
  return (
    <form ref={formRef} onSubmit={onSubmit}>
      {status && <input type="hidden" name="opty_status_code" value={status} />}
      <DialogBody>
        {status && <p className="mb-3 text-[0.75rem] text-slate-600">Stage awal: <b className="text-slate-900">{STAGE_LABEL[status] ?? status}</b></p>}
        {onAiFill && <AiFill form="opportunity" label="Isi dari email / RFQ klien (AI)" placeholder="Tempel isi email atau RFQ di sini…" onFill={onAiFill} />}
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-3">
          <F label="Dari Marketing Lead" hint={lead ? `Leads No: ${lead.lead_no}` : "Kosongkan kalau bukan dari Marketing."}>
            <Select
              name="lead_id"
              searchable
              value={leadId}
              onValueChange={setLeadId}
              placeholder="- Tidak dari Lead / Manual -"
              options={[{ value: "", label: "- Tidak dari Lead / Manual -" }, ...options.leadOptions.map((l) => ({ value: l.id, label: `${l.lead_no} - ${l.client_name}` }))]}
            />
          </F>
          <F label="Nama Klien" required hint={ai("client_name", lead ? "Otomatis dari Lead, bisa diedit" : undefined)}>
            <Input key={`client-${leadId}`} name="client_name" required defaultValue={clientDefault} autoFocus />
          </F>
          <F label="Client Type" hint={ai("client_type_code")}><Select name="client_type_code" defaultValue={d.client_type_code} options={opts(CLIENT_TYPES)} placeholder="-" /></F>

          <F label="Service Type" hint={ai("service_type_code")}><Select name="service_type_code" defaultValue={d.service_type_code} options={opts(SERVICE_TYPES)} placeholder="-" /></F>
          <F label="Sales PIC" required><SalesPicSelect options={options.salesPics} defaultValue={d.sales_pic_name} /></F>
          <F label="Positions" hint={ai("position_name")}><PositionInput suggestions={options.positionSuggestions} defaultValue={d.position_name} /></F>

          <F label="Level" hint={ai("level_code")}><Select name="level_code" defaultValue={d.level_code} options={opts(LEVELS)} placeholder="-" /></F>
          <F label="Headcount" hint={ai("headcount_target")}><Input name="headcount_target" type="number" defaultValue={d.headcount_target} /></F>
          <F label="Estimasi Durasi (bulan)" hint={ai("estimated_duration_months")}><Input name="estimated_duration_months" type="number" defaultValue={d.estimated_duration_months} /></F>

          <F label="Price" hint={ai("price_amount")}><Money name="price_amount" defaultValue={d.price_amount} /></F>
          <F label="Price Period" hint={ai("price_period_code")}><Select name="price_period_code" defaultValue={d.price_period_code ?? "monthly"} options={opts(PRICE_PERIODS)} /></F>
          <F label="Closing Price Deal"><Money name="estimated_deal_amount" defaultValue={d.estimated_deal_amount} /></F>

          <F label="BANTE Score"><Select name="bante_score" defaultValue={d.bante_score} options={opts(BANTE_SCORES)} placeholder="-" /></F>
          <F label="Last Communication"><Input name="last_communication_date" type="date" defaultValue={d.last_communication_date} /></F>
          <label className="flex items-center gap-2 self-end pb-1.5 text-[0.8125rem] font-medium text-slate-700">
            <Checkbox name="sales_qualified" value="true" defaultChecked={d.sales_qualified === "true"} /> Sales Qualified
          </label>

          <F label="Requirement Summary" span hint={ai("requirement_summary")}><Textarea name="requirement_summary" rows={2} defaultValue={d.requirement_summary} /></F>
          <F label="Detail Requirement" span hint={ai("detail_requirement")}><Textarea name="detail_requirement" rows={3} defaultValue={d.detail_requirement} /></F>
        </div>
      </DialogBody>
      <DraftFooter pending={pending} onCancel={onCancel} onReset={onReset} t={t} />
    </form>
  );
}

function ExtensionForm({ options, draft: d, formRef, onDone, onCancel, onReset, aiKeys = [], prefilled = [], onAiFill, onPick }: FormProps & FillProps & { prefilled?: string[]; onPick: (employeeId: string) => void }) {
  const { pending, onSubmit, t } = useSubmit(createExtensionRequestFromSales, onDone);
  const ai = fillHint(aiKeys, prefilled);
  return (
    <form ref={formRef} onSubmit={onSubmit}>
      <DialogBody>
        {onAiFill && <AiFill form="extension" label="Isi dari email perpanjangan klien (AI)" placeholder="Tempel email klien soal perpanjangan (periode baru, rate baru)…" onFill={onAiFill} />}
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-3">
          <F label="Talent yang di-extend" required span hint="Bikin PQ baru buat deal perpanjangan ini + otomatis masuk sebagai request pending di TM Extension Request (TM lengkapi rincian gaji & approval chain-nya). Memilih talent mengisi form dari kontraknya sekarang.">
            <Select name="employee_id" required searchable defaultValue={d.employee_id} options={options.employeeOptions} placeholder="Pilih talent" onValueChange={onPick} />
          </F>

          <F label="Client Name" required hint={ai("client_name")}><Input name="client_name" required defaultValue={d.client_name} /></F>
          <F label="Client Type" hint={ai("client_type_code")}><Select name="client_type_code" defaultValue={d.client_type_code} options={opts(CLIENT_TYPES)} placeholder="-" /></F>
          <F label="Project Name" required hint={ai("project_name")}><Input name="project_name" required defaultValue={d.project_name} /></F>

          <F label="Positions" hint={ai("position_name")}><PositionInput suggestions={options.positionSuggestions} defaultValue={d.position_name} /></F>
          <F label="Service Type" required hint={ai("service_type_code")}><Select name="service_type_code" required defaultValue={d.service_type_code} options={opts(SERVICE_TYPES)} placeholder="-" /></F>
          <F label="Business Unit" hint={ai("business_unit_code")}><Select name="business_unit_code" defaultValue={d.business_unit_code} options={opts(BUSINESS_UNITS)} placeholder="-" /></F>

          <F label="Level" hint={ai("level_code")}><Select name="level_code" defaultValue={d.level_code} options={opts(LEVELS)} placeholder="-" /></F>
          <F label="Headcount" hint={ai("headcount_target")}><Input name="headcount_target" type="number" defaultValue={d.headcount_target} /></F>
          <F label="Estimasi Durasi (bulan)" hint={ai("estimated_duration_months")}><Input name="estimated_duration_months" type="number" defaultValue={d.estimated_duration_months} /></F>

          <F label="Priority" hint={ai("priority_code")}><Select name="priority_code" defaultValue={d.priority_code} options={opts(PRIORITIES)} placeholder="-" /></F>
          <F label="Price" hint={ai("price_amount")}><Money name="price_amount" defaultValue={d.price_amount} /></F>
          <F label="Price Period" hint={ai("price_period_code")}><Select name="price_period_code" defaultValue={d.price_period_code ?? "monthly"} options={opts(PRICE_PERIODS)} /></F>

          <F label="Sales PIC" required hint={ai("sales_pic_name")}><SalesPicSelect options={options.salesPics} defaultValue={d.sales_pic_name} /></F>
          <F label="Start Date" hint={ai("start_date")}><Input name="start_date" type="date" defaultValue={d.start_date} /></F>
          <F label="End Date" hint={ai("end_date")}><Input name="end_date" type="date" defaultValue={d.end_date} /></F>

          <F label="Notes" span hint={ai("notes")}><Textarea name="notes" rows={3} defaultValue={d.notes} /></F>
        </div>
      </DialogBody>
      <DraftFooter pending={pending} onCancel={onCancel} onReset={onReset} t={t} />
    </form>
  );
}

/** Values a create form starts with: an AI proposal may replace them. */
const DEFAULTS: Draft = { price_period_code: "monthly" };

const TITLES = { opportunity: "Tambah Opportunity Baru", extension: "Add Extension Request" } as const;

/**
 * The page's one primary action: New ▾ → New Opportunity / Extension Request. `create` is owned by the workspace so a
 * Kanban column's "+" can open the same dialog with that stage preset.
 */
export function CreateMenu({ options, create, onCreate }: { options: FormOptions; create: CreateRequest; onCreate: (r: CreateRequest) => void }) {
  const drafts = useRef<Record<string, Draft>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const [resetTick, setResetTick] = useState(0);
  const [aiKeys, setAiKeys] = useState<string[]>([]);
  const [prefilled, setPrefilled] = useState<string[]>([]);
  const kind = create?.kind;
  const close = () => { if (kind) drafts.current[kind] = readDraft(formRef.current, ["opty_status_code"]); onCreate(null); };
  const onOpenChange = useCloseFromXOnly(!!create, close);
  const clearMarks = () => { setAiKeys([]); setPrefilled([]); };
  const done = () => { if (kind) drafts.current[kind] = {}; clearMarks(); onCreate(null); };
  const reset = () => { if (kind) drafts.current[kind] = {}; clearMarks(); setResetTick((n) => n + 1); };
  const remount = (draft: Draft) => { if (kind) drafts.current[kind] = draft; setResetTick((n) => n + 1); };
  // AI fill only fills what is empty, at its default, or machine-filled before; then remounts the form with it.
  const aiFill = ({ fields }: AiFillResult) => {
    const { draft, filled } = mergeFill(readDraft(formRef.current, ["opty_status_code"]), fields, DEFAULTS, [...aiKeys, ...prefilled]);
    setAiKeys((k) => Array.from(new Set([...k, ...filled])));
    setPrefilled((k) => k.filter((x) => !filled.includes(x)));
    remount(draft);
  };
  // Extension: picking the talent copies their current contract (no AI) into what is still empty or was copied before.
  const pick = (employeeId: string) => {
    getExtensionPrefill(employeeId).then((pre) => {
      const { draft, filled } = mergeFill({ ...readDraft(formRef.current), employee_id: employeeId }, pre, DEFAULTS, prefilled);
      setPrefilled(filled);
      setAiKeys((k) => k.filter((x) => !filled.includes(x)));
      remount(draft);
    }, () => {});
  };
  const props = { options, formRef, draft: (kind && drafts.current[kind]) || {}, onDone: done, onCancel: close, onReset: reset, aiKeys, onAiFill: aiFill };

  return (
    <>
      <Menu
        align="end"
        aria-label="Buat baru"
        trigger={
          <Button intent="primary" size="sm" data-testid="sales-v2-new">
            <Plus size={14} strokeWidth={2.25} /> New <ChevronDown size={14} />
          </Button>
        }
      >
        <MenuItem onSelect={() => onCreate({ kind: "opportunity" })}>New Opportunity</MenuItem>
        <MenuItem onSelect={() => onCreate({ kind: "extension" })}>Extension Request</MenuItem>
      </Menu>
      <Dialog
        open={!!create}
        onOpenChange={onOpenChange}
        title={kind ? TITLES[kind] : ""}
        icon={kind === "extension" ? <Repeat size={16} /> : <BriefcaseBusiness size={16} />}
        closeLabel="Tutup"
        width={760}
        data-sales-v2-dialog={kind}
      >
        {kind === "opportunity" && <OpportunityForm key={`o${resetTick}`} {...props} status={create?.status} />}
        {kind === "extension" && <ExtensionForm key={`e${resetTick}`} {...props} prefilled={prefilled} onPick={pick} />}
      </Dialog>
    </>
  );
}

// ── Edit (contract §12): the V1 edit page's 19 fields in a dialog, same action, same required flags ────────────────
// Drafts per record survive closing the dialog (and the panel) for this browser session.
const editDrafts = new Map<string, Draft>();

export function EditOpportunityDialog({ record, open, onClose, returnTo, options }: { record: Opportunity; open: boolean; onClose: () => void; returnTo: string; options: FormOptions }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [resetTick, setResetTick] = useState(0);
  const [aiKeys, setAiKeys] = useState<string[]>([]);
  const close = () => { editDrafts.set(record.id, readDraft(formRef.current, ["return_to"])); onClose(); };
  const onOpenChange = useCloseFromXOnly(open, close);
  const apply = (values: Draft) => {
    editDrafts.set(record.id, { ...readDraft(formRef.current, ["return_to"]), ...values });
    setAiKeys((k) => Array.from(new Set([...k, ...Object.keys(values)])));
    setResetTick((n) => n + 1);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Edit ${record.optyNo}`} icon={<SquarePen size={16} />} closeLabel="Tutup" width={760} data-sales-v2-dialog="edit">
      {open && (
        <EditForm
          key={`${record.id}-${resetTick}`}
          record={record}
          draft={editDrafts.get(record.id) ?? editValues(record)}
          formRef={formRef}
          returnTo={returnTo}
          options={options}
          onDone={() => { editDrafts.delete(record.id); setAiKeys([]); onClose(); }}
          onCancel={close}
          onReset={() => { editDrafts.delete(record.id); setAiKeys([]); setResetTick((n) => n + 1); }}
          aiKeys={aiKeys}
          onApply={apply}
        />
      )}
    </Dialog>
  );
}

const today = () => new Date().toLocaleDateString("sv-SE");
const PERIOD_LABEL: Record<string, string> = Object.fromEntries(PRICE_PERIODS);
function shown(key: string, v: string) {
  if (!v) return "-";
  if (key === "opty_status_code") return STAGE_LABEL[v] ?? v;
  if (key === "level_code") return LEVEL_LABEL[v] ?? v;
  if (key === "price_period_code") return PERIOD_LABEL[v] ?? v;
  if (key === "price_amount") return `Rp ${Number(v).toLocaleString("id-ID")}`;
  return v;
}

/** Edit Opportunity: the AI reads the account's latest emails (or pasted notes) and proposes changes; the person ticks
 *  which to take. Taken values land in the form, marked ✦; nothing is saved until Simpan. */
function UpdateFromEmail({ record, formRef, onApply }: { record: Opportunity; formRef: React.RefObject<HTMLFormElement | null>; onApply: (values: Draft) => void }) {
  const [rows, setRows] = useState<Suggestion[] | null>(null);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const take = rows?.filter((r) => !skip.has(r.key)) ?? [];
  return (
    <>
      <AiFill
        form="opportunity_update"
        opportunityId={record.id}
        label="Usulan update dari email terbaru (AI)"
        placeholder="Kosongkan untuk membaca email terbaru akun ini, atau tempel catatan call / chat klien…"
        onFill={({ fields, lastMail }) => { setRows(updateSuggestions(readDraft(formRef.current, ["return_to"]), fields, lastMail, today())); setSkip(new Set()); }}
      />
      {rows && !rows.length && <p className="mb-3 text-[0.75rem] text-slate-600">Tidak ada perubahan yang diusulkan; data sudah sesuai email terbaru.</p>}
      {!!rows?.length && (
        <div className="mb-3 rounded-lg border border-violet-200 bg-white" data-ai-suggestions>
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={r.key} className="flex items-start gap-2 px-3 py-2 text-[0.8125rem]">
                <Checkbox checked={!skip.has(r.key)} onChange={(e) => { const on = e.target.checked; setSkip((s) => { const n = new Set(s); if (on) n.delete(r.key); else n.add(r.key); return n; }); }} aria-label={`Terapkan ${r.label}`} />
                <span className="w-36 shrink-0 font-medium text-slate-700">{r.label}</span>
                <span className="min-w-0 flex-1 break-words text-slate-800">
                  {r.note && r.key === "progress_notes" ? <>+ {r.note}</> : <><span className="text-slate-500 line-through">{shown(r.key, r.current)}</span> → <b>{shown(r.key, r.proposed)}</b>{r.note ? <span className="text-slate-500"> ({r.note})</span> : null}</>}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2 border-t border-slate-100 px-3 py-2">
            <Button type="button" size="sm" intent="primary" disabled={!take.length} onClick={() => { onApply(Object.fromEntries(take.map((r) => [r.key, r.proposed]))); }}>Terapkan yang dipilih ({take.length})</Button>
            <button type="button" className="text-[0.75rem] text-slate-500 hover:underline" onClick={() => setRows(null)}>Abaikan</button>
          </div>
        </div>
      )}
    </>
  );
}

function EditForm({ record, draft: d, formRef, returnTo, options, onDone, onCancel, onReset, aiKeys = [], onApply }: Omit<FormProps, "options"> & { record: Opportunity; returnTo: string; options: FormOptions; aiKeys?: string[]; onApply: (values: Draft) => void }) {
  const { pending, onSubmit, t } = useSubmit((fd) => updateOpportunityTracker(record.id, fd), onDone);
  const ai = fillHint(aiKeys);
  return (
    <form ref={formRef} onSubmit={onSubmit}>
      <input type="hidden" name="return_to" value={returnTo} />
      <DialogBody>
        {record.leadNo && <p className="mb-3 text-[0.75rem] text-slate-600">Dari Marketing Lead <b className="font-mono text-slate-900">{record.leadNo}</b></p>}
        <UpdateFromEmail record={record} formRef={formRef} onApply={onApply} />
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-3">
          <F label="Nama Klien" required><Input name="client_name" required defaultValue={d.client_name} autoFocus /></F>
          <F label="Client Type"><Select name="client_type_code" defaultValue={d.client_type_code || undefined} options={opts(CLIENT_TYPES)} placeholder="-" /></F>
          <F label="Stage" hint={ai("opty_status_code")}><Select name="opty_status_code" defaultValue={d.opty_status_code} options={STAGES.map((s) => ({ value: s.id, label: s.title }))} /></F>

          <F label="Service Type"><Select name="service_type_code" defaultValue={d.service_type_code || undefined} options={opts(SERVICE_TYPES)} placeholder="-" /></F>
          <F label="Sales PIC" required><SalesPicSelect options={options.salesPics} defaultValue={d.sales_pic_name} /></F>
          <F label="Positions" hint={ai("position_name")}><PositionInput suggestions={options.positionSuggestions} defaultValue={d.position_name} /></F>

          <F label="Level" hint={ai("level_code")}><Select name="level_code" defaultValue={d.level_code || undefined} options={opts(LEVELS)} placeholder="-" /></F>
          <F label="Headcount" hint={ai("headcount_target")}><Input name="headcount_target" type="number" defaultValue={d.headcount_target} /></F>
          <F label="Estimasi Durasi (bulan)" hint={ai("estimated_duration_months")}><Input name="estimated_duration_months" type="number" defaultValue={d.estimated_duration_months} /></F>

          <F label="Price" hint={ai("price_amount")}><Money name="price_amount" defaultValue={d.price_amount} /></F>
          <F label="Price Period" hint={ai("price_period_code")}><Select name="price_period_code" defaultValue={d.price_period_code || undefined} options={opts(PRICE_PERIODS)} placeholder="-" /></F>
          <F label="Closing Price Deal"><Money name="estimated_deal_amount" defaultValue={d.estimated_deal_amount} /></F>

          <F label="BANTE Score"><Select name="bante_score" defaultValue={d.bante_score || undefined} options={opts(BANTE_SCORES)} placeholder="-" /></F>
          <F label="Last Communication" hint={ai("last_communication_date")}><Input name="last_communication_date" type="date" defaultValue={d.last_communication_date} /></F>
          <label className="flex items-center gap-2 self-end pb-1.5 text-[0.8125rem] font-medium text-slate-700">
            <Checkbox name="sales_qualified" value="true" defaultChecked={d.sales_qualified === "true"} /> Sales Qualified
          </label>

          <F label="Requirement Summary" span><Textarea name="requirement_summary" rows={2} defaultValue={d.requirement_summary} /></F>
          <F label="Detail Requirement" span><Textarea name="detail_requirement" rows={3} defaultValue={d.detail_requirement} /></F>
          <F label="Progress Notes" span hint={ai("progress_notes")}><Textarea name="progress_notes" rows={3} defaultValue={d.progress_notes} /></F>
          <F label="Dropped Reason" span hint={ai("dropped_reason")}><Textarea name="dropped_reason" rows={2} defaultValue={d.dropped_reason} /></F>
        </div>
      </DialogBody>
      <DraftFooter pending={pending} onCancel={onCancel} onReset={onReset} t={t} resetLabel="Kembalikan ke data tersimpan" />
    </form>
  );
}
