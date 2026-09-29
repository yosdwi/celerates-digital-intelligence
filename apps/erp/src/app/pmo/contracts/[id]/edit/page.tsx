import { db } from "@/db";
import { projectContracts, opportunities } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { updateProjectContract } from "../../../actions";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Pencil } from "lucide-react";
import { EditContractForm } from "./edit-contract-form";

export default async function EditContractPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations("pmo.contracts.editPage");
  const { id } = await params;
  const [contract] = await db.select().from(projectContracts).where(eq(projectContracts.id, id));
  if (!contract) notFound();

  const [opty] = await db.select().from(opportunities).where(eq(opportunities.id, contract.opportunity_id));

  const updateWithId = updateProjectContract.bind(null, id);

  return (
    <div className="min-h-screen">
      <PageHeader icon={Pencil} color="bg-violet-500" eyebrow="PMO" title={t("title", { client: opty?.client_name ?? "-" })}>
        <Link href="/pmo/contracts" className="text-sm font-medium text-violet-700 hover:underline">&larr; {t("backToContractList")}</Link>
      </PageHeader>

      <main className="px-8 py-8 max-w-3xl mx-auto">
        <EditContractForm
          action={updateWithId}
          defaultMonthlyValue={contract.monthly_value_amount?.toString() ?? ""}
          defaultStartDate={contract.start_date ?? ""}
          defaultEndDate={contract.end_date ?? ""}
          defaultSalesType={contract.sales_type_code ?? ""}
          defaultNotes={contract.notes ?? ""}
          backHref="/pmo/contracts"
        />
      </main>
    </div>
  );
}
