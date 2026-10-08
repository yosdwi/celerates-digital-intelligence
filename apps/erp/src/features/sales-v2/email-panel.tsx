"use client";
// Sales email (roadmap #2), Attio-style: an Account's mail as threads, newest first, with compose, reply and templates.
// Shown in the Account panel and on the Opportunity page's Email tab. Mail comes from the pilot mailbox (lib/mail).
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useSession } from "next-auth/react";
import { Badge, Button, Dialog, DialogBody, DialogFooter, FormField, Input, Select, Textarea } from "@crisp-ui-kit/crisp";
import { Mail, RefreshCw, Reply } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import {
  deleteEmailTemplate, getAccountEmails, listEmailTemplates, saveEmailTemplate, sendAccountEmail, syncMailboxNow,
  type MailRow, type MailStatus, type MailTemplate,
} from "@/app/sales/email-actions";
import { fillTemplate, TEMPLATE_VARIABLES } from "@/lib/mail/model";

export type EmailContact = { name: string; email: string | null; primary: boolean };
/** Extra template variables from where the mail is written (the Opportunity page adds opty.no and opty.posisi). */
export type EmailContext = Record<string, string | null | undefined>;

type Thread = { key: string; subject: string; messages: MailRow[]; latest: MailRow };

export function groupThreads(emails: MailRow[]): Thread[] {
  const map = new Map<string, MailRow[]>();
  for (const e of emails) map.set(e.threadKey, [...(map.get(e.threadKey) ?? []), e]);
  return Array.from(map, ([key, list]) => {
    const messages = [...list].sort((a, b) => a.sentAt.localeCompare(b.sentAt));
    return { key, subject: messages[0].subject || "(tanpa subjek)", messages, latest: messages[messages.length - 1] };
  }).sort((a, b) => b.latest.sentAt.localeCompare(a.latest.sentAt));
}

const when = (iso: string) => new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  return m < 1 ? "baru saja" : m < 60 ? `${m} menit lalu` : m < 1440 ? `${Math.round(m / 60)} jam lalu` : `${Math.round(m / 1440)} hari lalu`;
};

export function AccountEmails({ account, contacts, canSend, context = {} }: {
  account: { id: string; name: string };
  contacts: EmailContact[];
  canSend: boolean;
  context?: EmailContext;
}) {
  const { showToast } = useToast();
  const [data, setData] = useState<{ emails: MailRow[]; status: MailStatus } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [compose, setCompose] = useState<null | { to: string; subject: string; inReplyTo: string | null }>(null);
  const [syncing, startSync] = useTransition();

  const load = useCallback(() => {
    getAccountEmails(account.id).then(setData, (err) => setError((err as Error)?.message || "Gagal memuat email"));
  }, [account.id]);
  useEffect(() => { setData(null); setError(null); setOpen(null); load(); }, [load]);

  const threads = useMemo(() => groupThreads(data?.emails ?? []), [data]);
  const primary = contacts.find((c) => c.primary && c.email) ?? contacts.find((c) => c.email);
  const sendable = canSend && !!data?.status.mailbox;

  const reply = (t: Thread) => {
    const lastIn = [...t.messages].reverse().find((m) => m.direction === "in");
    const to = lastIn ? lastIn.from : t.latest.to.join(", ");
    setCompose({ to, subject: /^re:/i.test(t.subject) ? t.subject : `Re: ${t.subject}`, inReplyTo: t.latest.messageId });
  };

  return (
    <div className="space-y-2" data-account-emails>
      <div className="flex flex-wrap items-center gap-2">
        {sendable && <Button size="sm" intent="primary" onClick={() => setCompose({ to: primary?.email ?? "", subject: "", inReplyTo: null })}><Mail size={13} /> Tulis email</Button>}
        <Button size="sm" intent="ghost" loading={syncing} onClick={() => startSync(async () => {
          const r = await syncMailboxNow();
          if (!r.ok) showToast(r.error, "error"); else { showToast(r.stored ? `${r.stored} email baru` : "Tidak ada email baru"); load(); }
        })}><RefreshCw size={13} /> Sinkronkan</Button>
        {data && (
          <span className="text-[0.75rem] text-slate-500">
            {data.status.mailbox ?? "Mailbox belum dikonfigurasi"}
            {data.status.lastSyncedAt && ` · sinkron ${ago(data.status.lastSyncedAt)}`}
          </span>
        )}
      </div>
      {data?.status.lastError && <p className="rounded bg-amber-50 px-2 py-1 text-[0.75rem] text-amber-800">Sinkronisasi terakhir gagal: {data.status.lastError}</p>}
      {error && <p className="text-[0.75rem] text-red-600">{error}</p>}
      {!data && !error && <p className="text-[0.75rem] text-slate-500">Memuat email…</p>}
      {data && !threads.length && (
        <p className="text-[0.8125rem] text-slate-500">
          Belum ada email dengan {account.name}. Email ke/dari alamat kontak (atau domain perusahaannya) di mailbox
          {data.status.mailbox ? ` ${data.status.mailbox}` : ""} tercatat otomatis, termasuk email yang di-BCC ke sana.
        </p>
      )}
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 empty:hidden">
        {threads.map((t) => (
          <li key={t.key}>
            <button type="button" className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => setOpen(open === t.key ? null : t.key)} aria-expanded={open === t.key}>
              <span className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{t.subject}</span>
                {t.messages.length > 1 && <span className="text-[0.75rem] text-slate-500">{t.messages.length}</span>}
                <span className="shrink-0 text-[0.75rem] text-slate-500">{ago(t.latest.sentAt)}</span>
              </span>
              <span className="block truncate text-[0.75rem] text-slate-600">
                {t.latest.direction === "out" ? "Ke " + t.latest.to.join(", ") : `Dari ${t.latest.fromName ?? t.latest.from}`} · {t.latest.snippet}
              </span>
            </button>
            {open === t.key && (
              <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 px-3 py-3">
                {t.messages.map((m) => <Message key={m.id} m={m} />)}
                {sendable && <Button size="sm" intent="neutral" onClick={() => reply(t)}><Reply size={13} /> Balas</Button>}
              </div>
            )}
          </li>
        ))}
      </ul>
      {compose && (
        <ComposeDialog
          account={account}
          contacts={contacts}
          context={context}
          initial={compose}
          onClose={() => setCompose(null)}
          onSent={() => { setCompose(null); load(); }}
        />
      )}
    </div>
  );
}

function Message({ m }: { m: MailRow }) {
  const [all, setAll] = useState(false);
  const body = m.body ?? "";
  const long = body.length > 1500;
  return (
    <article className="rounded-md border border-slate-200 bg-white px-3 py-2">
      <header className="mb-1 flex flex-wrap items-center gap-x-2 text-[0.75rem] text-slate-600">
        <Badge tone={m.direction === "out" ? "brand" : "neutral"} size="small">{m.direction === "out" ? "Keluar" : "Masuk"}</Badge>
        <span className="font-medium text-slate-800">{m.fromName ?? m.from}</span>
        <span>→ {m.to.join(", ")}{m.cc.length ? ` · cc ${m.cc.join(", ")}` : ""}</span>
        <span className="ml-auto">{when(m.sentAt)}{m.source === "erp" && m.by ? ` · dikirim ${m.by} dari ERP` : ""}</span>
      </header>
      <p className="whitespace-pre-wrap break-words text-[0.8125rem] leading-5 text-slate-800">{long && !all ? `${body.slice(0, 1500)}…` : body}</p>
      {long && <button type="button" className="mt-1 text-[0.75rem] text-brand-700 hover:underline" onClick={() => setAll(!all)}>{all ? "Ringkas" : "Lihat semua"}</button>}
    </article>
  );
}

function ComposeDialog({ account, contacts, context, initial, onClose, onSent }: {
  account: { id: string; name: string };
  contacts: EmailContact[];
  context: EmailContext;
  initial: { to: string; subject: string; inReplyTo: string | null };
  onClose: () => void;
  onSent: () => void;
}) {
  const { showToast } = useToast();
  const { data: session } = useSession();
  const me = ((session?.user as { fullName?: string } | undefined)?.fullName ?? session?.user?.name ?? "") as string;
  const [to, setTo] = useState(initial.to);
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState("");
  const [templates, setTemplates] = useState<MailTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [naming, setNaming] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => { listEmailTemplates().then(setTemplates, () => setTemplates([])); }, []);

  const vars = () => {
    const first = to.split(/[,;\s]+/)[0]?.toLowerCase();
    const contact = contacts.find((c) => c.email?.toLowerCase() === first) ?? contacts.find((c) => c.primary) ?? contacts[0];
    return { "kontak.nama": contact?.name, "account.nama": account.name, "pengirim.nama": me, ...context };
  };
  const apply = (id: string) => {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    const v = vars();
    if (!initial.inReplyTo) setSubject(fillTemplate(t.subject, v));
    setBody(fillTemplate(t.body, v));
  };

  const send = () => start(async () => {
    const r = await sendAccountEmail({ clientId: account.id, to, cc, subject, body, inReplyTo: initial.inReplyTo });
    if (!r.ok) { showToast(r.error, "error"); return; }
    showToast("Email terkirim");
    onSent();
  });
  const saveTemplate = (name: string) => start(async () => {
    const r = await saveEmailTemplate({ name, subject, body });
    if (!r.ok) { showToast(r.error, "error"); return; }
    setTemplates(await listEmailTemplates());
    setTemplateId(r.id);
    setNaming(null);
    showToast("Template disimpan");
  });
  const removeTemplate = () => start(async () => {
    await deleteEmailTemplate(templateId);
    setTemplates((ts) => ts.filter((t) => t.id !== templateId));
    setTemplateId("");
    showToast("Template dihapus");
  });

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()} title={initial.inReplyTo ? "Balas email" : `Email ke ${account.name}`} width={640} closeLabel="Tutup">
      <form onSubmit={(e) => { e.preventDefault(); send(); }}>
        <DialogBody>
          <div className="space-y-3">
            <FormField label="Kepada" required><Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="nama@perusahaan.com, …" autoFocus={!to} /></FormField>
            <FormField label="Cc"><Input value={cc} onChange={(e) => setCc(e.target.value)} /></FormField>
            <div className="flex items-end gap-2">
              <FormField label="Template" className="min-w-0 flex-1">
                <Select value={templateId} onValueChange={apply} placeholder="Pilih template…" options={templates.map((t) => ({ value: t.id, label: t.name }))} />
              </FormField>
              {templateId && <Button type="button" size="sm" intent="ghost" onClick={removeTemplate} disabled={pending}>Hapus template</Button>}
            </div>
            {!initial.inReplyTo && <FormField label="Subjek" required><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></FormField>}
            <FormField label="Isi" required><Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} autoFocus={!!to} /></FormField>
            <p className="text-[0.75rem] text-slate-500">Variabel template: {TEMPLATE_VARIABLES.map((v) => `{{${v}}}`).join(" ")}</p>
            {naming !== null && (
              <div className="flex items-end gap-2">
                <FormField label="Nama template" className="min-w-0 flex-1"><Input value={naming} onChange={(e) => setNaming(e.target.value)} autoFocus /></FormField>
                <Button type="button" size="sm" intent="neutral" onClick={() => saveTemplate(naming)} disabled={pending || !naming.trim()}>Simpan</Button>
              </div>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          {naming === null && <button type="button" onClick={() => setNaming("")} disabled={pending} className="mr-auto text-[0.75rem] text-slate-500 hover:text-slate-800 hover:underline">Simpan sebagai template</button>}
          <Button type="button" size="sm" intent="neutral" onClick={onClose} disabled={pending}>Batal</Button>
          <Button type="submit" size="sm" intent="primary" loading={pending}>Kirim</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
