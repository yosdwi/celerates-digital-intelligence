import { db } from "@/db";
import { employees, employmentContracts, bpjsRegistrations, onboardingRequests, candidates, talentAssignments, requisitions } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { decryptPII } from "@/lib/pii-crypto";
import { getDocumentUrl } from "@/lib/storage";
import { AddContractForm } from "./add-contract-form";
import { BpjsRow } from "./bpjs-row";
import { SalaryHistory } from "@/components/salary-history";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { User } from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function EmployeeProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations("hr.profile");
  const { id } = await params;
  const [[employee], contracts, bpjsList, salaryRows] = await Promise.all([
    db.select().from(employees).where(eq(employees.id, id)),
    db.select().from(employmentContracts).where(eq(employmentContracts.employee_id, id)).orderBy(desc(employmentContracts.start_date)),
    db.select().from(bpjsRegistrations).where(eq(bpjsRegistrations.employee_id, id)),
    db
      .select({
        id: talentAssignments.id,
        clientName: requisitions.client_name,
        positionName: requisitions.position_name,
        startDate: talentAssignments.start_date,
        endDate: talentAssignments.end_date,
        statusCode: talentAssignments.status_code,
        basicSalary: talentAssignments.basic_salary_amount,
        functionalAllowance: talentAssignments.functional_allowance_amount,
        transportAllowance: talentAssignments.transport_allowance_amount,
        projectAllowance: talentAssignments.project_allowance_amount,
        accommodationAllowance: talentAssignments.accommodation_allowance_amount,
        fieldAllowance: talentAssignments.field_allowance_amount,
        overtimeAllowance: talentAssignments.overtime_allowance_amount,
        priceAmount: talentAssignments.price_amount,
      })
      .from(talentAssignments)
      .leftJoin(requisitions, eq(talentAssignments.requisition_id, requisitions.id))
      .where(eq(talentAssignments.employee_id, id)),
  ]);
  if (!employee) notFound();

  const [onboarding] = employee.onboarding_request_id
    ? await db.select().from(onboardingRequests).where(eq(onboardingRequests.id, employee.onboarding_request_id))
    : [undefined];

  const [candidate] = onboarding?.candidate_id
    ? await db.select().from(candidates).where(eq(candidates.id, onboarding.candidate_id))
    : [undefined];

  // 8 dokumen onboarding (path tersimpan langsung di kolom onboarding_requests,
  // BUKAN lewat tabel attachments polymorphic) -- generate signed URL masing-masing.
  const ONBOARDING_DOCS: { label: string; path: string | null | undefined }[] = onboarding ? [
    { label: "KTP", path: onboarding.ktp_file_path },
    { label: "BPJS Kesehatan", path: onboarding.bpjs_kesehatan_file_path },
    { label: "BPJS Ketenagakerjaan", path: onboarding.bpjs_ketenagakerjaan_file_path },
    { label: "NPWP", path: onboarding.npwp_file_path },
    { label: "Kartu Keluarga", path: onboarding.kk_file_path },
    { label: "Ijazah", path: onboarding.diploma_file_path },
    { label: "Sertifikat", path: onboarding.certification_file_path },
    { label: "Foto Formal", path: onboarding.formal_photo_file_path },
  ] : [];
  const onboardingDocUrls = await Promise.all(
    ONBOARDING_DOCS.map((d) => (d.path ? getDocumentUrl(d.path) : Promise.resolve(null)))
  );

  // Turunan -- dihitung di sini, tidak disimpan di database.
  const latestContract = contracts[0];
  // Masa kerja dihitung dari kontrak PERTAMA (bukan employees.join_date), karena
  // join_date diisi dari tanggal mulai rencana di form onboarding -- kalau
  // tanggalnya di masa depan (karyawan belum benar-benar mulai), join_date bisa
  // bikin masa kerja jadi negatif.
  const earliestContractStart = contracts.reduce<Date | null>((earliest, c) => {
    const start = new Date(c.start_date);
    return earliest == null || start < earliest ? start : earliest;
  }, null);
  const belumMulaiBekerja = earliestContractStart != null && earliestContractStart.getTime() > Date.now();
  const totalMasaKerjaBulan = earliestContractStart != null && !belumMulaiBekerja
    ? monthsBetween(earliestContractStart, new Date())
    : null;
  const sisaHariKontrak = latestContract?.end_date
    ? Math.floor((new Date(latestContract.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const endTime = latestContract?.end_date ? new Date(latestContract.end_date).getTime() : null;
  const contractStatus: "aktif" | "akan_habis" | "sudah_habis" | null =
    endTime == null ? null
    : endTime < Date.now() ? "sudah_habis"
    : endTime - Date.now() <= 30 * 24 * 60 * 60 * 1000 ? "akan_habis"
    : "aktif";
  const CONTRACT_STATUS_LABEL: Record<"aktif" | "akan_habis" | "sudah_habis", string> = {
    aktif: t("contractStatusActive"),
    akan_habis: t("contractStatusExpiringSoon"),
    sudah_habis: t("contractStatusExpired"),
  };
  const CONTRACT_STATUS_CLASS: Record<"aktif" | "akan_habis" | "sudah_habis", string> = {
    aktif: "text-green-600",
    akan_habis: "text-amber-600",
    sudah_habis: "text-red-600",
  };

  return (
    <div className="min-h-screen">
      <PageHeader icon={User} color="bg-rose-500" eyebrow="Human Resources" title={candidate?.candidate_name ?? "-"} subtitle={employee.employee_no}>
        <Link href="/hr" className="text-sm font-medium text-rose-700 hover:underline">&larr; {t("backToEmployeeList")}</Link>
      </PageHeader>

      <main className="px-8 py-8 space-y-6 max-w-5xl mx-auto">
        {/* Ringkasan turunan */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Stat
            label={t("statTotalTenure")}
            value={belumMulaiBekerja ? t("notStartedWorking") : totalMasaKerjaBulan != null ? t("monthsValue", { count: totalMasaKerjaBulan }) : "-"}
          />
          <Stat
            label={t("statContractDaysLeft")}
            value={sisaHariKontrak != null ? t("daysValue", { count: sisaHariKontrak }) : "-"}
            valueClassName={contractStatus ? CONTRACT_STATUS_CLASS[contractStatus] : "text-slate-900"}
          />
          <Stat
            label={t("statContractStatus")}
            value={contractStatus ? CONTRACT_STATUS_LABEL[contractStatus] : "-"}
            valueClassName={contractStatus ? CONTRACT_STATUS_CLASS[contractStatus] : "text-slate-900"}
          />
        </section>

        {/* Data pribadi -- ditarik dari onboarding, tidak diketik ulang */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">{t("personalDataTitle")}</h2>
            {employee.onboarding_request_id && (
                <Link
                href={`/hr/${id}/edit-personal`}
                className="text-xs font-medium text-brand-600 hover:underline"
                >
                {t("editPersonalData")}
                </Link>
            )}
            </div>
          {onboarding ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <Info label={t("nik")} value={decryptPII(onboarding.nik)} />
              <Info label={t("birthPlaceDate")} value={`${onboarding.birth_place ?? "-"}, ${onboarding.birth_date ?? "-"}`} />
              <Info label={t("personalEmail")} value={onboarding.personal_email} />
              <Info label={t("phoneNumber")} value={onboarding.personal_phone} />
              <Info label={t("idCardAddress")} value={onboarding.id_card_address} />
              <Info label={t("currentAddress")} value={onboarding.current_address} />
              <Info label={t("npwp")} value={decryptPII(onboarding.npwp)} />
              <Info label={t("familyCardNo")} value={decryptPII(onboarding.family_card_no)} />
              <Info label={t("bank")} value={onboarding.bank_name} />
              <Info label={t("bankAccountNo")} value={decryptPII(onboarding.bank_account_no)} />
              <Info label={t("emergencyContact")} value={`${onboarding.emergency_contact_name ?? "-"} (${onboarding.emergency_contact_relationship ?? "-"})`} />
              <Info label={t("education")} value={`${onboarding.education_level_code ?? "-"} - ${onboarding.institution_name ?? "-"}`} />
            </div>
          ) : (
            <p className="text-sm text-slate-400">{t("onboardingDataNotFound")}</p>
          )}
        </section>

        {/* Info proses onboarding & dokumen -- ditarik dari TA Onboarding, bukan diketik ulang di HR */}
        {onboarding && (
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Info Proses Onboarding</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <Info label="TA PIC" value={onboarding.ta_pic_name} />
              <Info label="Status Karyawan" value={onboarding.employee_status_code} />
              <Info label="Perlu Laptop" value={onboarding.needs_laptop ? "Ya" : "Tidak"} />
              <Info label="Perlu ID Card" value={onboarding.needs_id_card ? "Ya" : "Tidak"} />
            </div>

            <h3 className="text-xs font-semibold text-slate-500 uppercase mt-6 mb-3">Dokumen Onboarding</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {ONBOARDING_DOCS.map((doc, i) => (
                <div key={doc.label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                  <p className="text-slate-500 mb-1">{doc.label}</p>
                  {onboardingDocUrls[i] ? (
                    <a href={onboardingDocUrls[i]!} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline font-medium">Lihat</a>
                  ) : (
                    <span className="text-slate-300">-</span>
                  )}
                </div>
              ))}
            </div>

            <h3 className="text-xs font-semibold text-slate-500 uppercase mt-6 mb-3">Kompensasi Saat Onboarding (referensi)</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <Info label="Price" value={onboarding.price_amount != null ? `Rp ${onboarding.price_amount.toLocaleString("id-ID")}` : null} />
              <Info label="Basic Salary" value={onboarding.basic_salary_amount != null ? `Rp ${onboarding.basic_salary_amount.toLocaleString("id-ID")}` : null} />
              <Info label="Functional Allowance" value={onboarding.functional_allowance_amount != null ? `Rp ${onboarding.functional_allowance_amount.toLocaleString("id-ID")}` : null} />
              <Info label="Transport Allowance" value={onboarding.transport_allowance_amount != null ? `Rp ${onboarding.transport_allowance_amount.toLocaleString("id-ID")}` : null} />
              <Info label="Project Allowance" value={onboarding.project_allowance_amount != null ? `Rp ${onboarding.project_allowance_amount.toLocaleString("id-ID")}` : null} />
              <Info label="Accommodation Allowance" value={onboarding.accommodation_allowance_amount != null ? `Rp ${onboarding.accommodation_allowance_amount.toLocaleString("id-ID")}` : null} />
              <Info label="Field Allowance" value={onboarding.field_allowance_amount != null ? `Rp ${onboarding.field_allowance_amount.toLocaleString("id-ID")}` : null} />
              <Info label="Overtime Allowance" value={onboarding.overtime_allowance_amount != null ? `Rp ${onboarding.overtime_allowance_amount.toLocaleString("id-ID")}` : null} />
            </div>
            <p className="mt-3 text-xs text-slate-400">Angka di atas adalah data SAAT onboarding (bisa beda dari data Talent Assignment terkini di bawah).</p>
          </section>
        )}

        <SalaryHistory periods={salaryRows} title={t("salaryHistoryTitle")} />

        {/* Riwayat kontrak */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">{t("contractHistoryTitle")}</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {contracts.map((c) => (
              <div key={c.id} className="px-6 py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-slate-900">
                    {c.contract_no} {c.addendum_seq ? <span className="text-xs text-slate-500">({t("addendumNo", { n: c.addendum_seq })})</span> : <span className="text-xs text-slate-500">({t("parentContract")})</span>}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {c.employment_type_code.toUpperCase()} &middot; {c.start_date} {t("until")} {c.end_date ?? t("noLimit")}
                    {c.end_date && ` (${t("monthsValue", { count: Math.round((new Date(c.end_date).getTime() - new Date(c.start_date).getTime()) / (1000 * 60 * 60 * 24 * 30)) })})`}
                    {c.sk_no && ` · ${t("skNumber")}: ${c.sk_no}`}
                    </p>
                </div>
              </div>
            ))}
            {contracts.length === 0 && (
              <p className="px-6 py-10 text-center text-slate-400 text-sm">{t("noContractsYet")}</p>
            )}
          </div>
          <div className="px-6 py-4 border-t border-slate-100">
            <AddContractForm employeeId={id} existingContracts={contracts.map((c) => ({ id: c.id, contract_no: c.contract_no }))} />
          </div>
        </section>

        {/* Status BPJS */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">{t("bpjsStatusTitle")}</h2>
          {bpjsList.map((b) => (
            <BpjsRow key={b.id} bpjs={b} employeeId={id} />
          ))}
        </section>
      </main>
    </div>
  );
}

/** Selisih dua tanggal dalam bulan penuh (bukan days/30 yang gampang drift). */
function monthsBetween(from: Date, to: Date): number {
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months--;
  return Math.max(0, months);
}

function Stat({ label, value, valueClassName = "text-slate-900" }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-lg font-semibold mt-0.5 ${valueClassName}`}>{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-slate-900 mt-0.5">{value ?? "-"}</p>
    </div>
  );
}