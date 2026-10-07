"use client";
// Create Opportunity and Extension Request in Crisp dialogs. Fields, names, required flags and server actions are the
// V1 ones, unchanged (docs/design/SALES-V2-CRISP-UX-CONTRACT.md §10); only the presentation is new.
// Contract §12: the dialog closes only from ×, Batal or Simpan (not Escape or a click outside), and what was typed is
// kept as a draft until it is saved or reset.
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { BriefcaseBusiness, ChevronDown, Plus, Repeat } from "lucide-react";
import { Button, Checkbox, Dialog, DialogBody, DialogFooter, FormField, Input, InputShell, Menu, MenuItem, Select, Textarea } from "@crisp-ui-kit/crisp";
import { MoneyInput } from "@/components/form-fields";
import { useToast } from "@/components/toast-provider";
import { createOpportunityTracker } from "@/app/sales/opportunity-tracker/actions";
import { createExtensionRequestFromSales } from "@/app/sales/actions";
import { BANTE_SCORES, BUSINESS_UNITS, CLIENT_TYPES, LEVELS, PRICE_PERIODS, PRIORITIES, SERVICE_TYPES, STAGE_LABEL } from "./model";

type Pairs = readonly (readonly [string, string])[];
const opts = (pairs: Pairs) => pairs.map(([value, label]) => ({ value, label }));

export type FormOptions = {
  leadOptions: { id: string; lead_no: string; client_name: string }[];
  positionSuggestions: string[];
  employeeOptions: { value: string; label: string }[];
};

/** A label above a Crisp control; `span` widens it to the full row. */
function F({ label, required, span, hint, children }: { label: string; required?: boolean; span?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <FormField label={label} required={required} description={hint} className={span ? "sm:col-span-3" : undefined}>
      {children}
    </FormField>
  );
}

type Draft = Record<string, string>;
export type CreateRequest = { kind: "opportunity" | "extension"; status?: string } | null;

function Money({ name, defaultValue }: { name: string; defaultValue?: string }) {
  return (
    <InputShell>
      <MoneyInput name={name} defaultValue={defaultValue} className="crisp-input-value" />
    </InputShell>
  );
}

function PositionInput({ suggestions, defaultValue }: { suggestions: string[]; defaultValue?: string }) {
  const listId = useId();
  return (
    <>
      <Input name="position_name" list={listId} autoComplete="off" defaultValue={defaultValue} />
      <datalist id={listId}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
    </>
  );
}

/** Shared submit: run the existing action, close, confirm, refresh the workspace. Errors stay in the dialog. */
function useSubmit(action: (fd: FormData) => Promise<void>, onDone: () => void) {
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
        showToast((err as Error)?.message || t("saveFailed"), "error");
      }
    });
  }
  return { pending, onSubmit, t };
}

type FormProps = { options: FormOptions; draft: Draft; formRef: React.RefObject<HTMLFormElement | null>; onDone: () => void; onCancel: () => void; onReset: () => void };

function DraftFooter({ pending, onCancel, onReset, t }: { pending: boolean; onCancel: () => void; onReset: () => void; t: (k: string) => string }) {
  return (
    <DialogFooter>
      <button type="button" onClick={onReset} disabled={pending} className="mr-auto text-[12px] text-slate-500 hover:text-slate-800 hover:underline">Kosongkan form</button>
      <Button type="button" intent="neutral" size="sm" onClick={onCancel} disabled={pending}>{t("cancel")}</Button>
      <Button type="submit" intent="primary" size="sm" loading={pending}>{pending ? t("saving") : t("save")}</Button>
    </DialogFooter>
  );
}

function OpportunityForm({ options, draft: d, formRef, onDone, onCancel, onReset, status }: FormProps & { status?: string }) {
  const { pending, onSubmit, t } = useSubmit(createOpportunityTracker, onDone);
  const [leadId, setLeadId] = useState(d.lead_id ?? "");
  const lead = options.leadOptions.find((l) => l.id === leadId);
  const clientDefault = leadId === (d.lead_id ?? "") && d.client_name != null ? d.client_name : lead?.client_name ?? "";
  return (
    <form ref={formRef} onSubmit={onSubmit}>
      {status && <input type="hidden" name="opty_status_code" value={status} />}
      <DialogBody className="max-h-[calc(85dvh-8.5rem)] overflow-y-auto">
        {status && <p className="mb-3 text-[12px] text-slate-600">Stage awal: <b className="text-slate-900">{STAGE_LABEL[status] ?? status}</b></p>}
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
          <F label="Nama Klien" required hint={lead ? "Otomatis dari Lead, bisa diedit" : undefined}>
            <Input key={`client-${leadId}`} name="client_name" required defaultValue={clientDefault} autoFocus />
          </F>
          <F label="Client Type"><Select name="client_type_code" defaultValue={d.client_type_code} options={opts(CLIENT_TYPES)} placeholder="-" /></F>

          <F label="Service Type"><Select name="service_type_code" defaultValue={d.service_type_code} options={opts(SERVICE_TYPES)} placeholder="-" /></F>
          <F label="Sales PIC" required><Input name="sales_pic_name" required defaultValue={d.sales_pic_name} /></F>
          <F label="Positions"><PositionInput suggestions={options.positionSuggestions} defaultValue={d.position_name} /></F>

          <F label="Level"><Select name="level_code" defaultValue={d.level_code} options={opts(LEVELS)} placeholder="-" /></F>
          <F label="Headcount"><Input name="headcount_target" type="number" defaultValue={d.headcount_target} /></F>
          <F label="Estimasi Durasi (bulan)"><Input name="estimated_duration_months" type="number" defaultValue={d.estimated_duration_months} /></F>

          <F label="Price"><Money name="price_amount" defaultValue={d.price_amount} /></F>
          <F label="Price Period"><Select name="price_period_code" defaultValue={d.price_period_code ?? "monthly"} options={opts(PRICE_PERIODS)} /></F>
          <F label="Closing Price Deal"><Money name="estimated_deal_amount" defaultValue={d.estimated_deal_amount} /></F>

          <F label="BANTE Score"><Select name="bante_score" defaultValue={d.bante_score} options={opts(BANTE_SCORES)} placeholder="-" /></F>
          <F label="Last Communication"><Input name="last_communication_date" type="date" defaultValue={d.last_communication_date} /></F>
          <label className="flex items-center gap-2 self-end pb-1.5 text-[13px] font-medium text-slate-700">
            <Checkbox name="sales_qualified" value="true" defaultChecked={d.sales_qualified === "true"} /> Sales Qualified
          </label>

          <F label="Requirement Summary" span><Textarea name="requirement_summary" rows={2} defaultValue={d.requirement_summary} /></F>
          <F label="Detail Requirement" span><Textarea name="detail_requirement" rows={3} defaultValue={d.detail_requirement} /></F>
        </div>
      </DialogBody>
      <DraftFooter pending={pending} onCancel={onCancel} onReset={onReset} t={t} />
    </form>
  );
}

function ExtensionForm({ options, draft: d, formRef, onDone, onCancel, onReset }: FormProps) {
  const { pending, onSubmit, t } = useSubmit(createExtensionRequestFromSales, onDone);
  return (
    <form ref={formRef} onSubmit={onSubmit}>
      <DialogBody className="max-h-[calc(85dvh-8.5rem)] overflow-y-auto">
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-3">
          <F label="Talent yang di-extend" required span hint="Bikin PQ baru buat deal perpanjangan ini + otomatis masuk sebagai request pending di TM Extension Request (TM lengkapi rincian gaji & approval chain-nya).">
            <Select name="employee_id" required searchable defaultValue={d.employee_id} options={options.employeeOptions} placeholder="Pilih talent" />
          </F>

          <F label="Client Name" required><Input name="client_name" required defaultValue={d.client_name} /></F>
          <F label="Client Type"><Select name="client_type_code" defaultValue={d.client_type_code} options={opts(CLIENT_TYPES)} placeholder="-" /></F>
          <F label="Project Name" required><Input name="project_name" required defaultValue={d.project_name} /></F>

          <F label="Positions"><PositionInput suggestions={options.positionSuggestions} defaultValue={d.position_name} /></F>
          <F label="Service Type" required><Select name="service_type_code" required defaultValue={d.service_type_code} options={opts(SERVICE_TYPES)} placeholder="-" /></F>
          <F label="Business Unit"><Select name="business_unit_code" defaultValue={d.business_unit_code} options={opts(BUSINESS_UNITS)} placeholder="-" /></F>

          <F label="Level"><Select name="level_code" defaultValue={d.level_code} options={opts(LEVELS)} placeholder="-" /></F>
          <F label="Headcount"><Input name="headcount_target" type="number" defaultValue={d.headcount_target} /></F>
          <F label="Estimasi Durasi (bulan)"><Input name="estimated_duration_months" type="number" defaultValue={d.estimated_duration_months} /></F>

          <F label="Priority"><Select name="priority_code" defaultValue={d.priority_code} options={opts(PRIORITIES)} placeholder="-" /></F>
          <F label="Price"><Money name="price_amount" defaultValue={d.price_amount} /></F>
          <F label="Price Period"><Select name="price_period_code" defaultValue={d.price_period_code ?? "monthly"} options={opts(PRICE_PERIODS)} /></F>

          <F label="Sales PIC" required><Input name="sales_pic_name" required defaultValue={d.sales_pic_name} /></F>
          <F label="Start Date"><Input name="start_date" type="date" defaultValue={d.start_date} /></F>
          <F label="End Date"><Input name="end_date" type="date" defaultValue={d.end_date} /></F>

          <F label="Notes" span><Textarea name="notes" rows={3} defaultValue={d.notes} /></F>
        </div>
      </DialogBody>
      <DraftFooter pending={pending} onCancel={onCancel} onReset={onReset} t={t} />
    </form>
  );
}

const TITLES = { opportunity: "Tambah Opportunity Baru", extension: "Add Extension Request" } as const;

/**
 * The page's one primary action: New ▾ → New Opportunity / Extension Request. `create` is owned by the workspace so a
 * Kanban column's "+" can open the same dialog with that stage preset.
 */
export function CreateMenu({ options, create, onCreate }: { options: FormOptions; create: CreateRequest; onCreate: (r: CreateRequest) => void }) {
  const drafts = useRef<Record<string, Draft>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const [resetTick, setResetTick] = useState(0);
  // Crisp's Dialog reports ×, Escape and outside clicks alike as onOpenChange(false); only × may close (§12), so the
  // click that lands on its close button is noted first (capture phase runs before the button's own handler).
  const viaClose = useRef(false);
  useEffect(() => {
    if (!create) return;
    const mark = (e: MouseEvent) => { viaClose.current = !!(e.target as Element | null)?.closest?.(".crisp-dialog-close"); };
    document.addEventListener("click", mark, true);
    return () => document.removeEventListener("click", mark, true);
  }, [create]);

  const kind = create?.kind;
  const keepDraft = () => {
    if (!kind || !formRef.current) return;
    const d: Draft = {};
    new FormData(formRef.current).forEach((v, k) => { if (typeof v === "string" && k !== "opty_status_code") d[k] = v; });
    drafts.current[kind] = d;
  };
  const close = () => { keepDraft(); onCreate(null); };
  const done = () => { if (kind) drafts.current[kind] = {}; onCreate(null); };
  const reset = () => { if (kind) drafts.current[kind] = {}; setResetTick((n) => n + 1); };
  const props = { options, formRef, draft: (kind && drafts.current[kind]) || {}, onDone: done, onCancel: close, onReset: reset };

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
        onOpenChange={(o) => { if (!o && viaClose.current) close(); viaClose.current = false; }}
        title={kind ? TITLES[kind] : ""}
        icon={kind === "extension" ? <Repeat size={16} /> : <BriefcaseBusiness size={16} />}
        closeLabel="Tutup"
        width={760}
        data-sales-v2-dialog={kind}
      >
        {kind === "opportunity" && <OpportunityForm key={`o${resetTick}`} {...props} status={create?.status} />}
        {kind === "extension" && <ExtensionForm key={`e${resetTick}`} {...props} />}
      </Dialog>
    </>
  );
}
