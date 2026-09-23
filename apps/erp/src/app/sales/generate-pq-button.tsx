"use client";
import { useTranslations } from "next-intl";

const SERVICE_ABBR: Record<string, string> = {
  outsourcing: "OS", headhunting: "HH", outplacement: "OP", managed_service: "MS",
  project_based: "PB", rpo: "RPO", training: "TR", license: "LC", hardware: "HW",
};
const BU_ABBR: Record<string, string> = { tm: "TM", cs: "CS", solution: "SOL", other: "OTH" };
const ROMANS = ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII"];

type ClientOption = { name: string; code: string };

export function GeneratePqButton({ suggestedSeq, clients }: { suggestedSeq: number; clients: ClientOption[] }) {
  const t = useTranslations("sales.pqTracker");
  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    const form = e.currentTarget.closest("form");
    if (!form) return;

    const clientName = (form.elements.namedItem("client_name") as HTMLInputElement)?.value ?? "";
    const businessUnit = (form.elements.namedItem("business_unit_code") as HTMLSelectElement)?.value ?? "";
    const serviceType = (form.elements.namedItem("service_type_code") as HTMLSelectElement)?.value ?? "";
    const approvalDate = (form.elements.namedItem("approval_date") as HTMLInputElement)?.value ?? "";
    const pqInput = form.elements.namedItem("pq_no") as HTMLInputElement;
    if (!pqInput) return;

    const matched = clients.find((c) => c.name.trim().toLowerCase() === clientName.trim().toLowerCase());
    const clientCode = matched?.code ?? (clientName.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 10) || "CLIENT");

    const buAbbr = BU_ABBR[businessUnit] ?? (businessUnit || "GEN").toUpperCase();
    const svcAbbr = SERVICE_ABBR[serviceType] ?? (serviceType || "SVC").toUpperCase();

    const date = approvalDate ? new Date(approvalDate) : new Date();
    const roman = ROMANS[date.getMonth()];
    const year = date.getFullYear();

    pqInput.value = `PQ - #${suggestedSeq}-QUO/${clientCode}${buAbbr}${svcAbbr}/${roman}-${year}`;
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="mt-1 text-xs font-medium text-brand-600 hover:underline"
    >
      ⚡ {t("generateAuto")}
    </button>
  );
}