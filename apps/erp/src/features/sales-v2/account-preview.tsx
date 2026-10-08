"use client";
// Account record panel (contract §8, §16): V1's Account 360 in the panel (stats, activity timeline, contacts, related
// leads / PQ / contracts / invoices), then explicit actions. Every mutation is a V1 CRM server action
// (app/sales/accounts/actions.ts); the forms keep V1's fields, names and required flags.
import { AccountEmails } from "./email-panel";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Calendar, FileText, Mail, Phone, Plus, UserPlus, X } from "lucide-react";
import { ActivityFeedRow, Badge, Button, Checkbox, Dialog, DialogBody, DialogFooter, Input, RecordPanel, Select, Textarea } from "@crisp-ui-kit/crisp";
import { useToast } from "@/components/toast-provider";
import { createActivity, createClient, createContact, deleteActivity, deleteClient, deleteContact, updateClient } from "@/app/sales/accounts/actions";
import { F, DraftFooter, opts, readDraft, useCloseFromXOnly, useSubmit, type Draft } from "./forms";
import { rupiah } from "./model";
import { PQ_STAGE_LABEL } from "./pq-model";
import { ACCOUNT_STATUSES, ACTIVITY_LABEL, ACTIVITY_TYPES, accountFormData, lastActivityOf, picOf, type Account } from "./account-model";
import { RecordTimeline, type TimelineItem } from "./history";
import { PanelTitle, useRecordPanelRail, useRowActions, type Access, type PanelRequest } from "./record-workspace";
import { InlineSelect, MoreMenu } from "./cells";

const TYPE_ICON: Record<string, typeof Phone> = { call: Phone, email: Mail, meeting: Calendar, note: FileText };
const STAGE_TONE: Record<string, "success" | "danger"> = { win: "success", drop: "danger" };
const INVOICE_TONE: Record<string, "danger" | "success" | "neutral"> = { overdue: "danger", submitted: "success", planned: "neutral" };
const statusOptions = ACCOUNT_STATUSES.map((s) => ({ value: s.id, label: s.title }));
const STATUS_CHIPS = ACCOUNT_STATUSES.map((s) => ({ value: s.id, label: s.title, swatch: s.swatch }));
const today = () => new Date().toLocaleDateString("en-CA");

/** Board move and the panel's status select: V1's updateClient with the other fields unchanged. */
export const saveAccountStatus = (a: Account, status: string) => updateClient(a.id, accountFormData(a, status));

type Dialogs = null | "edit" | "delete" | "contact" | "activity" | { kind: "delContact" | "delActivity"; id: string; name: string };

export function AccountPreview({
  record, records, access, onSelect, onClose, onPatch, request, onRequestHandled,
}: {
  record: Account | null;
  records: Account[];
  access: Access;
  onSelect: (id: string) => void;
  onClose: () => void;
  onPatch: (id: string, patch: Partial<Account>) => void;
  /** A dialog the row's menu asked for (edit, delete, contact, activity): opened once this record is shown. */
  request?: PanelRequest | null;
  onRequestHandled?: () => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [dialog, setDialog] = useState<Dialogs>(null);
  const { edit, showHistory } = useRowActions();
  useEffect(() => {
    if (!record || !request || record.id !== request.id) return;
    const a = request.action;
    if (a === "delete" ? access.canDelete : access.canEdit && (a === "edit" || a === "contact" || a === "activity")) setDialog(a as "edit" | "delete" | "contact" | "activity");
    onRequestHandled?.();
  }, [record, request, onRequestHandled, access]);
  const wrapRef = useRecordPanelRail(record ? { type: "crm_client", id: record.id, label: record.name } : null, onClose, !!dialog);

  if (!record) return <div ref={wrapRef} hidden />;
  const index = records.findIndex((r) => r.id === record.id);
  const pic = picOf(record);
  const h = record.history;


  const highlights = [
    { key: "status", label: "Status", value: <InlineSelect value={record.status} options={STATUS_CHIPS} label="Status" canEdit={access.canEdit} onChange={(v) => edit(record.id, "status", v).catch((err) => showToast((err as Error)?.message || "Gagal menyimpan", "error"))} /> },
    { key: "industry", label: "Industri", value: record.industry || "-" },
    { key: "activeOpty", label: "Opportunity Aktif", value: record.activeOpportunities },
    { key: "opty", label: "Total Opportunity", value: record.opportunities },
    { key: "leads", label: "Leads", value: record.leads },
    { key: "contracts", label: "Kontrak", value: record.contracts },
    { key: "value", label: "Nilai Kontrak", value: record.monthlyValue > 0 ? `${rupiah(record.monthlyValue)}/bln` : "-" },
    { key: "invoices", label: "Invoice", value: record.overdueInvoices ? <span>{record.invoices} <span className="text-red-600">({record.overdueInvoices} overdue)</span></span> : record.invoices },
    { key: "pic", label: "Kontak PIC", value: pic ? `${pic.name}${pic.role ? ` · ${pic.role}` : ""}` : "-" },
    { key: "last", label: "Aktivitas Terakhir", value: lastActivityOf(record) ?? "-" },
    { key: "created", label: "Dibuat", value: `${record.createdAt?.slice(0, 10) ?? "-"}${record.createdBy ? ` · ${record.createdBy}` : ""}` },
  ];

  const removeButton = (kind: "delContact" | "delActivity", id: string, name: string) => access.canEdit && (
    <button type="button" onClick={() => setDialog({ kind, id, name })} className="shrink-0 text-slate-300 hover:text-red-500" aria-label={`Hapus ${name}`}><X size={13} /></button>
  );
  const row = (left: React.ReactNode, right: React.ReactNode, key: string) => (
    <li key={key} className="flex items-center justify-between gap-2 text-[0.8125rem]"><span className="min-w-0 truncate text-slate-700">{left}</span>{right}</li>
  );

  // Aktivitas (Attio's record timeline): logged calls, emails, meetings and notes with every saved change, by time.
  const logged: TimelineItem[] = record.activities.map((a) => {
    const Icon = TYPE_ICON[a.type] ?? FileText;
    return {
      key: a.id,
      at: a.date,
      row: (
        <ActivityFeedRow
          actor={<span className="font-medium text-slate-900">{a.by ?? "-"}</span>}
          action={
            <span className="flex min-w-0 items-center gap-1.5">
              <Icon size={13} className="shrink-0 text-slate-500" aria-label={ACTIVITY_LABEL[a.type] ?? a.type} />
              <span className="truncate font-medium text-slate-900">{a.title}</span>
              {removeButton("delActivity", a.id, a.title)}
            </span>
          }
          when={a.date}
        >
          {(a.description || a.contact) && (
            <div className="text-[0.75rem] leading-5 text-slate-600">
              {a.description && <p className="whitespace-pre-wrap">{a.description}</p>}
              {a.contact && <p className="text-slate-400">dengan {a.contact}</p>}
            </div>
          )}
        </ActivityFeedRow>
      ),
    };
  });
  const activity = (
    <div className="space-y-2">
      {access.canEdit && <Button size="sm" intent="neutral" onClick={() => setDialog("activity")}><Plus size={13} /> Catat aktivitas</Button>}
      <RecordTimeline recordId={record.id} version={record} extra={logged} />
    </div>
  );

  const sections = [
    {
      key: "email", label: "Email", count: record.emails,
      content: <AccountEmails account={{ id: record.id, name: record.name }} contacts={record.contacts} canSend={access.canEdit} />,
    },
    {
      key: "contacts", label: "Kontak PIC", count: record.contacts.length,
      content: record.contacts.length || access.canEdit ? (
        <div className="space-y-2">
          <ul className="space-y-2">
            {record.contacts.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-2">
                <div className="min-w-0 text-[0.8125rem]">
                  <p className="flex items-center gap-1.5"><span className="truncate font-medium text-slate-900">{c.name}</span>{c.primary && <Badge tone="brand" size="small">Utama</Badge>}</p>
                  {c.role && <p className="text-[0.75rem] text-slate-600">{c.role}</p>}
                  {(c.email || c.phone) && <p className="text-[0.75rem] text-slate-500">{[c.email, c.phone].filter(Boolean).join(" · ")}</p>}
                </div>
                {removeButton("delContact", c.id, c.name)}
              </li>
            ))}
          </ul>
          {access.canEdit && <Button size="sm" intent="ghost" onClick={() => setDialog("contact")}><UserPlus size={13} /> Tambah kontak</Button>}
        </div>
      ) : undefined,
    },
    { key: "notes", label: "Notes", count: record.notes ? 1 : 0, content: record.notes ? <p className="whitespace-pre-wrap text-[0.8125rem] text-slate-700">{record.notes}</p> : undefined },
    {
      key: "leads", label: "Leads", count: h.leads.length,
      content: h.leads.length ? <ul className="space-y-1">{h.leads.map((l) => row(`${l.lead_no}${l.project_name ? ` · ${l.project_name}` : ""}`,
        <Badge tone={l.is_qualified === true ? "success" : l.is_qualified === false ? "danger" : "neutral"} size="small">{l.is_qualified === true ? "Qualified" : l.is_qualified === false ? "Disqualified" : "Review"}</Badge>, l.id))}</ul> : undefined,
    },
    {
      key: "opty", label: "Opportunity (PQ)", count: h.opportunities.length,
      content: h.opportunities.length ? <ul className="space-y-1">{h.opportunities.map((o) => row(
        <Link href={`/sales/v2/pq-tracker?record=${o.id}`} className="text-brand-700 hover:underline">{o.opty_no}{o.price_amount ? ` · ${rupiah(o.price_amount, o.price_period_code)}` : ""}</Link>,
        <Badge tone={STAGE_TONE[o.pipeline_stage_code] ?? "brand"} size="small">{PQ_STAGE_LABEL[o.pipeline_stage_code] ?? o.pipeline_stage_code}</Badge>, o.id))}</ul> : undefined,
    },
    {
      key: "contracts", label: "Kontrak", count: h.contracts.length,
      content: h.contracts.length ? <ul className="space-y-1">{h.contracts.map((c) => row(c.contract_duration_months ? `${c.contract_duration_months} bulan` : "-",
        <span className="shrink-0 text-[0.75rem] text-slate-500">{c.start_date ?? "-"} s/d {c.end_date ?? "-"}</span>, c.id))}</ul> : undefined,
    },
    {
      key: "invoices", label: "Invoice", count: h.invoices.length,
      content: h.invoices.length ? <ul className="space-y-1">{h.invoices.map((i) => row(`${i.group_name ?? "-"}${i.price_per_month ? ` · ${rupiah(i.price_per_month)}` : ""}`,
        <Badge tone={INVOICE_TONE[i.status_code ?? ""] ?? "neutral"} size="small">{i.status_code ?? "-"}</Badge>, i.id))}</ul> : undefined,
    },
  ];

  // Buttons only (QA 2026-10-08): the status is edited in the Ringkasan above.
  const footer = access.canEdit ? (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" intent="primary" onClick={() => setDialog("activity")}><Plus size={13} /> Catat aktivitas</Button>
      <Button size="sm" intent="neutral" onClick={() => setDialog("edit")}>Edit</Button>
      <span className="ml-auto">
        <MoreMenu items={[
          { label: "Halaman penuh (V1)", onSelect: () => router.push(`/sales/accounts/${record.id}`) },
          ...(access.canDelete ? [{ label: "Hapus", danger: true, onSelect: () => setDialog("delete") }] : []),
        ]} />
      </span>
    </div>
  ) : (
    <p className="text-[0.75rem] text-slate-500">Mode lihat saja: perubahan butuh akses Editor Sales.</p>
  );

  const close = () => setDialog(null);
  const confirm = typeof dialog === "object" && dialog ? dialog : null;
  return (
    <>
      <div ref={wrapRef} hidden />
      <RecordPanel
        record={{ id: record.id, name: record.name } as never}
        title={<PanelTitle name={record.name} prefill={`Tentang akun ${record.name}: `} />}
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
        activityLabel="Aktivitas"
        activity={activity}
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
      {access.canEdit && <AccountDialog record={record} open={dialog === "edit"} onClose={close} />}
      {access.canEdit && <ContactDialog record={record} open={dialog === "contact"} onClose={close} />}
      {access.canEdit && <ActivityDialog record={record} open={dialog === "activity"} onClose={close} />}
      <ConfirmDialog
        open={dialog === "delete"}
        onClose={close}
        title={`Hapus account ${record.name}?`}
        description="Account, semua kontak dan aktivitasnya dihapus permanen. Lead, PQ, kontrak dan invoice tidak ikut terhapus."
        run={async () => { const r = await deleteClient(record.id); if (!r.ok) throw new Error(r.error); onClose(); return "Account dihapus"; }}
      />
      <ConfirmDialog
        open={!!confirm}
        onClose={close}
        title={confirm?.kind === "delContact" ? `Hapus kontak ${confirm.name}?` : `Hapus aktivitas "${confirm?.name}"?`}
        description={confirm?.kind === "delContact" ? "Aktivitas dengan kontak ini tetap ada, tanpa nama kontak." : undefined}
        run={async () => {
          if (confirm?.kind === "delContact") { await deleteContact(confirm.id, record.id); return "Kontak dihapus"; }
          if (confirm) await deleteActivity(confirm.id, record.id);
          return "Aktivitas dihapus";
        }}
      />
    </>
  );
}

function ConfirmDialog({ open, onClose, title, description, run }: { open: boolean; onClose: () => void; title: string; description?: string; run: () => Promise<string> }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { showToast } = useToast();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !pending && onClose()} variant="alert" title={title} description={description}>
      <DialogFooter variant="alert">
        <Button size="sm" intent="neutral" onClick={onClose} disabled={pending}>Batal</Button>
        <Button size="sm" intent="danger" loading={pending} onClick={() => start(async () => {
          try { const msg = await run(); onClose(); showToast(msg); router.refresh(); }
          catch (err) { showToast((err as Error)?.message || "Gagal menghapus", "error"); }
        })}>Hapus</Button>
      </DialogFooter>
    </Dialog>
  );
}

// ── Forms: V1's Add Account, Add Contact and Log Activity fields ────────────────────────────────────────────────
function AccountFields({ d }: { d: Draft }) {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-3">
      <F label="Nama Klien" required><Input name="name" required defaultValue={d.name} autoFocus /></F>
      <F label="Industri"><Input name="industry" defaultValue={d.industry} /></F>
      <F label="Status"><Select name="status_code" defaultValue={d.status_code || "prospect"} options={statusOptions} /></F>
      <F label="Notes" span><Textarea name="notes" rows={3} defaultValue={d.notes} /></F>
    </div>
  );
}

/** Edit: same four fields V1's updateClient writes. What was typed survives closing, per record, until saved or reset. */
const editDrafts = new Map<string, Draft>();
function AccountDialog({ record, open, onClose }: { record: Account; open: boolean; onClose: () => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [resetTick, setResetTick] = useState(0);
  const close = () => { editDrafts.set(record.id, readDraft(formRef.current)); onClose(); };
  const onOpenChange = useCloseFromXOnly(open, close);
  const { pending, onSubmit, t } = useSubmit((fd) => updateClient(record.id, fd), () => { editDrafts.delete(record.id); onClose(); });
  const d = editDrafts.get(record.id) ?? { name: record.name, industry: record.industry ?? "", status_code: record.status, notes: record.notes ?? "" };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Edit ${record.name}`} icon={<Building2 size={16} />} closeLabel="Tutup" width={640} data-sales-v2-dialog="account-edit">
      {open && (
        <form key={resetTick} ref={formRef} onSubmit={onSubmit}>
          <DialogBody><AccountFields d={d} /></DialogBody>
          <DraftFooter pending={pending} onCancel={close} onReset={() => { editDrafts.delete(record.id); setResetTick((n) => n + 1); }} t={t} resetLabel="Kembalikan ke data tersimpan" />
        </form>
      )}
    </Dialog>
  );
}

/** "+ New": V1's Add Account in a dialog that keeps what was typed until it is saved or cleared. */
export function CreateAccount({ names, open, status, onOpen, onClose }: { names: Set<string>; open: boolean; status?: string; onOpen: () => void; onClose: () => void }) {
  const draft = useRef<Draft>({});
  const formRef = useRef<HTMLFormElement>(null);
  const [resetTick, setResetTick] = useState(0);
  const close = () => { draft.current = readDraft(formRef.current); onClose(); };
  const onOpenChange = useCloseFromXOnly(open, close);
  // The name is unique (uq_crm_clients_name); say so here instead of the database error.
  const { pending, onSubmit, t } = useSubmit(async (fd) => {
    if (names.has(String(fd.get("name") ?? "").trim())) throw new Error("Account dengan nama ini sudah ada.");
    await createClient(fd);
  }, () => { draft.current = {}; onClose(); });
  const d = status ? { ...draft.current, status_code: status } : draft.current;
  return (
    <>
      <Button intent="primary" size="sm" onClick={onOpen} data-testid="sales-v2-new"><Plus size={14} strokeWidth={2.25} /> New</Button>
      <Dialog open={open} onOpenChange={onOpenChange} title="Tambah Account" icon={<Building2 size={16} />} closeLabel="Tutup" width={640} data-sales-v2-dialog="account-create">
        {open && (
          <form key={resetTick} ref={formRef} onSubmit={onSubmit}>
            <DialogBody><AccountFields d={d} /></DialogBody>
            <DraftFooter pending={pending} onCancel={close} onReset={() => { draft.current = {}; setResetTick((n) => n + 1); }} t={t} />
          </form>
        )}
      </Dialog>
    </>
  );
}

function ContactDialog({ record, open, onClose }: { record: Account; open: boolean; onClose: () => void }) {
  const onOpenChange = useCloseFromXOnly(open, onClose);
  const { pending, onSubmit, t } = useSubmit((fd) => createContact(record.id, fd), onClose);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Tambah kontak · ${record.name}`} icon={<UserPlus size={16} />} closeLabel="Tutup" width={640} data-sales-v2-dialog="account-contact">
      {open && (
        <form onSubmit={onSubmit}>
          <DialogBody>
            <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
              <F label="Nama" required><Input name="name" required autoFocus /></F>
              <F label="Jabatan"><Input name="role_title" /></F>
              <F label="Email"><Input name="email" type="email" /></F>
              <F label="Telepon"><Input name="phone" /></F>
              <label className="flex items-center gap-2 text-[0.8125rem] font-medium text-slate-700">
                <Checkbox name="is_primary" value="true" /> Kontak utama
              </label>
            </div>
          </DialogBody>
          <DraftFooter pending={pending} onCancel={onClose} onReset={onClose} t={t} resetLabel="" />
        </form>
      )}
    </Dialog>
  );
}

function ActivityDialog({ record, open, onClose }: { record: Account; open: boolean; onClose: () => void }) {
  const onOpenChange = useCloseFromXOnly(open, onClose);
  const { pending, onSubmit, t } = useSubmit((fd) => createActivity(record.id, fd), onClose);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Catat aktivitas · ${record.name}`} icon={<Calendar size={16} />} closeLabel="Tutup" width={640} data-sales-v2-dialog="account-activity">
      {open && (
        <form onSubmit={onSubmit}>
          <DialogBody>
            <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-3">
              <F label="Tipe"><Select name="type_code" defaultValue="call" options={opts(ACTIVITY_TYPES)} /></F>
              <F label="Tanggal" required><Input name="activity_date" type="date" required defaultValue={today()} /></F>
              <F label="Kontak"><Select name="contact_id" defaultValue="" placeholder="-" options={[{ value: "", label: "-" }, ...record.contacts.map((c) => ({ value: c.id, label: c.name }))]} /></F>
              <F label="Judul" required span><Input name="title" required autoFocus /></F>
              <F label="Deskripsi" span><Textarea name="description" rows={3} /></F>
            </div>
          </DialogBody>
          <DraftFooter pending={pending} onCancel={onClose} onReset={onClose} t={t} resetLabel="" />
        </form>
      )}
    </Dialog>
  );
}
