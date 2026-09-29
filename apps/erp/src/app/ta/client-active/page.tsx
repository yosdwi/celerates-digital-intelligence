import { db } from "@/db";
import { applications, requisitions, candidates } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { ClientCard } from "./client-card";
import { Handshake } from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function ClientActivePage() {
  const t = await getTranslations("ta.clientActive.page");
  const rows = await db
    .select({
      id: applications.id,
      candidate_no: candidates.candidate_no,
      candidate_name: candidates.candidate_name,
      wa_number: candidates.wa_number,
      email: candidates.email,
      level_code: applications.level_code,
      hiring_status_code: applications.hiring_status_code,
      price_amount: applications.price_amount,
      client_submission_status_code: applications.client_submission_status_code,
      client_submission_updated_at: applications.client_submission_updated_at,
      client_submission_updated_by_name: applications.client_submission_updated_by_name,
      client_submission_note: applications.client_submission_note,
      client_name: requisitions.client_name,
      position_name: requisitions.position_name,
      created_at: applications.created_at,
    })
    .from(applications)
    .leftJoin(requisitions, eq(applications.requisition_id, requisitions.id))
    .leftJoin(candidates, eq(applications.candidate_id, candidates.id))
    .orderBy(desc(applications.created_at));

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = r.client_name ?? t("noClientGroup");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  const sortedClients = [...groups.keys()].sort((a, b) => a.localeCompare(b));

  const totalSent = rows.filter((r) => r.client_submission_status_code).length;
  const totalInterview = rows.filter((r) => r.client_submission_status_code === "client_interview").length;
  const totalAccepted = rows.filter((r) => r.client_submission_status_code === "client_accepted").length;

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={Handshake}
        color="bg-teal-600"
        eyebrow="Talent Acquisition x Sales"
        title="Client Active"
        subtitle={t("subtitle")}
      />

      <main className="px-8 py-8 space-y-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Total Candidate" value={rows.length} color="navy" />
          <StatCard label={t("totalSent")} value={totalSent} color="blue" />
          <StatCard label="Client Interview" value={totalInterview} color="amber" />
          <StatCard label="Client Accepted" value={totalAccepted} color="green" />
        </div>

        <div className="space-y-3">
          {sortedClients.map((clientName) => (
            <ClientCard key={clientName} clientName={clientName} items={groups.get(clientName)!} />
          ))}

          {sortedClients.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center text-slate-400">
              {t("noDataYet")}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
