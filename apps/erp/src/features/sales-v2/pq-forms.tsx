"use client";
// PQ Tracker create and edit in Crisp dialogs. Fields, names, required flags and server actions are V1's
// (app/sales/page.tsx "Tambah PQ Baru", app/sales/[id]/edit); only the presentation is new. Same rules as the
// Opportunity dialogs (contract §12): close only from ×, Batal or Simpan; what was typed is kept as a draft.
import { useRef, useState } from "react";
import { FilePlus2, Plus, SquarePen } from "lucide-react";
import { Button, Dialog, DialogBody, Input, Select, Textarea } from "@crisp-ui-kit/crisp";
import { PicSelect } from "@/components/pic-select";
import { MultiFileUpload } from "@/components/multi-file-upload";
import { createOpportunity, deleteOpportunityAttachment, updateOpportunity } from "@/app/sales/actions";
import { GeneratePqButton } from "@/app/sales/generate-pq-button";
import { DOC_STATUS_OPTIONS, OPTY_STATUS, PIPELINE_STAGES, SALES_TYPES } from "@/app/sales/pq-constants";
import { AiFill, DraftFooter, F, Money, PositionInput, fillHint, opts, readDraft, useCloseFromXOnly, useSubmit, type AiFillResult, type Draft } from "./forms";
import { mergeFill, pqCreateFields } from "./ai-fill";
import { BANTE_SCORES, BUSINESS_UNITS, CLIENT_TYPES, LEVELS, PRICE_PERIODS, PRIORITIES, SERVICE_TYPES } from "./model";
import { PQ_STAGE_LABEL, pqEditValues, type Pq, type PqFile } from "./pq-model";
import type { PqOptions } from "./pq-data";

const PMO_HINT = "Otomatis dipakai buat Document Tracker & Contract Tracker di PMO";
const existing = (list: PqFile[]) => list.map((a) => ({ id: a.id, file_name: a.name, url: a.url, kind: a.kind }));
const AI_LABEL = "Isi dari PO / PKS (AI)";
const AI_PLACEHOLDER = "…atau tempel teks PO, PKS atau email konfirmasi klien di sini";

/** AI fill for a PQ form: fills what is empty, at its default, or AI-filled before; returns the merged draft and keys. */
function usePqFill(formRef: React.RefObject<HTMLFormElement | null>, defaults: Draft, onDraft: (d: Draft) => void, create: boolean) {
  const [aiKeys, setAiKeys] = useState<string[]>([]);
  const onFill = ({ fields }: AiFillResult) => {
    const { draft, filled } = mergeFill(readDraft(formRef.current, ["return_to"]), create ? pqCreateFields(fields) : fields, defaults, aiKeys);
    setAiKeys((k) => Array.from(new Set([...k, ...filled])));
    onDraft(draft);
  };
  return { aiKeys, onFill, clear: () => setAiKeys([]) };
}

export type PqCreateRequest = { stage?: string } | null;

/** "+ New": V1's "Tambah PQ Baru". `create` is owned by the workspace so a Kanban column's "+" presets its stage. */
export function CreatePq({ options, create, onCreate, returnPath }: { options: PqOptions; create: PqCreateRequest; onCreate: (r: PqCreateRequest) => void; returnPath: string }) {
  const draft = useRef<Draft>({});
  const formRef = useRef<HTMLFormElement>(null);
  const [resetTick, setResetTick] = useState(0);
  const close = () => { draft.current = readDraft(formRef.current); onCreate(null); };
  const onOpenChange = useCloseFromXOnly(!!create, close);
  const fill = usePqFill(formRef, { price_period_code: "monthly", pipeline_stage_code: "on_going" }, (d) => { draft.current = d; setResetTick((n) => n + 1); }, true);
  return (
    <>
      <Button intent="primary" size="sm" onClick={() => onCreate({})} data-testid="sales-v2-new">
        <Plus size={14} strokeWidth={2.25} /> New
      </Button>
      <Dialog open={!!create} onOpenChange={onOpenChange} title="Tambah PQ Baru" icon={<FilePlus2 size={16} />} closeLabel="Tutup" width={760} data-sales-v2-dialog="pq-create">
        {create && (
          <CreateForm
            key={resetTick}
            options={options}
            draft={create.stage ? { ...draft.current, pipeline_stage_code: create.stage } : draft.current}
            formRef={formRef}
            returnPath={returnPath}
            onDone={() => { draft.current = {}; fill.clear(); onCreate(null); }}
            onCancel={close}
            onReset={() => { draft.current = {}; fill.clear(); setResetTick((n) => n + 1); }}
            aiKeys={fill.aiKeys}
            onAiFill={fill.onFill}
          />
        )}
      </Dialog>
    </>
  );
}

type FormProps = {
  options: PqOptions; draft: Draft; formRef: React.RefObject<HTMLFormElement | null>; onDone: () => void; onCancel: () => void; onReset: () => void;
  aiKeys: string[]; onAiFill: (r: AiFillResult) => void;
};

function CreateForm({ options, draft: d, formRef, returnPath, onDone, onCancel, onReset, aiKeys, onAiFill }: FormProps & { returnPath: string }) {
  const { pending, onSubmit, t } = useSubmit(createOpportunity, onDone);
  const ai = fillHint(aiKeys);
  return (
    <form ref={formRef} onSubmit={onSubmit}>
      <DialogBody>
        <AiFill form="pq" file label={AI_LABEL} placeholder={AI_PLACEHOLDER} onFill={onAiFill} />
        {aiKeys.includes("notes") && <p className="mb-2 text-[0.75rem] text-slate-600">No PO / PKS dari dokumen ditaruh di Notes; isi kolom Dokumen Legal lewat Edit setelah PQ tersimpan.</p>}
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-3">
          <F label="Nama Klien" required hint={ai("client_name")}><Input name="client_name" required defaultValue={d.client_name} autoFocus /></F>
          <F label="Client Type"><Select name="client_type_code" defaultValue={d.client_type_code} options={opts(CLIENT_TYPES)} placeholder="-" /></F>
          <F label="Nama Project" required hint={ai("project_name")}><Input name="project_name" required defaultValue={d.project_name} /></F>

          <F label="Positions" hint={ai("position_name")}><PositionInput suggestions={options.positionSuggestions} defaultValue={d.position_name} /></F>
          <F label="Service Type" required hint={ai("service_type_code")}><Select name="service_type_code" required defaultValue={d.service_type_code} options={opts(SERVICE_TYPES)} placeholder="-" /></F>
          <F label="Business Unit" hint={ai("business_unit_code")}><Select name="business_unit_code" defaultValue={d.business_unit_code} options={opts(BUSINESS_UNITS)} placeholder="-" /></F>

          <F label="Level" hint={ai("level_code")}><Select name="level_code" defaultValue={d.level_code} options={opts(LEVELS)} placeholder="-" /></F>
          <F label="Headcount" hint={ai("headcount_target")}><Input name="headcount_target" type="number" defaultValue={d.headcount_target} /></F>
          <F label="Estimasi Durasi (bulan)" hint={ai("estimated_duration_months")}><Input name="estimated_duration_months" type="number" defaultValue={d.estimated_duration_months} /></F>

          <F label="Priority"><Select name="priority_code" defaultValue={d.priority_code} options={opts(PRIORITIES)} placeholder="-" /></F>
          <F label="BANTE Score"><Select name="bant_score" defaultValue={d.bant_score} options={opts(BANTE_SCORES)} placeholder="-" /></F>
          <F label="Price" hint={ai("price_amount")}><Money name="price_amount" defaultValue={d.price_amount} /></F>

          <F label="Price Period" hint={ai("price_period_code")}><Select name="price_period_code" defaultValue={d.price_period_code ?? "monthly"} options={opts(PRICE_PERIODS)} /></F>
          <PicSelect name="sales_pic_name" label="Sales PIC" options={options.picNames} defaultValue={d.sales_pic_name} required currentPath={returnPath} />
          <F label="Pipeline Stage"><Select name="pipeline_stage_code" defaultValue={d.pipeline_stage_code ?? "on_going"} options={opts(PIPELINE_STAGES)} /></F>

          <F label="Opty Status"><Select name="opty_status_code" defaultValue={d.opty_status_code} options={opts(OPTY_STATUS)} placeholder="-" /></F>
          <F label="Opty Request Date"><Input name="opty_request_date" type="date" defaultValue={d.opty_request_date} /></F>
          <F label="Approval Date" hint={ai("approval_date")}><Input name="approval_date" type="date" defaultValue={d.approval_date} /></F>

          <F label="Start Date" hint={ai("start_date", PMO_HINT)}><Input name="start_date" type="date" defaultValue={d.start_date} /></F>
          <F label="End Date" hint={ai("end_date", PMO_HINT)}><Input name="end_date" type="date" defaultValue={d.end_date} /></F>
          <div />

          <div className="sm:col-span-3"><MultiFileUpload name="attachments" label="PO Doc" /></div>
          <div className="sm:col-span-3"><MultiFileUpload name="pq_attachments" label="Dokumen PQ" /></div>
          <F label="Notes" span hint={ai("notes")}><Textarea name="notes" rows={3} defaultValue={d.notes} /></F>
        </div>
      </DialogBody>
      <DraftFooter pending={pending} onCancel={onCancel} onReset={onReset} t={t} />
    </form>
  );
}

// Drafts per record survive closing the dialog (and the panel) for this browser session.
const editDrafts = new Map<string, Draft>();

/** V1's full edit page in a dialog: every field it posts, the PMO Document Tracker fields included. */
export function EditPqDialog({ record, open, onClose, returnTo, options }: { record: Pq; open: boolean; onClose: () => void; returnTo: string; options: PqOptions }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [resetTick, setResetTick] = useState(0);
  const close = () => { editDrafts.set(record.id, readDraft(formRef.current, ["return_to"])); onClose(); };
  const onOpenChange = useCloseFromXOnly(open, close);
  const fill = usePqFill(formRef, {}, (d) => { editDrafts.set(record.id, d); setResetTick((n) => n + 1); }, false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Edit ${record.optyNo}`} icon={<SquarePen size={16} />} closeLabel="Tutup" width={820} data-sales-v2-dialog="pq-edit">
      {open && (
        <EditForm
          key={`${record.id}-${resetTick}`}
          record={record}
          draft={editDrafts.get(record.id) ?? pqEditValues(record)}
          formRef={formRef}
          returnTo={returnTo}
          options={options}
          onDone={() => { editDrafts.delete(record.id); fill.clear(); onClose(); }}
          onCancel={close}
          onReset={() => { editDrafts.delete(record.id); fill.clear(); setResetTick((n) => n + 1); }}
          aiKeys={fill.aiKeys}
          onAiFill={fill.onFill}
        />
      )}
    </Dialog>
  );
}

function EditForm({ record, draft: d, formRef, returnTo, options, onDone, onCancel, onReset, aiKeys, onAiFill }: FormProps & { record: Pq; returnTo: string }) {
  const { pending, onSubmit, t } = useSubmit((fd) => updateOpportunity(record.id, fd), onDone);
  const ai = fillHint(aiKeys);
  return (
    <form ref={formRef} onSubmit={onSubmit}>
      <input type="hidden" name="return_to" value={returnTo} />
      <DialogBody>
        <p className="mb-3 text-[0.75rem] text-slate-600">
          Pipeline <b className="text-slate-900">{PQ_STAGE_LABEL[record.stage] ?? record.stage}</b> · diubah dari panel, seperti di V1.
        </p>
        <AiFill form="pq" file label={`${AI_LABEL} · hanya mengisi yang kosong`} placeholder={AI_PLACEHOLDER} onFill={onAiFill} />
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-3">
          <F label="Nama Klien" required hint={ai("client_name")}><Input name="client_name" required defaultValue={d.client_name} autoFocus /></F>
          <F label="Client Type"><Select name="client_type_code" defaultValue={d.client_type_code || undefined} options={opts(CLIENT_TYPES)} placeholder="-" /></F>
          <F label="Nama Project" required hint={ai("project_name")}><Input name="project_name" required defaultValue={d.project_name} /></F>

          <F label="Positions" hint={ai("position_name")}><PositionInput suggestions={options.positionSuggestions} defaultValue={d.position_name} /></F>
          <F label="Service Type" required hint={ai("service_type_code")}><Select name="service_type_code" required defaultValue={d.service_type_code || undefined} options={opts(SERVICE_TYPES)} placeholder="-" /></F>
          <F label="Business Unit" hint={ai("business_unit_code")}><Select name="business_unit_code" defaultValue={d.business_unit_code || undefined} options={opts(BUSINESS_UNITS)} placeholder="-" /></F>

          <F label="Level" hint={ai("level_code")}><Select name="level_code" defaultValue={d.level_code || undefined} options={opts(LEVELS)} placeholder="-" /></F>
          <F label="Headcount" hint={ai("headcount_target")}><Input name="headcount_target" type="number" defaultValue={d.headcount_target} /></F>
          <F label="Estimasi Durasi (bulan)" hint={ai("estimated_duration_months")}><Input name="estimated_duration_months" type="number" defaultValue={d.estimated_duration_months} /></F>

          <F label="Priority"><Select name="priority_code" defaultValue={d.priority_code || undefined} options={opts(PRIORITIES)} placeholder="-" /></F>
          <F label="BANT Score"><Select name="bant_score" defaultValue={d.bant_score || undefined} options={opts(BANTE_SCORES)} placeholder="-" /></F>
          <F label="Price" hint={ai("price_amount")}><Money name="price_amount" defaultValue={d.price_amount} /></F>

          <F label="Price Period" hint={ai("price_period_code")}><Select name="price_period_code" defaultValue={d.price_period_code || "monthly"} options={opts(PRICE_PERIODS)} /></F>
          <PicSelect name="sales_pic_name" label="Sales PIC" options={options.picNames} defaultValue={d.sales_pic_name} required currentPath={returnTo.split("?")[0]} />
          <div>
            <F label="PQ Number"><Input name="pq_no" defaultValue={d.pq_no} /></F>
            {/* V1's generator: fills PQ Number from Client, Business Unit, Service Type and Approval Date in this form. */}
            <GeneratePqButton suggestedSeq={options.suggestedSeq} clients={options.clients} />
          </div>

          <F label="Opty Request Date"><Input name="opty_request_date" type="date" defaultValue={d.opty_request_date} /></F>
          <F label="Approval Date" hint={ai("approval_date")}><Input name="approval_date" type="date" defaultValue={d.approval_date} /></F>
          <F label="Link PO Doc (lama)"><Input name="po_doc_url" defaultValue={d.po_doc_url} /></F>

          <F label="Start Date" hint={ai("start_date", PMO_HINT)}><Input name="start_date" type="date" defaultValue={d.start_date} /></F>
          <F label="End Date" hint={ai("end_date", PMO_HINT)}><Input name="end_date" type="date" defaultValue={d.end_date} /></F>
          <div />
        </div>

        <fieldset className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <legend className="px-1 text-[0.75rem] font-semibold text-slate-700">Dokumen Legal Project · sinkron dengan Document Tracker PMO</legend>
          <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-4">
            <div className="sm:col-span-3"><F label="Project Details" hint={ai("project_details")}><Textarea name="project_details" rows={2} defaultValue={d.project_details} /></F></div>
            <F label="Sales Type" hint={ai("sales_type_code")}><Select name="sales_type_code" defaultValue={d.sales_type_code || undefined} options={opts(SALES_TYPES)} placeholder="-" /></F>
            <F label="No PKS" hint={ai("pks_no")}><Input name="pks_no" defaultValue={d.pks_no} /></F>
            <F label="Status PKS"><Select name="pks_status_code" defaultValue={d.pks_status_code || undefined} options={opts(DOC_STATUS_OPTIONS)} placeholder="-" /></F>
            <F label="No PO" hint={ai("po_no")}><Input name="po_no" defaultValue={d.po_no} /></F>
            <F label="Status PO"><Select name="po_status_code" defaultValue={d.po_status_code || undefined} options={opts(DOC_STATUS_OPTIONS)} placeholder="-" /></F>
            <F label="No CR" hint={ai("cr_no")}><Input name="cr_no" defaultValue={d.cr_no} /></F>
            <F label="Status CR"><Select name="cr_status_code" defaultValue={d.cr_status_code || undefined} options={opts(DOC_STATUS_OPTIONS)} placeholder="-" /></F>
            <F label="No Dokumen Lain"><Input name="other_doc_no" defaultValue={d.other_doc_no} /></F>
            <F label="Status Dokumen Lain"><Select name="other_doc_status_code" defaultValue={d.other_doc_status_code || undefined} options={opts(DOC_STATUS_OPTIONS)} placeholder="-" /></F>
          </div>
          <p className="mt-2 text-[0.75rem] text-slate-500">Upload file/link dokumennya tetap lewat Document Tracker PMO.</p>
        </fieldset>

        <div className="mt-4 grid grid-cols-1 gap-3">
          <MultiFileUpload name="attachments" label="PO Doc" existingFiles={existing(record.poDocs)} onDeleteExisting={deleteOpportunityAttachment} />
          <MultiFileUpload name="pq_attachments" label="Dokumen PQ" existingFiles={existing(record.pqDocs)} onDeleteExisting={deleteOpportunityAttachment} />
          <F label="Notes" hint={ai("notes")}><Textarea name="notes" rows={3} defaultValue={d.notes} /></F>
        </div>
      </DialogBody>
      <DraftFooter pending={pending} onCancel={onCancel} onReset={onReset} t={t} resetLabel="Kembalikan ke data tersimpan" />
    </form>
  );
}
