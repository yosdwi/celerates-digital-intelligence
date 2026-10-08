"use client";
// The Opportunity's full record page (QA 2026-10-08), Attio's "open record": the panel's ↗ lands here. Crisp RecordPage
// draws the chrome (top bar, details column, tabs); Perjalanan is Deal 360 (journey-model.ts), Aktivitas the same
// timeline as the panel. Editing stays where it is: the table, the panel and the V1 edit page.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, RecordPage, type Column } from "@crisp-ui-kit/crisp";
import { LEVEL_LABEL, SERVICE_LABEL, STAGES, STAGE_LABEL, rupiah } from "./model";
import { HistoryProvider, type Access } from "./record-workspace";
import { RecordTimeline } from "./history";
import { AccountEmails } from "./email-panel";
import { OPPORTUNITY_CONFIG } from "./workspace";
import { ACCOUNT_STATUS_LABEL } from "./account-model";
import type { DealPageData } from "./journey-data";
import type { JourneyAction, JourneyStep } from "./journey-model";

const OWNER_TONE: Record<JourneyAction["owner"], "brand" | "warning" | "success" | "purple" | "neutral"> = {
  Sales: "brand", TA: "warning", TM: "success", PMO: "neutral", Finance: "purple",
};
const STATUS_OPTIONS = STAGES.map((s) => ({ value: s.id, label: s.title, color: s.accent }));
const TALENT_STATUS: Record<string, string> = { on_project: "On project", idle: "Idle", out: "Out" };

export function DealPage({ data, access, returnTo }: { data: DealPageData; access: Access; returnTo: string }) {
  const router = useRouter();
  const { tracker: t, journey } = data;
  const here = `/sales/v2/opportunity-tracker/${t.id}`;

  const record = {
    id: t.id,
    client: { name: t.client },
    optyNo: t.optyNo,
    status: t.status,
    salesPic: t.salesPic,
    price: rupiah(t.price, t.pricePeriod) || null,
    closingPrice: rupiah(t.closingPrice) || null,
    position: t.position ? `${t.position}${t.headcount ? ` × ${t.headcount}` : ""}` : null,
    level: t.level ? LEVEL_LABEL[t.level] ?? t.level : null,
    service: t.serviceType ? SERVICE_LABEL[t.serviceType] ?? t.serviceType : null,
    lastCommunication: t.lastCommunication,
    qualified: t.salesQualified ? "Qualified" : "Belum",
    account: data.account?.name ?? null,
    contact: data.contacts[0] ? `${data.contacts[0].name}${data.contacts[0].role ? ` · ${data.contacts[0].role}` : ""}` : null,
    otherDeals: data.otherDeals,
  };
  const columns: Column[] = [
    { key: "client", label: "Client", type: "entity" },
    { key: "optyNo", label: "Opty No" },
    { key: "status", label: "Stage", type: "status", options: STATUS_OPTIONS },
    { key: "salesPic", label: "Sales PIC" },
    { key: "price", label: "Price" },
    { key: "closingPrice", label: "Estimasi deal" },
    { key: "position", label: "Positions" },
    { key: "level", label: "Level" },
    { key: "service", label: "Service" },
    { key: "qualified", label: "Sales Qualified" },
    { key: "lastCommunication", label: "Last Communication", type: "date" },
    {
      key: "account", label: "Account",
      render: () => data.account
        ? <Link className="text-brand-700 hover:underline" href={`/sales/v2/accounts?record=${data.account.id}`}>{data.account.name} · {ACCOUNT_STATUS_LABEL[data.account.status] ?? data.account.status}</Link>
        : <span className="text-slate-400">Belum ada di Account (CRM)</span>,
    },
    { key: "contact", label: "Kontak utama" },
    { key: "otherDeals", label: "Opty lain di client ini", type: "number" },
  ];

  return (
    <HistoryProvider config={OPPORTUNITY_CONFIG} access={access}>
      <div className="h-dvh bg-white text-[0.8125rem] text-slate-800 md:-mb-24" data-sales-v2 data-deal-page>
        <RecordPage
          record={record}
          columns={columns}
          collection="Opportunity Tracker"
          onBack={() => router.push(returnTo)}
          sections={[
            { title: "Deal", fields: ["optyNo", "status", "salesPic", "price", "closingPrice", "position", "level", "service", "qualified", "lastCommunication"] },
            { title: "Account", fields: ["account", "contact", "otherDeals"] },
          ]}
          highlights={false}
          showShare={false}
          showAskAttio={false}
          showComments={false}
          showQuickActions={false}
          showLists={false}
          onEditRecord={access.canEdit ? () => router.push(`/sales/opportunity-tracker/${t.id}/edit?return_to=${encodeURIComponent(here)}`) : undefined}
          belowIdentity={<p className="px-1 text-[0.75rem] text-slate-500">{STAGE_LABEL[t.status] ?? t.status} · {journey.summary}</p>}
          labels={{ breadcrumb: "Opportunity Tracker", editRecord: "Edit", recordDetails: "Detail", recordActions: "Aksi", searchFields: "Cari field", viewAll: "Lihat semua", showLess: "Lebih sedikit" }}
          tabs={[
            { id: "journey", label: "Perjalanan", count: journey.actions.length || undefined, render: () => <Journey data={data} /> },
            {
              id: "email", label: "Email", render: () => data.account
                ? <div className="max-w-3xl py-2"><AccountEmails account={{ id: data.account.id, name: data.account.name }} contacts={data.contacts} canSend={access.canEdit} context={{ "opty.no": t.optyNo, "opty.posisi": t.position }} /></div>
                : <p className="py-2 text-slate-500">{t.client} belum ada di Account (CRM). Tambahkan account dan kontaknya supaya email tercatat di sini.</p>,
            },
            {
              id: "activity", label: "Aktivitas", render: () => (
                <div className="max-w-3xl space-y-3 py-2">
                  {t.progressNotes && (
                    <div className="rounded-md bg-slate-50 px-3 py-2">
                      <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-slate-500">Progress Notes</p>
                      <p className="whitespace-pre-wrap leading-5 text-slate-700">{t.progressNotes}</p>
                    </div>
                  )}
                  <RecordTimeline recordId={t.id} version={t} />
                </div>
              ),
            },
          ]}
        />
      </div>
    </HistoryProvider>
  );
}

function Journey({ data }: { data: DealPageData }) {
  const { journey, input } = data;
  return (
    <div className="max-w-4xl space-y-6 py-2" data-journey>
      <ol className="grid grid-cols-3 gap-y-4 sm:grid-cols-6" aria-label="Perjalanan deal">
        {journey.steps.map((s, i) => <Step key={s.key} step={s} last={i === journey.steps.length - 1} />)}
      </ol>

      <section>
        <h3 className="mb-2 text-[0.75rem] font-semibold uppercase tracking-wider text-slate-500">Perlu tindakan</h3>
        {journey.actions.length ? (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {journey.actions.map((a) => (
              <li key={a.key} className="flex items-center gap-3 px-3 py-2">
                <Badge tone={OWNER_TONE[a.owner]} size="small">{a.owner}</Badge>
                <span className="min-w-0 flex-1">{a.text}</span>
                {a.href && <Link className="shrink-0 text-brand-700 hover:underline" href={a.href}>Buka →</Link>}
              </li>
            ))}
          </ul>
        ) : <p className="text-slate-500">Tidak ada hand-off yang tertahan.</p>}
      </section>

      <section>
        <h3 className="mb-2 text-[0.75rem] font-semibold uppercase tracking-wider text-slate-500">Talent di deal ini</h3>
        {input.talents.length ? (
          <table className="w-full text-left">
            <thead className="text-[0.75rem] text-slate-500">
              <tr><th className="py-1 font-medium">Nama</th><th className="font-medium">Posisi</th><th className="font-medium">Status</th><th className="font-medium">Price / bln</th><th className="font-medium">Margin</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {input.talents.map((x) => (
                <tr key={x.onboardingId}>
                  <td className="py-1.5">{x.name ?? "-"}</td>
                  <td>{x.position ?? "-"}</td>
                  <td>{x.assignment ? TALENT_STATUS[x.assignment.status ?? ""] ?? x.assignment.status ?? "-" : x.employeeId ? "Employee, belum setup" : "Onboarding"}</td>
                  <td>{rupiah(x.assignment?.price) || "-"}</td>
                  <td className={x.assignment?.marginPercent != null && x.assignment.marginPercent < 0 ? "text-red-600" : ""}>
                    {x.assignment?.marginPercent != null ? `${x.assignment.marginPercent.toFixed(1).replace(".", ",")}%` : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="text-slate-500">Belum ada talent yang onboarding.</p>}
      </section>

      <section>
        <h3 className="mb-2 text-[0.75rem] font-semibold uppercase tracking-wider text-slate-500">Uang</h3>
        <p>
          Estimasi deal {rupiah(journey.money.deal) || "-"} · Klaim ke klien {rupiah(journey.money.claimed) || "Rp 0"} · Invoice {journey.money.invoiced}/{journey.money.claims} klaim
        </p>
        {data.pq && <p className="mt-1 text-slate-500">PQ <Link className="text-brand-700 hover:underline" href={`/sales/v2/pq-tracker?record=${data.pq.id}`}>{data.pq.no ?? "buka"}</Link>{data.requisition && <> · Requisition <Link className="text-brand-700 hover:underline" href={`/ta/${data.requisition.id}/edit`}>{data.requisition.no}</Link></>}</p>}
      </section>
    </div>
  );
}

function Step({ step, last }: { step: JourneyStep; last: boolean }) {
  const dot = step.state === "done" ? "bg-emerald-500 border-emerald-500" : step.state === "current" ? "bg-white border-brand-600 ring-2 ring-brand-100" : "bg-white border-slate-300";
  const line = step.state === "done" ? "bg-emerald-500" : "bg-slate-200";
  return (
    <li className="relative pr-2" data-step={step.key} data-state={step.state}>
      <div className="flex items-center">
        <span className={`h-3 w-3 shrink-0 rounded-full border-2 ${dot}`} />
        {!last && <span className={`ml-1 h-0.5 flex-1 ${line}`} />}
      </div>
      <p className="mt-1.5 font-semibold text-slate-800">{step.label}</p>
      <p className="text-[0.75rem] leading-4 text-slate-500">{step.detail}</p>
    </li>
  );
}
