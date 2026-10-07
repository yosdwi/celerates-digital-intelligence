"use client";
// Read-first record inspection (contract §8): highlights, progress, downstream Requisition / TA / PQ, then explicit
// actions. Every mutation is an existing V1 server action.
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, Checkbox, Dialog, DialogBody, DialogFooter, FormField, Input, InputShell, RecordPanel, Select } from "@crisp-ui-kit/crisp";
import { MoneyInput } from "@/components/form-fields";
import { useToast } from "@/components/toast-provider";
import { setRightRail, useRightRail } from "@/lib/right-rail";
import {
  convertToRequisition, deleteOpportunityTracker, updateOptyStatus, updateSalesQualified,
} from "@/app/sales/opportunity-tracker/actions";
import {
  CLIENT_TYPE_LABEL, LEVEL_LABEL, PRIORITIES, SERVICE_LABEL, STAGES, STAGE_LABEL, canConvert, rupiah, type Opportunity,
} from "./model";

const SIGNATURE: Record<string, { label: string; tone: "neutral" | "warning" | "success" | "danger" }> = {
  not_sent: { label: "Belum dikirim", tone: "neutral" },
  pending: { label: "Menunggu tanda tangan", tone: "warning" },
  signed: { label: "Ditandatangani", tone: "success" },
  rejected: { label: "Ditolak", tone: "danger" },
};
const PQ_STAGE: Record<string, string> = { win: "Win", drop: "Drop", hold: "Hold", on_going: "On Going" };

const isRedirect = (err: unknown) => typeof (err as { digest?: unknown })?.digest === "string" && (err as { digest: string }).digest.startsWith("NEXT_REDIRECT");

export type Access = { canEdit: boolean; canDelete: boolean };

export function RecordPreview({
  record, records, access, returnTo, onSelect, onClose, onPatch,
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
}) {
  const rail = useRightRail();
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<null | "convert" | "delete">(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  // The Agent is a docked drawer that narrows the page (contract §9), so the preview stays open beside it.
  const visible = !!record;

  // Publish how much of the right edge the panel covers, so the Agent launcher moves out of its way.
  useEffect(() => {
    const panel = wrapRef.current?.parentElement?.querySelector<HTMLElement>(".crisp-recordpanel");
    if (!visible || !panel) {
      setRightRail({ panelWidth: 0 });
      return;
    }
    // Layout position (offsetLeft), not getBoundingClientRect: the panel slides in with a transform, so its rect still
    // sits off-screen when this runs.
    const publish = () => {
      const container = panel.offsetParent as HTMLElement | null;
      const left = (container?.getBoundingClientRect().left ?? 0) + panel.offsetLeft;
      setRightRail({ panelWidth: Math.max(0, Math.round(window.innerWidth - left)) });
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(panel);
    window.addEventListener("resize", publish);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", publish);
      setRightRail({ panelWidth: 0 });
    };
  }, [visible, record?.id]);

  useEffect(() => {
    setRightRail({ record: record ? { type: "opportunity_tracker", id: record.id, label: `${record.optyNo} · ${record.client}` } : null });
  }, [record]);
  useEffect(() => () => setRightRail({ record: null }), []);

  // Escape closes the preview unless a dialog or the Agent is open (they take Escape first).
  useEffect(() => {
    if (!visible || rail.agentOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !dialog && !document.querySelector("[data-crisp-dialog]")) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [visible, rail.agentOpen, dialog, onClose]);

  if (!record) return <div ref={wrapRef} hidden />;
  const index = records.findIndex((r) => r.id === record.id);
  const editHref = `/sales/opportunity-tracker/${record.id}/edit?return_to=${encodeURIComponent(returnTo)}`;

  function run(patch: Partial<Opportunity>, action: () => Promise<unknown>) {
    const before = Object.fromEntries(Object.keys(patch).map((k) => [k, record![k as keyof Opportunity]]));
    onPatch(record!.id, patch);
    start(async () => {
      try {
        await action();
        router.refresh();
      } catch (err) {
        onPatch(record!.id, before as Partial<Opportunity>);
        showToast((err as Error)?.message || "Gagal menyimpan", "error");
      }
    });
  }

  const highlights = [
    { key: "opty", label: "Opty No", value: <span className="font-mono text-[12px]">{record.optyNo}</span> },
    { key: "stage", label: "Stage", value: STAGE_LABEL[record.status] ?? record.status },
    { key: "pos", label: "Positions", value: record.position ? `${record.position}${record.headcount ? ` × ${record.headcount}` : ""}` : "-" },
    { key: "level", label: "Level", value: record.level ? LEVEL_LABEL[record.level] ?? record.level : "-" },
    { key: "price", label: "Price", value: rupiah(record.price, record.pricePeriod) || "-" },
    { key: "closing", label: "Closing Price Deal", value: rupiah(record.closingPrice) || "-" },
    { key: "pic", label: "Sales PIC", value: record.salesPic || "-" },
    { key: "comm", label: "Last Communication", value: record.lastCommunication ?? "-" },
    { key: "service", label: "Service Type", value: record.serviceType ? SERVICE_LABEL[record.serviceType] ?? record.serviceType : "-" },
    { key: "client", label: "Client Type", value: record.clientType ? CLIENT_TYPE_LABEL[record.clientType] ?? record.clientType : "-" },
    { key: "bante", label: "BANTE", value: record.bante ?? "-" },
    { key: "lead", label: "Leads No", value: record.leadNo ? <span className="font-mono text-[12px]">{record.leadNo}</span> : "-" },
    { key: "duration", label: "Durasi", value: record.durationMonths ? `${record.durationMonths} bulan` : "-" },
    { key: "qualified", label: "Sales Qualified", value: record.salesQualified ? "Ya" : "Belum" },
  ];

  const text = (v: string | null) => v ? <p className="whitespace-pre-wrap text-[13px] leading-5 text-slate-700">{v}</p> : null;
  const sections = [
    { key: "req", label: "Requirement", count: record.requirement ? 1 : 0, content: text(record.requirement) ?? undefined },
    { key: "detail", label: "Detail Requirement", count: record.detailRequirement ? 1 : 0, content: text(record.detailRequirement) ?? undefined },
    {
      key: "ta", label: "Requisition · Talent Acquisition", count: record.requisition ? 1 : 0,
      content: record.requisition ? (
        <dl className="grid grid-cols-2 gap-y-1 text-[13px]">
          <dt className="text-slate-500">Requisition</dt><dd><Link className="font-mono text-[12px] text-brand-700 hover:underline" href={`/ta/${record.requisition.id}/edit`}>{record.requisition.no}</Link></dd>
          <dt className="text-slate-500">Kandidat di pipeline</dt><dd>{record.requisition.applications}</dd>
          <dt className="text-slate-500">Onboarding</dt><dd>{record.requisition.onboarding}</dd>
        </dl>
      ) : undefined,
    },
    {
      key: "pq", label: "PQ Tracker", count: record.pq ? 1 : 0,
      content: record.pq ? (
        <dl className="grid grid-cols-2 gap-y-1 text-[13px]">
          <dt className="text-slate-500">PQ No</dt><dd className="font-mono text-[12px]">{record.pq.no ?? "-"}</dd>
          <dt className="text-slate-500">Pipeline</dt><dd>{PQ_STAGE[record.pq.stage] ?? record.pq.stage}</dd>
          <dt className="text-slate-500">Tanda tangan PQ</dt><dd><Badge tone={SIGNATURE[record.pq.signature]?.tone ?? "neutral"} size="small">{SIGNATURE[record.pq.signature]?.label ?? record.pq.signature}</Badge></dd>
          <dt className="text-slate-500">Dokumen</dt><dd>{record.pq.documents} file · <Link className="text-brand-700 hover:underline" href={`/sales/${record.pq.id}/edit`}>buka PQ</Link></dd>
        </dl>
      ) : undefined,
    },
    { key: "dropped", label: "Dropped Reason", count: record.droppedReason ? 1 : 0, content: text(record.droppedReason) ?? undefined },
  ];

  const footer = access.canEdit ? (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="w-16 shrink-0 text-[12px] text-slate-500">Stage</span>
        <Select
          aria-label="Change stage"
          size="small"
          value={record.status}
          disabled={pending}
          onValueChange={(v) => v !== record.status && run({ status: v }, () => updateOptyStatus(record.id, v))}
          options={STAGES.map((s) => ({ value: s.id, label: s.title }))}
        />
        <label className="flex shrink-0 items-center gap-1.5 text-[12px] text-slate-700">
          <Checkbox
            checked={record.salesQualified}
            disabled={pending}
            onChange={(e) => { const v = e.currentTarget.checked; run({ salesQualified: v }, () => updateSalesQualified(record.id, v)); }}
          />
          Sales Qualified
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {canConvert(record) && <Button size="sm" intent="primary" onClick={() => setDialog("convert")}>Convert to Requisition</Button>}
        {record.pq && <span className="text-[12px] text-slate-500">Sudah dikonversi</span>}
        <Button size="sm" intent="neutral" asChild><Link href={editHref}>Edit</Link></Button>
        {access.canDelete && !record.pq && !record.requisition && (
          <Button size="sm" intent="ghost" className="ml-auto text-red-600" onClick={() => setDialog("delete")}>Hapus</Button>
        )}
      </div>
    </div>
  ) : (
    <p className="text-[12px] text-slate-500">Mode lihat saja: perubahan butuh akses Editor Sales.</p>
  );

  return (
    <>
      <div ref={wrapRef} hidden />
      {visible && (
        <RecordPanel
          record={{ id: record.id, name: record.client } as never}
          title={record.client}
          counterLabel={index >= 0 ? `${index + 1} dari ${records.length}` : undefined}
          onPrevious={index > 0 ? () => onSelect(records[index - 1].id) : undefined}
          onNext={index >= 0 && index < records.length - 1 ? () => onSelect(records[index + 1].id) : undefined}
          previousRecordLabel="Sebelumnya"
          nextRecordLabel="Berikutnya"
          onOpenRecord={access.canEdit ? () => router.push(editHref) : undefined}
          openRecordLabel="Buka halaman edit"
          closeLabel="Tutup"
          highlightsLabel="Ringkasan"
          highlights={highlights}
          activityLabel="Progress Notes"
          activity={text(record.progressNotes) ?? <p className="text-[13px] text-slate-400">Belum ada progress notes.</p>}
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
