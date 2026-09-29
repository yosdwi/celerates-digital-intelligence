import { db } from "@/db";
import {
  extensionRequestSpecialNotes, extensionIncrementRequests, employees, onboardingRequests, candidates,
} from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveActorDivision } from "@/lib/special-notes-notify";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StickyNote } from "lucide-react";
import { SpecialNotesTable, type NoteRow } from "./special-notes-table";
import { getTranslations } from "next-intl/server";

export default async function SpecialNotesPage() {
  const t = await getTranslations("tm.specialNotes");
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  const userName = ((session?.user as any)?.fullName ?? session?.user?.name ?? t("someone")) as string;
  const myDivision = userId ? await resolveActorDivision(userId) : null;

  const notes = await db
    .select({
      id: extensionRequestSpecialNotes.id,
      extension_request_id: extensionRequestSpecialNotes.extension_request_id,
      category_code: extensionRequestSpecialNotes.category_code,
      title: extensionRequestSpecialNotes.title,
      note_text: extensionRequestSpecialNotes.note_text,
      effective_date: extensionRequestSpecialNotes.effective_date,
      status_code: extensionRequestSpecialNotes.status_code,
      created_by_name: extensionRequestSpecialNotes.created_by_name,
      created_by_division: extensionRequestSpecialNotes.created_by_division,
      acknowledged_by_name: extensionRequestSpecialNotes.acknowledged_by_name,
      created_at: extensionRequestSpecialNotes.created_at,
      employee_no: employees.employee_no,
      candidate_name: candidates.candidate_name,
      propose_start_date: extensionIncrementRequests.propose_start_date,
      propose_end_date: extensionIncrementRequests.propose_end_date,
    })
    .from(extensionRequestSpecialNotes)
    .innerJoin(extensionIncrementRequests, eq(extensionRequestSpecialNotes.extension_request_id, extensionIncrementRequests.id))
    .innerJoin(employees, eq(extensionIncrementRequests.employee_id, employees.id))
    .leftJoin(onboardingRequests, eq(employees.onboarding_request_id, onboardingRequests.id))
    .leftJoin(candidates, eq(onboardingRequests.candidate_id, candidates.id))
    .orderBy(desc(extensionRequestSpecialNotes.created_at));

  const extensionRequestOptions = await db
    .select({
      id: extensionIncrementRequests.id,
      employee_no: employees.employee_no,
      candidate_name: candidates.candidate_name,
      propose_start_date: extensionIncrementRequests.propose_start_date,
      propose_end_date: extensionIncrementRequests.propose_end_date,
    })
    .from(extensionIncrementRequests)
    .innerJoin(employees, eq(extensionIncrementRequests.employee_id, employees.id))
    .leftJoin(onboardingRequests, eq(employees.onboarding_request_id, onboardingRequests.id))
    .leftJoin(candidates, eq(onboardingRequests.candidate_id, candidates.id))
    .orderBy(desc(extensionIncrementRequests.created_at));

  const totalOpen = notes.filter((n) => n.status_code === "open").length;
  const totalAcknowledged = notes.filter((n) => n.status_code === "acknowledged").length;
  const totalResolved = notes.filter((n) => n.status_code === "resolved").length;

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={StickyNote}
        color="bg-teal-600"
        eyebrow={t("eyebrow")}
        title="Special Notes -- Extension Request"
        subtitle={t("subtitle")}
      />

      <main className="px-8 py-8 space-y-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label={t("statTotal")} value={notes.length} color="navy" />
          <StatCard label="Open" value={totalOpen} color="red" />
          <StatCard label={t("statAcknowledgedByHr")} value={totalAcknowledged} color="blue" />
          <StatCard label={t("statDone")} value={totalResolved} color="green" />
        </div>

        <div className="rounded-xl border border-teal-200 bg-white shadow-sm overflow-hidden">
          <SpecialNotesTable
            data={notes as NoteRow[]}
            extensionRequestOptions={extensionRequestOptions}
            myDivision={myDivision}
            userName={userName}
          />
        </div>
      </main>
    </div>
  );
}
