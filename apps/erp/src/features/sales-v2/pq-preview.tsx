"use client";
// PQ record panel (contract §8): read first (highlights, documents, signature, PMO documents, source Opportunity), then
// explicit actions. Every mutation is a V1 PQ Tracker server action (app/sales/actions.ts).
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Link as LinkIcon, Paperclip, Send } from "lucide-react";
import { Badge, Button, Dialog, DialogBody, DialogFooter, FormField, RecordPanel, Select } from "@crisp-ui-kit/crisp";
import { useToast } from "@/components/toast-provider";
import { MultiFileUpload } from "@/components/multi-file-upload";
import { SmartFileLink } from "@/components/smart-file-link";
import { deleteOpportunity, sendPqForSignature, updateOptyStatus, updatePipelineStage } from "@/app/sales/actions";
import { DOC_STATUS_OPTIONS, OPTY_STATUS, SALES_TYPES, STAGE_TO_OPTY_STATUS } from "@/app/sales/pq-constants";
import { rupiah } from "./model";
import {
  PQ_STAGES, SIGNATURE_LABEL, needsPqNo,
  type Pq, type PqFile,
} from "./pq-model";
import { EditPqDialog } from "./pq-forms";
import type { PqOptions } from "./pq-data";
import { HistoryRows, useHistory } from "./history";
import { PanelTitle, useRecordPanelRail, useRowActions, type Access, type PanelRequest } from "./record-workspace";
import { InlineSelect, InlineText, MoreMenu } from "./cells";

const STAGE_OPTIONS = PQ_STAGES.map((s) => ({ value: s.id, label: s.title, swatch: s.swatch }));
const OPTY_OPTIONS = OPTY_STATUS.map(([value, label]) => ({ value, label }));

const SIGNATURE_TONE = { not_sent: "neutral", pending: "warning", signed: "success", rejected: "danger" } as const;
const DOC_STATUS_LABEL: Record<string, string> = Object.fromEntries(DOC_STATUS_OPTIONS);
const SALES_TYPE_LABEL: Record<string, string> = Object.fromEntries(SALES_TYPES);

/** V1's PQ actions answer { ok, error } instead of throwing. */
export async function ok(result: Promise<{ ok: true } | { ok: false; error: string }>) {
  const r = await result;
  if (!r.ok) throw new Error(r.error);
}

/** V1's stage change (StageSelector): Pipeline Stage, then the Opty Status that goes with it (Win → Project Won, …). */
export async function savePqStage(id: string, to: string) {
  await ok(updatePipelineStage(id, to));
  const status = STAGE_TO_OPTY_STATUS[to];
  if (status) await ok(updateOptyStatus(id, status));
}

export function FileLinks({ files }: { files: PqFile[] }) {
  return (
    <ul className="space-y-1">
      {files.map((f) => (
        <li key={f.id}>
          <a href={f.url ?? "#"} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex max-w-full items-center gap-1 text-[0.75rem] text-brand-700 hover:underline">
            {f.kind === "link" ? <LinkIcon size={12} className="shrink-0" /> : <Paperclip size={12} className="shrink-0" />}
            <span className="truncate">{f.name}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

export function PqPreview({
  record, records, access, returnTo, onSelect, onClose, onPatch, options, request, onRequestHandled,
}: {
  record: Pq | null;
  records: Pq[];
  access: Access;
  returnTo: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  onPatch: (id: string, patch: Partial<Pq>) => void;
  options: PqOptions;
  /** A dialog the row's menu asked for (edit, delete, sign): opened once this record is shown. */
  request?: PanelRequest | null;
  onRequestHandled?: () => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [dialog, setDialog] = useState<null | "edit" | "delete" | "sign">(null);
  const { edit } = useRowActions();
  const changes = useHistory(record?.id ?? "", undefined, record);
  useEffect(() => {
    if (!record || !request || record.id !== request.id) return;
    const can = request.action === "edit" ? access.canEdit
      : request.action === "delete" ? access.canDelete
      : request.action === "sign" && access.canEdit && record.signature.status === "not_sent" && !!record.pqNo;
    if (can) setDialog(request.action as "edit" | "delete" | "sign");
    onRequestHandled?.();
  }, [record, request, onRequestHandled, access]);
  const wrapRef = useRecordPanelRail(record ? { type: "commercial_pq", id: record.id, label: `${record.pqNo ?? record.optyNo} · ${record.client}` } : null, onClose, !!dialog);

  if (!record) return <div ref={wrapRef} hidden />;
  const index = records.findIndex((r) => r.id === record.id);


  // Ringkasan (QA 2026-10-08): what a Kanban or Grid user needs without the table; Pipeline Stage, Opty Status and Price
  // are edited here as in the table (the workspace's `edit`), the rest of the record lives in the table and the Edit form.
  const save = (key: string) => (v: string) => { edit(record.id, key, v).catch((err) => showToast((err as Error)?.message || "Gagal menyimpan", "error")); };
  const highlights = [
    { key: "opty", label: "Opty No", value: <span className="font-mono text-[0.75rem]">{record.optyNo}</span> },
    { key: "pq", label: "PQ No", value: record.pqNo ? <span className="font-mono text-[0.75rem]">{record.pqNo}</span> : needsPqNo(record) ? <Badge tone="warning" size="small">Perlu Generate PQ</Badge> : <span className="text-slate-400">Menunggu Talent Onboard</span> },
    { key: "stage", label: "Pipeline Stage", value: <InlineSelect value={record.stage} options={STAGE_OPTIONS} label="Pipeline Stage" canEdit={access.canEdit} onChange={save("stage")} /> },
    { key: "status", label: "Opty Status", value: <InlineSelect value={record.optyStatus ?? ""} options={OPTY_OPTIONS} label="Opty Status" canEdit={access.canEdit} onChange={save("optyStatus")} /> },
    { key: "project", label: "Project", value: record.project || "-" },
    { key: "pos", label: "Positions", value: record.position ? `${record.position}${record.headcount ? ` × ${record.headcount}` : ""}` : "-" },
    { key: "price", label: "Price", value: <InlineText value={record.price == null ? "" : String(record.price)} display={rupiah(record.price, record.pricePeriod) || "-"} numeric label="Price" canEdit={access.canEdit} onCommit={save("price")} /> },
    { key: "pic", label: "Sales PIC", value: record.salesPic || "-" },
  ];

  const sig = record.signature;
  const doc = record.projectDoc;
  const docRow = (name: string, no: string | null, status: string | null) => (
    <><dt className="text-slate-500">{name}</dt><dd>{no || "-"}{status ? <span className="text-slate-500"> · {DOC_STATUS_LABEL[status] ?? status}</span> : null}</dd></>
  );
  const sections = [
    {
      key: "pqdoc", label: "Dokumen PQ", count: record.pqDocs.length,
      content: record.pqDocs.length ? <FileLinks files={record.pqDocs} /> : undefined,
    },
    {
      key: "sign", label: "Tanda tangan PQ", count: sig.status === "not_sent" ? 0 : 1,
      content: sig.status === "not_sent" ? undefined : (
        <dl className="grid grid-cols-2 gap-y-1 text-[0.8125rem]">
          <dt className="text-slate-500">Status</dt><dd><Badge tone={SIGNATURE_TONE[sig.status]} size="small">{SIGNATURE_LABEL[sig.status]}</Badge></dd>
          <dt className="text-slate-500">Penanda tangan</dt><dd>{sig.signerName ?? "-"}</dd>
          {sig.status === "pending" && <><dt /><dd><Link href="/ttd-online" className="text-brand-700 hover:underline">Lihat di TTD Online</Link></dd></>}
        </dl>
      ),
    },
    {
      key: "po", label: "PO Doc", count: record.poDocs.length + (record.poDocUrl ? 1 : 0),
      content: record.poDocs.length || record.poDocUrl ? (
        <div className="space-y-1">{record.poDocUrl && <SmartFileLink value={record.poDocUrl} />}<FileLinks files={record.poDocs} /></div>
      ) : undefined,
    },
    {
      key: "pmo", label: "Dokumen Legal Project (PMO)", count: doc ? 1 : 0,
      content: doc ? (
        <dl className="grid grid-cols-2 gap-y-1 text-[0.8125rem]">
          {docRow("PKS", doc.pksNo, doc.pksStatus)}
          {docRow("PO", doc.poNo, doc.poStatus)}
          {docRow("CR", doc.crNo, doc.crStatus)}
          {docRow("Dokumen lain", doc.otherDocNo, doc.otherDocStatus)}
          <dt className="text-slate-500">Sales Type</dt><dd>{doc.salesType ? SALES_TYPE_LABEL[doc.salesType] ?? doc.salesType : "-"}</dd>
          {doc.projectDetails && <><dt className="text-slate-500">Project Details</dt><dd className="whitespace-pre-wrap">{doc.projectDetails}</dd></>}
        </dl>
      ) : undefined,
    },
    {
      key: "tracker", label: "Opportunity Tracker", count: record.trackerId ? 1 : 0,
      content: record.trackerId ? <Link className="text-[0.8125rem] text-brand-700 hover:underline" href={`/sales/v2/opportunity-tracker?record=${record.trackerId}`}>Buka opportunity {record.optyNo}</Link> : undefined,
    },
    { key: "history", label: "Riwayat perubahan", count: changes.rows?.length ?? 0, content: <HistoryRows state={changes} showField /> },
  ];

  const canSign = sig.status === "not_sent" && !!record.pqNo;
  // Buttons only (QA 2026-10-08): Pipeline Stage and Opty Status are edited in the Ringkasan above.
  const footer = access.canEdit ? (
    <div className="flex flex-wrap items-center gap-2">
      {canSign && <Button size="sm" intent="primary" onClick={() => setDialog("sign")}><Send size={13} /> Kirim untuk TTD</Button>}
      {sig.status === "not_sent" && !record.pqNo && <span className="text-[0.75rem] text-slate-500">Isi PQ Number dulu sebelum TTD</span>}
      <Button size="sm" intent="neutral" onClick={() => setDialog("edit")}>Edit</Button>
      <span className="ml-auto">
        <MoreMenu items={[
          { label: "Halaman penuh (V1)", onSelect: () => router.push(`/sales/${record.id}/edit`) },
          ...(access.canDelete ? [{ label: "Hapus", danger: true, onSelect: () => setDialog("delete") }] : []),
        ]} />
      </span>
    </div>
  ) : (
    <p className="text-[0.75rem] text-slate-500">Mode lihat saja: perubahan butuh akses Editor Sales.</p>
  );

  return (
    <>
      <div ref={wrapRef} hidden />
      <RecordPanel
        record={{ id: record.id, name: record.client } as never}
        title={<PanelTitle name={record.client} prefill={`Tentang PQ ${record.pqNo ?? record.optyNo} (${record.client}): `} />}
        counterLabel={index >= 0 ? `${index + 1} dari ${records.length}` : undefined}
        onPrevious={index > 0 ? () => onSelect(records[index - 1].id) : undefined}
        onNext={index >= 0 && index < records.length - 1 ? () => onSelect(records[index + 1].id) : undefined}
        previousRecordLabel="Sebelumnya"
        nextRecordLabel="Berikutnya"
        onOpenRecord={access.canEdit ? () => setDialog("edit") : undefined}
        openRecordLabel="Edit"
        closeLabel="Tutup"
        highlightsLabel="Ringkasan"
        highlights={highlights}
        activityLabel="Notes"
        activity={record.notes ? <p className="whitespace-pre-wrap text-[0.8125rem] leading-5 text-slate-700">{record.notes}</p> : <p className="text-[0.8125rem] text-slate-400">Belum ada notes.</p>}
        sections={sections}
        footer={footer}
        resizable
        defaultWidth={440}
        minWidth={360}
        maxWidth={720}
        onClose={onClose}
        data-testid="sales-v2-record-panel"
      />
      {access.canEdit && <EditPqDialog record={record} open={dialog === "edit"} onClose={() => setDialog(null)} returnTo={returnTo} options={options} />}
      {access.canEdit && <SignDialog record={record} open={dialog === "sign"} onClose={() => setDialog(null)} signers={options.signers} />}
      <DeleteDialog record={record} open={dialog === "delete"} onClose={() => setDialog(null)} onDeleted={onClose} />
    </>
  );
}

/** V1's "Kirim ke TTD": PQ document (upload or keep what is there) and one signer; sendPqForSignature does the rest. */
function SignDialog({ record, open, onClose, signers }: { record: Pq; open: boolean; onClose: () => void; signers: PqOptions["signers"] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { showToast } = useToast();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !pending && onClose()} title={`Kirim PQ ${record.pqNo} untuk TTD`} icon={<Send size={16} />} closeLabel="Tutup" width={520} data-sales-v2-dialog="pq-sign">
      {open && (
        <form onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          start(async () => {
            setError(null);
            const r = await sendPqForSignature(record.id, fd);
            if (!r.ok) { setError(r.error); return; }
            onClose();
            showToast("PQ dikirim untuk tanda tangan");
            router.refresh();
          });
        }}>
          <DialogBody className="space-y-3">
            <MultiFileUpload name="pq_attachments" label="Dokumen PQ" existingFiles={record.pqDocs.map((a) => ({ id: a.id, file_name: a.name, url: a.url, kind: a.kind }))} />
            <FormField label="Penanda tangan" required>
              <Select name="signer_user_id" required searchable options={signers} placeholder="Pilih penanda tangan" />
            </FormField>
            {error && <p className="text-[0.8125rem] text-red-600" role="alert">{error}</p>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" size="sm" intent="neutral" onClick={onClose} disabled={pending}>Batal</Button>
            <Button type="submit" size="sm" intent="primary" loading={pending}>Kirim</Button>
          </DialogFooter>
        </form>
      )}
    </Dialog>
  );
}

function DeleteDialog({ record, open, onClose, onDeleted }: { record: Pq; open: boolean; onClose: () => void; onDeleted: () => void }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { showToast } = useToast();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !pending && onClose()} variant="alert" title={`Hapus ${record.pqNo ?? record.optyNo}?`}
      description={`PQ ${record.client} — ${record.project} akan dihapus permanen.`}>
      <DialogFooter variant="alert">
        <Button size="sm" intent="neutral" onClick={onClose} disabled={pending}>Batal</Button>
        <Button size="sm" intent="danger" loading={pending} onClick={() => start(async () => {
          const res = await deleteOpportunity(record.id);
          if (!res.ok) { showToast(res.error, "error"); return; }
          onClose();
          onDeleted();
          showToast("PQ dihapus");
          router.refresh();
        })}>Hapus</Button>
      </DialogFooter>
    </Dialog>
  );
}
