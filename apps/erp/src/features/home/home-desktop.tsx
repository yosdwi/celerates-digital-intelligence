// Beranda on desktop (QA doc pages 17–18): Attio's Home instead of a module picker, since the sidebar already
// navigates. A greeting, the Agent box, then what needs the person today, all read with their own identity.
import Link from "next/link";
import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { Bell, CalendarClock, FileSignature, Handshake } from "lucide-react";
import { db } from "@/db";
import { notifications, salesOpportunityTrackers, signatureRequests, timeOffApprovalSteps } from "@/db/schema";
import { HomeAsk } from "./home-ask";

type Item = { key: string; icon: React.ComponentType<{ className?: string }>; title: string; meta: string; href: string };
const OPEN_STAGES = ["cv_submission", "solutioning", "proposal_sent", "need_action"];

function greeting(now = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat("id-ID", { hour: "numeric", hour12: false, timeZone: "Asia/Jakarta" }).format(now));
  return hour < 11 ? "Selamat pagi" : hour < 15 ? "Selamat siang" : hour < 18 ? "Selamat sore" : "Selamat malam";
}
const when = (d: Date) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(d);

export async function HomeDesktop({ userId, name, isOwner, divisions }: { userId: string; name: string; isOwner: boolean; divisions: string[] }) {
  const sales = isOwner || divisions.includes("sales");
  const staleBefore = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const [unread, signs, approvals, stale] = await Promise.all([
    db.select().from(notifications).where(and(eq(notifications.user_id, userId), eq(notifications.is_read, false))).orderBy(desc(notifications.created_at)).limit(5),
    db.select().from(signatureRequests).where(and(eq(signatureRequests.signer_user_id, userId), eq(signatureRequests.status_code, "pending"))).orderBy(desc(signatureRequests.created_at)).limit(5),
    db.select().from(timeOffApprovalSteps).where(and(eq(timeOffApprovalSteps.approver_user_id, userId), eq(timeOffApprovalSteps.status_code, "pending"))).limit(5),
    sales
      ? db.select().from(salesOpportunityTrackers).where(and(
          sql`lower(${salesOpportunityTrackers.sales_pic_name}) = lower(${name})`,
          inArray(salesOpportunityTrackers.opty_status_code, OPEN_STAGES),
          or(isNull(salesOpportunityTrackers.last_communication_date), lt(salesOpportunityTrackers.last_communication_date, staleBefore)),
        )).orderBy(salesOpportunityTrackers.last_communication_date).limit(5)
      : Promise.resolve([]),
  ]);

  const items: Item[] = [
    ...signs.map((s) => ({ key: `s${s.id}`, icon: FileSignature, title: `Tanda tangani: ${s.document_title}`, meta: when(s.created_at), href: "/ttd-online" })),
    ...approvals.map((a) => ({ key: `a${a.id}`, icon: CalendarClock, title: "Persetujuan cuti menunggu Anda", meta: "Time off", href: "/attendance/time-off" })),
    ...stale.map((t) => ({
      key: `d${t.id}`, icon: Handshake, title: `${t.client_name}: belum ada komunikasi ${t.last_communication_date ? `sejak ${t.last_communication_date}` : "tercatat"}`,
      meta: t.opty_no, href: `/sales/v2/opportunity-tracker?view=table&record=${t.id}`,
    })),
  ];
  const first = name.split(" ")[0] || name;
  const suggestions = [
    "Apa yang perlu saya kerjakan hari ini?",
    ...(sales ? ["Deal mana yang perlu follow-up minggu ini?", "Ringkas pipeline saya"] : []),
    ...(isOwner || divisions.some((d) => ["hr", "pmo", "tm"].includes(d)) ? ["Siapa yang belum absen hari ini?"] : []),
  ].slice(0, 4);

  return (
    <div className="mx-auto w-full max-w-[680px] px-6 pb-16 pt-14">
      <h1 className="mb-5 text-center text-[22px] font-semibold text-slate-900">{greeting()}, {first}</h1>
      <HomeAsk suggestions={suggestions} />

      <section className="mt-10">
        <h2 className="mb-2 text-[13px] font-medium text-slate-500">Perlu tindakan Anda</h2>
        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-[13px] text-slate-500">Tidak ada yang menunggu Anda. 🎉</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {items.map((it) => (
              <li key={it.key}>
                <Link href={it.href} className="flex items-center gap-3 px-4 py-2.5 text-[13.5px] hover:bg-slate-50">
                  <it.icon className="h-4 w-4 flex-none text-slate-500" />
                  <span className="min-w-0 flex-1 truncate text-slate-800">{it.title}</span>
                  <span className="flex-none text-[12px] text-slate-400">{it.meta}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[13px] font-medium text-slate-500">Notifikasi belum dibaca</h2>
          <Link href="/notifications" className="text-[12.5px] text-[#194667] hover:underline">Lihat semua</Link>
        </div>
        {unread.length === 0 ? (
          <p className="text-[13px] text-slate-500">Semua sudah dibaca.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {unread.map((n) => (
              <li key={n.id}>
                <Link href={n.link ?? "/notifications"} className="flex items-center gap-3 px-4 py-2.5 text-[13.5px] hover:bg-slate-50">
                  <Bell className="h-4 w-4 flex-none text-slate-500" />
                  <span className="min-w-0 flex-1 truncate text-slate-800">{n.title}</span>
                  <span className="flex-none text-[12px] text-slate-400">{when(n.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
