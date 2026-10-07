"use client";
// Create Opportunity and Extension Request in Crisp dialogs. Fields, names, required flags and server actions are the
// V1 ones, unchanged (docs/design/SALES-V2-CRISP-UX-CONTRACT.md §10); only the presentation is new.
import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown, Plus } from "lucide-react";
import { Button, Checkbox, Dialog, DialogBody, DialogFooter, FormField, Input, InputShell, Menu, MenuItem, Select, Textarea } from "@crisp-ui-kit/crisp";
import { MoneyInput } from "@/components/form-fields";
import { useToast } from "@/components/toast-provider";
import { createOpportunityTracker } from "@/app/sales/opportunity-tracker/actions";
import { createExtensionRequestFromSales } from "@/app/sales/actions";
import { BANTE_SCORES, BUSINESS_UNITS, CLIENT_TYPES, LEVELS, PRICE_PERIODS, PRIORITIES, SERVICE_TYPES } from "./model";

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

function Money({ name, defaultValue }: { name: string; defaultValue?: string }) {
  return (
    <InputShell>
      <MoneyInput name={name} defaultValue={defaultValue} className="crisp-input-value" />
    </InputShell>
  );
}

function PositionInput({ suggestions }: { suggestions: string[] }) {
  const listId = useId();
  return (
    <>
      <Input name="position_name" list={listId} autoComplete="off" />
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

function OpportunityForm({ options, onDone, onCancel }: { options: FormOptions; onDone: () => void; onCancel: () => void }) {
  const { pending, onSubmit, t } = useSubmit(createOpportunityTracker, onDone);
  const [leadId, setLeadId] = useState("");
  const lead = options.leadOptions.find((l) => l.id === leadId);
  return (
    <form onSubmit={onSubmit}>
      <DialogBody className="max-h-[calc(85dvh-8.5rem)] overflow-y-auto">
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
            <Input key={`client-${leadId}`} name="client_name" required defaultValue={lead?.client_name ?? ""} autoFocus />
          </F>
          <F label="Client Type"><Select name="client_type_code" options={opts(CLIENT_TYPES)} placeholder="-" /></F>

          <F label="Service Type"><Select name="service_type_code" options={opts(SERVICE_TYPES)} placeholder="-" /></F>
          <F label="Sales PIC" required><Input name="sales_pic_name" required /></F>
          <F label="Positions"><PositionInput suggestions={options.positionSuggestions} /></F>

          <F label="Level"><Select name="level_code" options={opts(LEVELS)} placeholder="-" /></F>
          <F label="Headcount"><Input name="headcount_target" type="number" /></F>
          <F label="Estimasi Durasi (bulan)"><Input name="estimated_duration_months" type="number" /></F>

          <F label="Price"><Money name="price_amount" /></F>
          <F label="Price Period"><Select name="price_period_code" defaultValue="monthly" options={opts(PRICE_PERIODS)} /></F>
          <F label="Closing Price Deal"><Money name="estimated_deal_amount" /></F>

          <F label="BANTE Score"><Select name="bante_score" options={opts(BANTE_SCORES)} placeholder="-" /></F>
          <F label="Last Communication"><Input name="last_communication_date" type="date" /></F>
          <label className="flex items-center gap-2 self-end pb-1.5 text-[13px] font-medium text-slate-700">
            <Checkbox name="sales_qualified" value="true" /> Sales Qualified
          </label>

          <F label="Requirement Summary" span><Textarea name="requirement_summary" rows={2} /></F>
          <F label="Detail Requirement" span><Textarea name="detail_requirement" rows={3} /></F>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type="button" intent="neutral" size="sm" onClick={onCancel} disabled={pending}>{t("cancel")}</Button>
        <Button type="submit" intent="primary" size="sm" loading={pending}>{pending ? t("saving") : t("save")}</Button>
      </DialogFooter>
    </form>
  );
}

function ExtensionForm({ options, onDone, onCancel }: { options: FormOptions; onDone: () => void; onCancel: () => void }) {
  const { pending, onSubmit, t } = useSubmit(createExtensionRequestFromSales, onDone);
  return (
    <form onSubmit={onSubmit}>
      <DialogBody className="max-h-[calc(85dvh-8.5rem)] overflow-y-auto">
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-3">
          <F label="Talent yang di-extend" required span hint="Bikin PQ baru buat deal perpanjangan ini + otomatis masuk sebagai request pending di TM Extension Request (TM lengkapi rincian gaji & approval chain-nya).">
            <Select name="employee_id" required searchable options={options.employeeOptions} placeholder="Pilih talent" />
          </F>

          <F label="Client Name" required><Input name="client_name" required /></F>
          <F label="Client Type"><Select name="client_type_code" options={opts(CLIENT_TYPES)} placeholder="-" /></F>
          <F label="Project Name" required><Input name="project_name" required /></F>

          <F label="Positions"><PositionInput suggestions={options.positionSuggestions} /></F>
          <F label="Service Type" required><Select name="service_type_code" required options={opts(SERVICE_TYPES)} placeholder="-" /></F>
          <F label="Business Unit"><Select name="business_unit_code" options={opts(BUSINESS_UNITS)} placeholder="-" /></F>

          <F label="Level"><Select name="level_code" options={opts(LEVELS)} placeholder="-" /></F>
          <F label="Headcount"><Input name="headcount_target" type="number" /></F>
          <F label="Estimasi Durasi (bulan)"><Input name="estimated_duration_months" type="number" /></F>

          <F label="Priority"><Select name="priority_code" options={opts(PRIORITIES)} placeholder="-" /></F>
          <F label="Price"><Money name="price_amount" /></F>
          <F label="Price Period"><Select name="price_period_code" defaultValue="monthly" options={opts(PRICE_PERIODS)} /></F>

          <F label="Sales PIC" required><Input name="sales_pic_name" required /></F>
          <F label="Start Date"><Input name="start_date" type="date" /></F>
          <F label="End Date"><Input name="end_date" type="date" /></F>

          <F label="Notes" span><Textarea name="notes" rows={3} /></F>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type="button" intent="neutral" size="sm" onClick={onCancel} disabled={pending}>{t("cancel")}</Button>
        <Button type="submit" intent="primary" size="sm" loading={pending}>{pending ? t("saving") : t("save")}</Button>
      </DialogFooter>
    </form>
  );
}

/** The page's one primary action: New ▾ → New Opportunity / Extension Request. */
export function CreateMenu({ options }: { options: FormOptions }) {
  const [open, setOpen] = useState<null | "opportunity" | "extension">(null);
  const close = () => setOpen(null);
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
        <MenuItem onSelect={() => setOpen("opportunity")}>New Opportunity</MenuItem>
        <MenuItem onSelect={() => setOpen("extension")}>Extension Request</MenuItem>
      </Menu>
      <Dialog open={open === "opportunity"} onOpenChange={(o) => !o && close()} title="Tambah Opportunity Baru" width={760}>
        {open === "opportunity" && <OpportunityForm options={options} onDone={close} onCancel={close} />}
      </Dialog>
      <Dialog open={open === "extension"} onOpenChange={(o) => !o && close()} title="Add Extension Request" width={760}>
        {open === "extension" && <ExtensionForm options={options} onDone={close} onCancel={close} />}
      </Dialog>
    </>
  );
}
