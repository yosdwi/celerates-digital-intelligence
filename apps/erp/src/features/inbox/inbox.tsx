"use client";
// Inbox on desktop (QA doc page 23, Attio and Frappe): a list on the left with the Notifikasi and Email tabs, filters
// and day groups, and the selected item on the right. Email is the shared celeratesapps mailbox and comes next
// (docs/design/CONFORM-WORKFLOWS-AND-INBOX.md §3); until then its tab says so.
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, ExternalLink, Inbox as InboxIcon, Mail } from "lucide-react";
import { Button, Segmented } from "@crisp-ui-kit/crisp";
import { markAllNotificationsRead, markNotificationRead } from "@/app/notifications/actions";

export type InboxItem = { id: string; title: string; body: string | null; link: string | null; isRead: boolean; createdAt: string };

const TZ = "Asia/Jakarta";
const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
function dayLabel(key: string): string {
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString());
  if (key === today) return "Hari ini";
  if (key === yesterday) return "Kemarin";
  return new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }).format(new Date(`${key}T12:00:00+07:00`));
}
const time = (iso: string) => new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso));
const full = (iso: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short", timeZone: TZ }).format(new Date(iso));

export function Inbox({ items: initial }: { items: InboxItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [tab, setTab] = useState<"notif" | "email">("notif");
  const [filter, setFilter] = useState<"unread" | "all">(initial.some((i) => !i.isRead) ? "unread" : "all");
  const [selected, setSelected] = useState<string | null>(null);
  const [, start] = useTransition();

  const shown = items.filter((i) => filter === "all" || !i.isRead || i.id === selected);
  const groups = useMemo(() => {
    const out: { key: string; items: InboxItem[] }[] = [];
    for (const it of shown) {
      const key = dayKey(it.createdAt);
      if (out.at(-1)?.key === key) out.at(-1)!.items.push(it); else out.push({ key, items: [it] });
    }
    return out;
  }, [shown]);
  const unread = items.filter((i) => !i.isRead).length;
  const current = items.find((i) => i.id === selected) ?? null;

  const open = (it: InboxItem) => {
    setSelected(it.id);
    if (!it.isRead) {
      setItems((all) => all.map((x) => (x.id === it.id ? { ...x, isRead: true } : x)));
      start(() => markNotificationRead(it.id));
    }
  };
  const readAll = () => {
    setItems((all) => all.map((x) => ({ ...x, isRead: true })));
    start(async () => { await markAllNotificationsRead(); router.refresh(); });
  };

  return (
    <div className="flex h-[calc(100dvh-49px)] min-h-0">
      <div className="flex w-[380px] flex-none flex-col border-r border-slate-200">
        <div className="flex items-center gap-1 border-b border-slate-200 px-3 pt-2">
          {([["notif", "Notifikasi", Bell, unread], ["email", "Email", Mail, 0]] as const).map(([key, text, Icon, count]) => (
            <button key={key} type="button" onClick={() => setTab(key)} aria-pressed={tab === key}
              className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-2.5 pb-2 pt-1 text-[13px] font-medium ${tab === key ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
              <Icon className="h-3.5 w-3.5" /> {text}
              {count > 0 && <span className="rounded-full bg-slate-900 px-1.5 text-[10.5px] text-white">{count}</span>}
            </button>
          ))}
        </div>
        {tab === "notif" ? (
          <>
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <Segmented value={filter} onValueChange={(v) => setFilter(v as "unread" | "all")}
                options={[{ value: "unread", label: "Belum dibaca" }, { value: "all", label: "Semua" }]} aria-label="Saring notifikasi" />
              <Button size="sm" intent="ghost" onClick={readAll} disabled={unread === 0}><CheckCheck size={14} /> Tandai semua dibaca</Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pb-6">
              {groups.length === 0 && (
                <p className="px-6 py-12 text-center text-[13px] text-slate-500">{filter === "unread" ? "Tidak ada notifikasi belum dibaca." : "Belum ada notifikasi."}</p>
              )}
              {groups.map((g) => (
                <div key={g.key}>
                  <p className="sticky top-0 z-[1] bg-white/95 px-4 pb-1 pt-3 text-[11.5px] font-medium uppercase tracking-wide text-slate-400">{dayLabel(g.key)}</p>
                  {g.items.map((it) => (
                    <button key={it.id} type="button" onClick={() => open(it)} aria-current={it.id === selected || undefined}
                      className={`flex w-full items-start gap-2.5 px-4 py-2.5 text-left hover:bg-slate-50 ${it.id === selected ? "bg-slate-100" : ""}`}>
                      <span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${it.isRead ? "bg-transparent" : "bg-[#2563eb]"}`} aria-label={it.isRead ? undefined : "Belum dibaca"} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className={`min-w-0 flex-1 truncate text-[13.5px] ${it.isRead ? "text-slate-700" : "font-semibold text-slate-900"}`}>{it.title}</span>
                          <span className="flex-none text-[11.5px] text-slate-400">{time(it.createdAt)}</span>
                        </span>
                        {it.body && <span className="mt-0.5 line-clamp-2 block text-[12.5px] text-slate-500">{it.body}</span>}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="px-6 py-12 text-center text-[13px] text-slate-500">
            <Mail className="mx-auto mb-2 h-6 w-6 text-slate-400" />
            Email tim (inbox bersama celeratesapps@celerates.co.id) sedang disiapkan. Email yang cocok dengan Account atau Deal juga akan tampil di Deal 360.
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto">
        {current ? (
          <article className="mx-auto max-w-[720px] px-8 py-8">
            <p className="text-[12px] text-slate-400">{full(current.createdAt)}</p>
            <h1 className="mt-1 text-[18px] font-semibold text-slate-900">{current.title}</h1>
            {current.body && <p className="mt-3 whitespace-pre-line text-[14px] leading-6 text-slate-700">{current.body}</p>}
            {current.link && (
              <Link href={current.link} className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-[#194667] px-3 py-1.5 text-[13px] font-medium text-white hover:bg-[#123650]">
                <ExternalLink className="h-3.5 w-3.5" /> Buka
              </Link>
            )}
          </article>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-[13px] text-slate-400">
            <InboxIcon className="h-8 w-8" />
            Pilih notifikasi untuk melihat detailnya.
          </div>
        )}
      </div>
    </div>
  );
}
