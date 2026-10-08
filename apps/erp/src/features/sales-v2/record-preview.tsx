"use client";
// Read-first record inspection (contract §8): highlights, progress, downstream Requisition / TA / PQ, then explicit
// actions. Every mutation is an existing V1 server action.
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, Dialog, DialogBody, DialogFooter, FormField, Input, InputShell, RecordPanel, Select } from "@crisp-ui-kit/crisp";
import { MoneyInput } from "@/components/form-fields";
import { useToast } from "@/components/toast-provider";
import {
  convertToRequisition, deleteOpportunityTracker,
} from "@/app/sales/opportunity-tracker/actions";
import {
  PRIORITIES, STAGES, canConvert, rupiah, type Opportunity,
} from "./model";
import { EditOpportunityDialog, type FormOptions } from "./forms";
import { PanelTitle, useRecordPanelRail, useRowActions, type Access, type PanelRequest } from "./record-workspace";
import { InlineCheck, InlineSelect, InlineText, MoreMenu } from "./cells";
import { RecordTimeline } from "./history";

const STAGE_OPTIONS = STAGES.map((s) => ({ value: s.id, label: s.title, swatch: s.swatch }));

const SIGNATURE: Record<string, { label: string; tone: "neutral" | "warning" | "success" | "danger" }> = {
  not_sent: { label: "Belum dikirim", tone: "neutral" },
  pending: { label: "Menunggu tanda tangan", tone: "warning" },
  signed: { label: "Ditandatangani", tone: "success" },
  rejected: { label: "Ditolak", tone: "danger" },
};
const PQ_STAGE: Record<string, string> = { win: "Win", drop: "Drop", hold: "Hold", on_going: "On Going" };

const isRedirect = (err: unknown) => typeof (err as { digest?: unknown })?.digest === "string" && (err as { digest: string }).digest.startsWith("NEXT_REDIRECT");

export type { Access };

export function RecordPreview({
  record, records, access, returnTo, onSelect, onClose, onPatch, options, request, onRequestHandled,
}: {
  record: Opportunity | null;
  /** The current filtered, sorted list: Previous / Next walk it. */
  records: Opportunity[];
  access: Access;
  /** This workspace URL, so a redirecting action (Convert, full edit) lands back here. */
  returnTo: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  /** Optimistic local change while the server action runs. */
  onPatch: (id: string, patch: Partial<Opportunity>) => void;
  options: FormOptions;
  /** A dialog to open once for this record: the Aksi column (edit, delete, convert) or a Kanban move to Win that chose
   *  "Pindahkan & Convert". */
  request?: PanelRequest | null;
  onRequestHandled?: () => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [dialog, setDialog] = useState<null | "convert" | "delete" | "edit">(null);
  const { edit, showHistory } = useRowActions();
  useEffect(() => {
    if (!record || !request || record.id !== request.id) return;
    const { action } = request;
    if (action === "convert" ? canConvert(record) : action === "edit" ? access.canEdit : action === "delete" && access.canDelete) setDialog(action as "convert" | "edit" | "delete");
    onRequestHandled?.();
  }, [record, request, onRequestHandled, access]);
  // The Agent is a docked drawer that narrows the page (contract §9), so the preview stays open beside it.
  const visible = !!record;
  const wrapRef = useRecordPanelRail(record ? { type: "opportunity_tracker", id: record.id, label: `${record.optyNo} · ${record.client}` } : null, onClose, !!dialog);

  if (!record) return <div ref={wrapRef} hidden />;
  const index = records.findIndex((r) => r.id === record.id);
  // The full V1 edit page stays reachable; day-to-day editing is the dialog (contract §12).
  const editHref = `/sales/opportunity-tracker/${record.id}/edit?return_to=${encodeURIComponent(returnTo)}`;


  // Ringkasan (QA 2026-10-08): what a Kanban or Grid user needs without the table; the four that change most are edited
  // here as in the table (the workspace's `edit`), the rest of the record lives in the table and the Edit form.
  const save = (key: string) => (v: string) => { edit(record.id, key, v).catch((err) => showToast((err as Error)?.message || "Gagal menyimpan", "error")); };
  const highlights = [
    { key: "opty", label: "Opty No", value: <span className="font-mono text-[0.75rem]">{record.optyNo}</span> },
    { key: "stage", label: "Stage", value: <InlineSelect value={record.status} options={STAGE_OPTIONS} label="Stage" canEdit={access.canEdit} onChange={save("status")} /> },
    { key: "qualified", label: "Sales Qualified", value: <InlineCheck checked={record.salesQualified} label="Qualified" canEdit={access.canEdit} onChange={(v) => save("salesQualified")(String(v))} /> },
    { key: "pic", label: "Sales PIC", value: <InlineText value={record.salesPic} label="Sales PIC" canEdit={access.canEdit} onCommit={save("salesPic")} /> },
    { key: "price", label: "Price", value: <InlineText value={record.price == null ? "" : String(record.price)} display={rupiah(record.price, record.pricePeriod) || "-"} numeric label="Price" canEdit={access.canEdit} onCommit={save("price")} /> },
    { key: "pos", label: "Positions", value: record.position ? `${record.position}${record.headcount ? ` × ${record.headcount}` : ""}` : "-" },
    { key: "comm", label: "Last Communication", value: record.lastCommunication ?? "-" },
  ];

  const text = (v: string | null) => v ? <p className="whitespace-pre-wrap text-[0.8125rem] leading-5 text-slate-700">{v}</p> : null;
  const sections = [
    { key: "req", label: "Requirement", count: record.requirement ? 1 : 0, content: text(record.requirement) ?? undefined },
    { key: "detail", label: "Detail Requirement", count: record.detailRequirement ? 1 : 0, content: text(record.detailRequirement) ?? undefined },
    {
      key: "ta", label: "Requisition · Talent Acquisition", count: record.requisition ? 1 : 0,
      content: record.requisition ? (
        <dl className="grid grid-cols-2 gap-y-1 text-[0.8125rem]">
          <dt className="text-slate-500">Requisition</dt><dd><Link className="font-mono text-[0.75rem] text-brand-700 hover:underline" href={`/ta/${record.requisition.id}/edit`}>{record.requisition.no}</Link></dd>
          <dt className="text-slate-500">Kandidat di pipeline</dt><dd>{record.requisition.applications}</dd>
          <dt className="text-slate-500">Onboarding</dt><dd>{record.requisition.onboarding}</dd>
        </dl>
      ) : undefined,
    },
    {
      key: "pq", label: "PQ Tracker", count: record.pq ? 1 : 0,
      content: record.pq ? (
        <dl className="grid grid-cols-2 gap-y-1 text-[0.8125rem]">
          <dt className="text-slate-500">PQ No</dt><dd className="font-mono text-[0.75rem]">{record.pq.no ?? "-"}</dd>
          <dt className="text-slate-500">Pipeline</dt><dd>{PQ_STAGE[record.pq.stage] ?? record.pq.stage}</dd>
          <dt className="text-slate-500">Tanda tangan PQ</dt><dd><Badge tone={SIGNATURE[record.pq.signature]?.tone ?? "neutral"} size="small">{SIGNATURE[record.pq.signature]?.label ?? record.pq.signature}</Badge></dd>
          <dt className="text-slate-500">Dokumen</dt><dd>{record.pq.documents} file · <Link className="text-brand-700 hover:underline" href={`/sales/v2/pq-tracker?record=${record.pq.id}`}>buka PQ</Link></dd>
        </dl>
      ) : undefined,
    },
    { key: "dropped", label: "Dropped Reason", count: record.droppedReason ? 1 : 0, content: text(record.droppedReason) ?? undefined },
  ];

  // Buttons only (QA 2026-10-08): stage and Sales Qualified are edited in the Ringkasan above.
  const footer = access.canEdit ? (
    <div className="flex flex-wrap items-center gap-2">
      {canConvert(record) && <Button size="sm" intent="primary" onClick={() => setDialog("convert")}>Convert to Requisition</Button>}
      {record.pq && <span className="text-[0.75rem] text-slate-500">Sudah dikonversi</span>}
      <Button size="sm" intent="neutral" onClick={() => setDialog("edit")}>Edit</Button>
      <span className="ml-auto">
        <MoreMenu items={[
          { label: "Halaman penuh (V1)", onSelect: () => router.push(editHref) },
          ...(access.canDelete && !record.pq && !record.requisition ? [{ label: "Hapus", danger: true, onSelect: () => setDialog("delete") }] : []),
        ]} />
      </span>
    </div>
  ) : (
    <p className="text-[0.75rem] text-slate-500">Mode lihat saja: perubahan butuh akses Editor Sales.</p>
  );

  return (
    <>
      <div ref={wrapRef} hidden />
      {visible && (
        <RecordPanel
          record={{ id: record.id, name: record.client } as never}
          title={<PanelTitle name={record.client} prefill={`Tentang ${record.optyNo} (${record.client}): `} />}
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
          // Aktivitas (Attio's record timeline): the latest Progress Notes pinned, then every saved change.
          activityLabel="Aktivitas"
          activity={<>
            {record.progressNotes && <div className="mb-2 rounded-md bg-slate-50 px-2.5 py-2"><p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-slate-500">Progress Notes</p><p className="whitespace-pre-wrap text-[0.8125rem] leading-5 text-slate-700">{record.progressNotes}</p></div>}
            <RecordTimeline recordId={record.id} version={record} />
          </>}
          viewAllActivityLabel="Riwayat lengkap"
          onViewAllActivity={() => showHistory(record.id)}
          sections={sections}
          footer={footer}
          resizable
          defaultWidth={440}
          minWidth={360}
          maxWidth={720}
          onClose={onClose}
          data-testid="sales-v2-record-panel"
        />
      )}
      <ConvertDialog record={record} open={dialog === "convert"} onClose={() => setDialog(null)} returnTo={returnTo} />
      <DeleteDialog record={record} open={dialog === "delete"} onClose={() => setDialog(null)} onDeleted={onClose} />
      {access.canEdit && <EditOpportunityDialog record={record} open={dialog === "edit"} onClose={() => setDialog(null)} returnTo={returnTo} options={options} />}
    </>
  );
}

function ConvertDialog({ record, open, onClose, returnTo }: { record: Opportunity; open: boolean; onClose: () => void; returnTo: string }) {
  const [pending, start] = useTransition();
  const { showToast } = useToast();
  const t = useTranslations("common");
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      try {
        await convertToRequisition(record.id, fd);
      } catch (err) {
        if (isRedirect(err)) throw err;
        showToast((err as Error)?.message || t("saveFailed"), "error");
      }
    });
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !pending && onClose()} title="Convert to Requisition" width={480}
      description="Membuat Requisition untuk Talent Acquisition dan PQ Tracker dengan Opty No yang sama.">
      {open && (
        <form onSubmit={onSubmit}>
          <input type="hidden" name="return_to" value={returnTo} />
          <DialogBody>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Positions" required className="sm:col-span-2"><Input name="position_name" defaultValue={record.position ?? ""} required autoFocus /></FormField>
              <FormField label="Headcount" required><Input name="headcount_target" type="number" min={1} defaultValue={record.headcount?.toString() ?? ""} required /></FormField>
              <FormField label="Priority"><Select name="priority_code" defaultValue="p2" options={PRIORITIES.map(([value, label]) => ({ value, label }))} /></FormField>
              <FormField label="Price" className="sm:col-span-2"><InputShell><MoneyInput name="price_amount" defaultValue={record.price?.toString() ?? ""} className="crisp-input-value" /></InputShell></FormField>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" size="sm" intent="neutral" onClick={onClose} disabled={pending}>{t("cancel")}</Button>
            <Button type="submit" size="sm" intent="primary" loading={pending}>Convert</Button>
          </DialogFooter>
        </form>
      )}
    </Dialog>
  );
}

function DeleteDialog({ record, open, onClose, onDeleted }: { record: Opportunity; open: boolean; onClose: () => void; onDeleted: () => void }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { showToast } = useToast();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !pending && onClose()} variant="alert" title={`Hapus ${record.optyNo}?`}
      description={`Opportunity ${record.client} akan dihapus permanen.`}>
      <DialogFooter variant="alert">
        <Button size="sm" intent="neutral" onClick={onClose} disabled={pending}>Batal</Button>
        <Button size="sm" intent="danger" loading={pending} onClick={() => start(async () => {
          const res = await deleteOpportunityTracker(record.id);
          if (!res.ok) { showToast(res.error, "error"); return; }
          onClose();
          onDeleted();
          showToast("Opportunity dihapus");
          router.refresh();
        })}>Hapus</Button>
      </DialogFooter>
    </Dialog>
  );
}
