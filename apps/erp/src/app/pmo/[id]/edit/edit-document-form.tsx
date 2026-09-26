"use client";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { Field, SelectField } from "@/components/form-fields";
import { MultiFileUpload, type ExistingAttachment } from "@/components/multi-file-upload";
import { formatThousands, stripThousands } from "@/lib/money-format";

const STATUS_OPTIONS = [["draft", "Draft"], ["in_review", "In Review"], ["signed", "Signed"], ["expired", "Expired"]] as const;

// Sama seperti monthsBetween di src/components/opportunity-picker.tsx.
function monthsBetween(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 0;
  return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
}

export function EditDocumentForm({
  action,
  onDeleteAttachment,
  defaultProjectDetails,
  defaultPqPrice,
  defaultPksNo, defaultPksUrl, defaultPksStatus, pksAttachments,
  defaultPoStartDate, defaultPoEndDate, defaultPoNo, defaultPoUrl, defaultPoStatus, poAttachments,
  defaultCrNo, defaultCrUrl, defaultCrStatus, crAttachments,
  defaultOtherDocNo, defaultOtherDocUrl, defaultOtherDocStatus, otherAttachments,
  salesPriceAmount, salesStartDate, salesEndDate, salesPqNo,
  backHref,
}: {
  action: (formData: FormData) => Promise<void> | void;
  onDeleteAttachment: (id: string) => Promise<void> | void;
  defaultProjectDetails: string;
  defaultPqPrice: string;
  defaultPksNo: string; defaultPksUrl: string; defaultPksStatus: string; pksAttachments: ExistingAttachment[];
  defaultPoStartDate: string; defaultPoEndDate: string; defaultPoNo: string; defaultPoUrl: string; defaultPoStatus: string; poAttachments: ExistingAttachment[];
  defaultCrNo: string; defaultCrUrl: string; defaultCrStatus: string; crAttachments: ExistingAttachment[];
  defaultOtherDocNo: string; defaultOtherDocUrl: string; defaultOtherDocStatus: string; otherAttachments: ExistingAttachment[];
  /** Nilai terkini di Opportunity (Sales) -- dipakai tombol "Tarik dari Sales", bukan auto-overwrite diam-diam. */
  salesPriceAmount: number | null;
  salesStartDate: string | null;
  salesEndDate: string | null;
  /** PQ No hidup di tabel opportunities (Sales), bukan project_documents -- ditampilkan read-only saja, tidak disimpan/di-duplikasi. */
  salesPqNo: string | null;
  backHref: string;
}) {
  const t = useTranslations("pmo");
  const tc = useTranslations("common");

  const [price, setPrice] = useState(defaultPqPrice);
  const [poStart, setPoStart] = useState(defaultPoStartDate);
  const [poEnd, setPoEnd] = useState(defaultPoEndDate);

  const duration = useMemo(() => (poStart && poEnd ? monthsBetween(poStart, poEnd) : 0), [poStart, poEnd]);
  const total = useMemo(() => (Number(price) || 0) * duration, [price, duration]);

  const canPullFromSales = salesPriceAmount != null || !!salesStartDate || !!salesEndDate;
  function pullFromSales() {
    if (salesPriceAmount != null) setPrice(String(salesPriceAmount));
    if (salesStartDate) setPoStart(salesStartDate);
    if (salesEndDate) setPoEnd(salesEndDate);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    action(new FormData(e.currentTarget));
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      {salesPqNo && (
        <div className="sm:col-span-3">
          <span className="mb-1 block text-sm font-medium text-slate-700">PQ No</span>
          <input readOnly value={salesPqNo} className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-600" />
          <span className="mt-1 block text-xs text-slate-400">Referensi dari PQ Tracker (Sales) -- bukan field tersimpan di Document Tracker.</span>
        </div>
      )}

      <div className="sm:col-span-3">
        <Field label="Project Details" name="project_details" defaultValue={defaultProjectDetails} textarea />
      </div>

      {canPullFromSales && (
        <div className="sm:col-span-3 -mt-1">
          <button
            type="button"
            onClick={pullFromSales}
            className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Tarik dari Sales
          </button>
          <span className="ml-2 text-xs text-slate-400">Isi ulang PQ Price & Start/End Date PO dari data terkini di Sales -- tidak menimpa otomatis, cuma kalau tombol ini diklik.</span>
        </div>
      )}

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">PQ Price</span>
        <input
          type="text"
          inputMode="numeric"
          value={formatThousands(price)}
          onChange={(e) => setPrice(stripThousands(e.target.value))}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
        />
        <input type="hidden" name="pq_price" value={price} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">PQ Total</span>
        <input readOnly value={total ? total.toLocaleString("id-ID") : ""} placeholder="-" className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-600" />
        <input type="hidden" name="pq_total" value={total || ""} />
        <span className="mt-1 block text-xs text-slate-400">Otomatis: durasi PO (bulan) × PQ Price</span>
      </label>
      <div />

      <div className="sm:col-span-3 border-t border-slate-100 pt-4">
        <p className="text-xs font-semibold text-slate-500 uppercase mb-3">{t("pksSectionTitle")}</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label={t("headers.noPks")} name="pks_no" defaultValue={defaultPksNo} />
          <Field label={t("legacyLinkLabel", { doc: t("headers.linkPks") })} name="pks_url" defaultValue={defaultPksUrl} />
          <SelectField label={t("statusPks")} name="pks_status_code" defaultValue={defaultPksStatus} options={STATUS_OPTIONS} />
        </div>
        <div className="mt-3">
          <MultiFileUpload name="pks_attachments" label={t("pksAttachmentsLabel")} existingFiles={pksAttachments} onDeleteExisting={onDeleteAttachment} />
        </div>
      </div>

      <div className="sm:col-span-3 border-t border-slate-100 pt-4">
        <p className="text-xs font-semibold text-slate-500 uppercase mb-3">{t("poSectionTitle")}</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Start Date PO</span>
            <input type="date" name="po_start_date" value={poStart} onChange={(e) => setPoStart(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">End Date PO</span>
            <input type="date" name="po_end_date" value={poEnd} onChange={(e) => setPoEnd(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white" />
          </label>
          <Field label={t("headers.noPo")} name="po_no" defaultValue={defaultPoNo} />
          <Field label={t("legacyLinkLabel", { doc: t("headers.linkPo") })} name="po_url" defaultValue={defaultPoUrl} />
          <SelectField label={t("statusPo")} name="po_status_code" defaultValue={defaultPoStatus} options={STATUS_OPTIONS} />
        </div>
        <div className="mt-3">
          <MultiFileUpload name="po_attachments" label={t("poAttachmentsLabel")} existingFiles={poAttachments} onDeleteExisting={onDeleteAttachment} />
        </div>
      </div>

      <div className="sm:col-span-3 border-t border-slate-100 pt-4">
        <p className="text-xs font-semibold text-slate-500 uppercase mb-3">{t("crSectionTitle")}</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label={t("headers.noCr")} name="cr_no" defaultValue={defaultCrNo} />
          <Field label={t("legacyLinkLabel", { doc: t("headers.linkCr") })} name="cr_url" defaultValue={defaultCrUrl} />
          <SelectField label={t("headers.statusCr")} name="cr_status_code" defaultValue={defaultCrStatus} options={STATUS_OPTIONS} />
        </div>
        <div className="mt-3">
          <MultiFileUpload name="cr_attachments" label={t("crAttachmentsLabel")} existingFiles={crAttachments} onDeleteExisting={onDeleteAttachment} />
        </div>
      </div>

      <div className="sm:col-span-3 border-t border-slate-100 pt-4">
        <p className="text-xs font-semibold text-slate-500 uppercase mb-3">{t("otherDocSectionTitle")}</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label={t("headers.noOtherDoc")} name="other_doc_no" defaultValue={defaultOtherDocNo} />
          <Field label={t("legacyLinkLabel", { doc: t("headers.linkOtherDoc") })} name="other_doc_url" defaultValue={defaultOtherDocUrl} />
          <SelectField label={t("headers.statusOtherDoc")} name="other_doc_status_code" defaultValue={defaultOtherDocStatus} options={STATUS_OPTIONS} />
        </div>
        <div className="mt-3">
          <MultiFileUpload name="other_attachments" label={t("otherDocAttachmentsLabel")} existingFiles={otherAttachments} onDeleteExisting={onDeleteAttachment} />
        </div>
      </div>

      <div className="sm:col-span-3 flex gap-3 pt-2">
        <button type="submit" className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700">
          {t("saveChanges")}
        </button>
        <Link href={backHref} className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
          {tc("cancel")}
        </Link>
      </div>
    </form>
  );
}
