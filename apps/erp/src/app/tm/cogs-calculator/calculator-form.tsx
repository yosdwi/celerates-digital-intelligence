"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SearchableSelect } from "@/components/searchable-select";
import { calculateCogs, COGS_DEFAULTS, type CogsInput } from "@/lib/cogs-calculator";
import { PTKP_OPTIONS } from "@/lib/ter-tax-table";
import { formatThousands, stripThousands } from "@/lib/money-format";
import { applyCogsToTalentAssignment } from "./actions";
import { useToast } from "@/components/toast-provider";
import { useTranslations } from "next-intl";

type TalentOption = {
  id: string;
  employee_no: string | null;
  candidate_no: string | null;
  candidate_name: string | null;
  client_name: string | null;
  ptkp_code: string | null;
  price_amount: number | null;
  basic_salary_amount: number | null;
  functional_allowance_amount: number | null;
  transport_allowance_amount: number | null;
  project_allowance_amount: number | null;
  accommodation_allowance_amount: number | null;
  field_allowance_amount: number | null;
  overtime_allowance_amount: number | null;
  employment_type_code: string | null;
};

const NUMBER_FIELD_KEYS = [
  "price", "basicSalary", "functionalAllowance", "transportAllowance", "projectAllowance",
  "accommodationAllowance", "fieldAllowance", "overtimeAllowance",
  "makanMalam", "kompensasiShiftMalam", "seragam", "mcu", "lainnya",
  "annualBonusAllocation", "annualMedicalReimbursement",
  "laptopOwnership", "training", "refreshment",
] as const;
type NumberFieldKey = (typeof NUMBER_FIELD_KEYS)[number];

const EMPTY_NUMBERS: Record<NumberFieldKey, number> = Object.fromEntries(NUMBER_FIELD_KEYS.map((k) => [k, 0])) as Record<NumberFieldKey, number>;

// Laptop Ownership Program, Training, dan Refreshment defaultnya nominal tetap
// kebijakan perusahaan (bukan hasil rumus), dipakai baik saat kalkulator kosong
// maupun saat pilih talent -- tetap bisa diedit manual.
const DEFAULT_NUMBERS: Record<NumberFieldKey, number> = {
  ...EMPTY_NUMBERS,
  laptopOwnership: 3_000_000,
  training: 3_000_000,
  refreshment: 1_500_000,
};

function rp(n: number): string {
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`;
}

export function CogsCalculatorForm({ talentOptions, initialSelectedId }: { talentOptions: TalentOption[]; initialSelectedId?: string }) {
  const t = useTranslations("tm.cogsCalculator");
  const router = useRouter();
  const { showToast } = useToast();
  const [selectedId, setSelectedId] = useState("");
  const [ptkpCode, setPtkpCode] = useState<string>("TK/0");
  const [numbers, setNumbers] = useState<Record<NumberFieldKey, number>>(DEFAULT_NUMBERS);
  const [rates, setRates] = useState<{
    bpjsKesehatanCompanyRate: number;
    bpjsKesehatanCompanyCap: number;
    jkkRate: number;
    jkmRate: number;
    jhtCompanyRate: number;
    jkpRate: number;
    jpCompanyRate: number;
    jpCompanyCap: number;
    bpjsKesehatanEmployeeRate: number;
    jhtEmployeeRate: number;
    jpEmployeeRate: number;
    overheadRate: number;
  }>({
    bpjsKesehatanCompanyRate: COGS_DEFAULTS.bpjsKesehatanCompanyRate,
    bpjsKesehatanCompanyCap: COGS_DEFAULTS.bpjsKesehatanCompanyCap,
    jkkRate: COGS_DEFAULTS.jkkRate,
    jkmRate: COGS_DEFAULTS.jkmRate,
    jhtCompanyRate: COGS_DEFAULTS.jhtCompanyRate,
    jkpRate: COGS_DEFAULTS.jkpRate,
    jpCompanyRate: COGS_DEFAULTS.jpCompanyRate,
    jpCompanyCap: COGS_DEFAULTS.jpCompanyCap,
    bpjsKesehatanEmployeeRate: COGS_DEFAULTS.bpjsKesehatanEmployeeRate,
    jhtEmployeeRate: COGS_DEFAULTS.jhtEmployeeRate,
    jpEmployeeRate: COGS_DEFAULTS.jpEmployeeRate,
    overheadRate: COGS_DEFAULTS.overheadRate,
  });
  const [showRates, setShowRates] = useState(false);
  const [isApplying, startApplying] = useTransition();

  function setNumber(key: NumberFieldKey, value: string) {
    setNumbers((prev) => ({ ...prev, [key]: value ? Number(value) : 0 }));
  }

  // Setiap kali talent yang dipilih berganti (termasuk saat auto-select dari
  // query param ?talent_assignment_id=), tarik ulang data HR-nya dan isi ulang
  // semua field -- supaya nggak "nyangkut" ke data talent sebelumnya.
  function handleSelectTalent(id: string) {
    setSelectedId(id);
    const t = talentOptions.find((x) => x.id === id);
    if (!t) return;
    setPtkpCode(t.ptkp_code && PTKP_OPTIONS.includes(t.ptkp_code as any) ? t.ptkp_code : "TK/0");
    const basic = t.basic_salary_amount ?? 0;
    setNumbers({
      ...DEFAULT_NUMBERS,
      price: t.price_amount ?? 0,
      basicSalary: basic,
      functionalAllowance: t.functional_allowance_amount ?? 0,
      transportAllowance: t.transport_allowance_amount ?? 0,
      projectAllowance: t.project_allowance_amount ?? 0,
      accommodationAllowance: t.accommodation_allowance_amount ?? 0,
      fieldAllowance: t.field_allowance_amount ?? 0,
      overtimeAllowance: t.overtime_allowance_amount ?? 0,
      annualMedicalReimbursement: t.employment_type_code === "pkwtt" ? Math.round(basic * COGS_DEFAULTS.annualMedicalReimbursementPkwttRate) : 0,
    });
  }

  // Auto-select talent kalau halaman dibuka dari tombol "Hitung / Edit di
  // COGS Calculator" di form Edit Talent Assignment (?talent_assignment_id=...).
  useEffect(() => {
    if (initialSelectedId) handleSelectTalent(initialSelectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSelectedId]);

  const selected = talentOptions.find((t) => t.id === selectedId);
  // Komisi Sales, Kompensasi, dan THR Allocation adalah field formula di
  // Excel sumbernya (bukan input manual) -- selalu ngikutin Price/Basic
  // Salary saat ini, jadi tetap benar walau field-field itu diedit setelah
  // pilih talent.
  const komisiSales = Math.round(numbers.price * COGS_DEFAULTS.komisiSalesRate);
  const kompensasi = numbers.basicSalary;
  const thrAllocation = numbers.basicSalary;

  const input: CogsInput = useMemo(() => ({
    ptkpCode,
    price: numbers.price,
    basicSalary: numbers.basicSalary,
    functionalAllowance: numbers.functionalAllowance,
    transportAllowance: numbers.transportAllowance,
    projectAllowance: numbers.projectAllowance,
    accommodationAllowance: numbers.accommodationAllowance,
    fieldAllowance: numbers.fieldAllowance,
    overtimeAllowance: numbers.overtimeAllowance,
    komisiSales,
    makanMalam: numbers.makanMalam,
    kompensasiShiftMalam: numbers.kompensasiShiftMalam,
    seragam: numbers.seragam,
    mcu: numbers.mcu,
    lainnya: numbers.lainnya,
    kompensasi,
    thrAllocation,
    annualBonusAllocation: numbers.annualBonusAllocation,
    annualMedicalReimbursement: numbers.annualMedicalReimbursement,
    laptopOwnership: numbers.laptopOwnership,
    training: numbers.training,
    refreshment: numbers.refreshment,
    ...rates,
  }), [ptkpCode, numbers, komisiSales, kompensasi, thrAllocation, rates]);

  const result = useMemo(() => calculateCogs(input), [input]);

  function handleApply() {
    if (!selected) return;
    // Gross Salary/Take Home Pay itu TURUNAN dari Basic Salary + allowance --
    // kalau Basic Salary masih 0, hasil yang ditulis ke Talents Book juga 0,
    // padahal Price sudah keisi. Konfirmasi dulu supaya nggak ke-apply tanpa sadar.
    if (numbers.basicSalary === 0) {
      const proceed = window.confirm(t("confirmZeroBasicSalary"));
      if (!proceed) return;
    }
    startApplying(async () => {
      const managementFeeAmount = result.grossMargin;
      const res = await applyCogsToTalentAssignment({
        talentAssignmentId: selected.id,
        priceAmount: numbers.price,
        basicSalaryAmount: numbers.basicSalary,
        functionalAllowanceAmount: numbers.functionalAllowance,
        transportAllowanceAmount: numbers.transportAllowance,
        projectAllowanceAmount: numbers.projectAllowance,
        accommodationAllowanceAmount: numbers.accommodationAllowance,
        fieldAllowanceAmount: numbers.fieldAllowance,
        overtimeAllowanceAmount: numbers.overtimeAllowance,
        taxBrutoAmount: result.pajakBruto,
        grossSalaryAmount: result.grossSalary,
        takeHomePayAmount: result.takeHomePay,
        kompensasiAmount: kompensasi,
        thrAllowanceAmount: thrAllocation,
        annualBonusAllowanceAmount: numbers.annualBonusAllocation,
        annualMedicalReimbursementAmount: numbers.annualMedicalReimbursement,
        laptopOwnershipAmount: numbers.laptopOwnership,
        trainingAmount: numbers.training,
        refreshmentAmount: numbers.refreshment,
        bpjsKesehatanCompanyAmount: result.bpjsCompany.kesehatan,
        jkkAmount: result.bpjsCompany.jkk,
        jkmAmount: result.bpjsCompany.jkm,
        jhtCompanyAmount: result.bpjsCompany.jht,
        jkpAmount: result.bpjsCompany.jkp,
        jpCompanyAmount: result.bpjsCompany.jp,
        bpjsKesehatanEmployeeAmount: result.bpjsEmployee.kesehatan,
        jhtEmployeeAmount: result.bpjsEmployee.jht,
        jpEmployeeAmount: result.bpjsEmployee.jp,
        managementFeeAmount,
        totalCogsAmount: result.totalCogs,
      });
      if (!res.ok) {
        showToast(res.error, "error");
        return;
      }
      showToast(t("appliedToast"));
      // router.refresh() WAJIB di sini -- tanpa ini, Next.js App Router bisa
      // menampilkan cache client-side halaman Edit Talent Assignment yang
      // dikunjungi SEBELUM di-apply (Gross Salary/THP masih "Rp 0" lama),
      // walau data di server sudah revalidatePath dan benar ter-update.
      router.push(`/tm/${selected.id}/edit`);
      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <div className="lg:col-span-3 space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-700 mb-1">{t("selectTalent")} <span className="text-red-500">*</span></h2>
            <p className="text-xs text-slate-400 mb-2">{t("selectTalentHint")}</p>
            <SearchableSelect
              name="talent_lookup"
              value={selectedId}
              onChange={handleSelectTalent}
              placeholder={t("searchTalentPlaceholder")}
              required
              options={talentOptions.map((t) => ({
                value: t.id,
                label: t.candidate_name ?? "-",
                sublabel: `${t.employee_no ?? "-"} / ${t.candidate_no ?? "-"} ${t.client_name ? `- ${t.client_name}` : ""}`,
              }))}
            />
          </div>

          {selected && (
            <div className="rounded-lg border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-slate-700">
              <span className="text-slate-500">{t("currentlyOnProjectAt")}</span>{" "}
              <span className="font-semibold text-sky-800">{selected.client_name ?? t("noClientInfo")}</span>
            </div>
          )}

          {selected && (
            <div className="flex flex-wrap gap-4">
              <label className="block max-w-xs">
                <span className="mb-1 block text-sm font-medium text-slate-700">PTKP</span>
                <select value={ptkpCode} onChange={(e) => setPtkpCode(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  {PTKP_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <div className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">{t("employmentStatus")}</span>
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  {selected.employment_type_code ? selected.employment_type_code.toUpperCase() : "-"}
                </p>
              </div>
            </div>
          )}
        </section>

        {!selected && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
            {t("selectTalentToStart")}
          </div>
        )}

        {selected && (
        <>
        <FormSection title="Price & Fix Salary">
          <NumInput label="Price" value={numbers.price} onChange={(v) => setNumber("price", v)} />
          <NumInput label="Basic Salary" value={numbers.basicSalary} onChange={(v) => setNumber("basicSalary", v)} />
        </FormSection>

        <FormSection title={t("variableCostTitle")}>
          <NumInput label="Functional Allowance" value={numbers.functionalAllowance} onChange={(v) => setNumber("functionalAllowance", v)} />
          <NumInput label="Transport Allowance" value={numbers.transportAllowance} onChange={(v) => setNumber("transportAllowance", v)} />
          <NumInput label="Project Allowance" value={numbers.projectAllowance} onChange={(v) => setNumber("projectAllowance", v)} />
          <NumInput label="Accommodation Allowance" value={numbers.accommodationAllowance} onChange={(v) => setNumber("accommodationAllowance", v)} />
          <NumInput label={t("fieldAllowance")} value={numbers.fieldAllowance} onChange={(v) => setNumber("fieldAllowance", v)} />
          <NumInput label="Overtime" value={numbers.overtimeAllowance} onChange={(v) => setNumber("overtimeAllowance", v)} />
        </FormSection>

        <FormSection title={t("otherComponentTitle")}>
          <ComputedField label={t("salesCommission")} value={komisiSales} hint={t("salesCommissionHint")} />
          <NumInput label={t("dinnerAllowance")} value={numbers.makanMalam} onChange={(v) => setNumber("makanMalam", v)} />
          <NumInput label={t("nightShiftCompensation")} value={numbers.kompensasiShiftMalam} onChange={(v) => setNumber("kompensasiShiftMalam", v)} />
          <NumInput label={t("uniform")} value={numbers.seragam} onChange={(v) => setNumber("seragam", v)} />
          <NumInput label="MCU" value={numbers.mcu} onChange={(v) => setNumber("mcu", v)} />
          <NumInput label={t("other")} value={numbers.lainnya} onChange={(v) => setNumber("lainnya", v)} />
          <ComputedField label={t("compensation")} value={kompensasi} hint={t("basicSalaryFollowHint")} />
          <ComputedField label="THR Allocation" value={thrAllocation} hint={t("basicSalaryFollowHint")} />
          <NumInput label="Annual Bonus Allocation" value={numbers.annualBonusAllocation} onChange={(v) => setNumber("annualBonusAllocation", v)} />
          <NumInput label="Annual Medical Reimbursement" value={numbers.annualMedicalReimbursement} onChange={(v) => setNumber("annualMedicalReimbursement", v)} hint={t("annualMedicalReimbursementHint")} />
          <NumInput label="Laptop Ownership Program" value={numbers.laptopOwnership} onChange={(v) => setNumber("laptopOwnership", v)} />
          <NumInput label="Training" value={numbers.training} onChange={(v) => setNumber("training", v)} />
          <NumInput label="Refreshment" value={numbers.refreshment} onChange={(v) => setNumber("refreshment", v)} />
        </FormSection>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <button type="button" onClick={() => setShowRates((v) => !v)} className="w-full flex items-center justify-between px-6 py-4 text-left">
            <h2 className="text-sm font-semibold text-slate-700">Rate BPJS & Overhead (Advanced)</h2>
            <span className="text-xs text-brand-600">{showRates ? t("hide") : t("show")}</span>
          </button>
          {showRates && (
            <div className="space-y-5 px-6 pb-6">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t("companyPortionTitle")}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <RateInput label="BPJS Kesehatan (Company)" value={rates.bpjsKesehatanCompanyRate} onChange={(v) => setRates((p) => ({ ...p, bpjsKesehatanCompanyRate: v }))} />
                  <RateInput label="Cap Kesehatan (Company)" value={rates.bpjsKesehatanCompanyCap} onChange={(v) => setRates((p) => ({ ...p, bpjsKesehatanCompanyCap: v }))} isAmount />
                  <RateInput label="JKK" value={rates.jkkRate} onChange={(v) => setRates((p) => ({ ...p, jkkRate: v }))} />
                  <RateInput label="JKM" value={rates.jkmRate} onChange={(v) => setRates((p) => ({ ...p, jkmRate: v }))} />
                  <RateInput label="JHT (Company)" value={rates.jhtCompanyRate} onChange={(v) => setRates((p) => ({ ...p, jhtCompanyRate: v }))} />
                  <RateInput label="JKP" value={rates.jkpRate} onChange={(v) => setRates((p) => ({ ...p, jkpRate: v }))} />
                  <RateInput label="JP (Company)" value={rates.jpCompanyRate} onChange={(v) => setRates((p) => ({ ...p, jpCompanyRate: v }))} />
                  <RateInput label="Cap JP (Company)" value={rates.jpCompanyCap} onChange={(v) => setRates((p) => ({ ...p, jpCompanyCap: v }))} isAmount />
                </div>
              </div>
              <div className="border-t border-slate-100 pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t("employeePortionTitle")}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <RateInput label="BPJS Kesehatan (Employee)" value={rates.bpjsKesehatanEmployeeRate} onChange={(v) => setRates((p) => ({ ...p, bpjsKesehatanEmployeeRate: v }))} />
                  <RateInput label="JHT (Employee)" value={rates.jhtEmployeeRate} onChange={(v) => setRates((p) => ({ ...p, jhtEmployeeRate: v }))} />
                  <RateInput label="JP (Employee)" value={rates.jpEmployeeRate} onChange={(v) => setRates((p) => ({ ...p, jpEmployeeRate: v }))} />
                </div>
              </div>
              <div className="border-t border-slate-100 pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Overhead</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <RateInput label="Overhead Allocation" value={rates.overheadRate} onChange={(v) => setRates((p) => ({ ...p, overheadRate: v }))} />
                </div>
              </div>
            </div>
          )}
        </section>
        </>
        )}
      </div>

      {selected && (
      <div className="lg:col-span-2">
        <div className="sticky top-6 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="bg-sky-600 px-6 py-4">
            <h2 className="text-sm font-semibold text-white">{t("calculationResult")}</h2>
          </div>
          <div className="p-6 space-y-4">
            <ResultRow label="Gross Salary" value={rp(result.grossSalary)} />
            <ResultRow label="Average Other Monthly Cost" value={rp(result.avgOtherMonthlyCost)} />

            <div className="border-t border-slate-100 pt-3 space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">BPJS Company Portion</p>
              <ResultRow label="Total BPJS (Company)" value={rp(result.bpjsCompany.total)} strong />
            </div>

            <div className="border-t border-slate-100 pt-3 space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("taxSectionTitle")}</p>
              <ResultRow label={t("grossTax")} value={rp(result.pajakBruto)} />
              <ResultRow label={t("terCategory")} value={result.terCategory ? `TER ${result.terCategory} (${(result.terRate * 100).toFixed(2)}%)` : "-"} />
              <ResultRow label={t("pph21Payable")} value={rp(result.pph21)} />
            </div>

            <div className="border-t border-slate-100 pt-3 space-y-1.5">
              <ResultRow label="Total BPJS (Employee)" value={rp(result.bpjsEmployee.total)} />
              <ResultRow label="Take Home Pay (Nett)" value={rp(result.takeHomePay)} strong tone="green" />
            </div>

            <div className="border-t border-slate-100 pt-3 space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">COGS</p>
              <ResultRow label="Monthly Remuneration Cost" value={rp(result.monthlyRemunerationCost)} />
              <ResultRow label={`Overhead Allocation (${(rates.overheadRate * 100).toFixed(0)}%)`} value={rp(result.overheadAllocation)} />
              <ResultRow label="Total COGS" value={rp(result.totalCogs)} strong />
            </div>

            <div className="border-t border-slate-100 pt-3 space-y-1.5">
              <ResultRow label="Gross Margin (Price - COGS)" value={rp(result.grossMargin)} strong tone={result.grossMargin >= 0 ? "green" : "red"} />
              <ResultRow label="% Gross Margin" value={`${result.marginPercent.toFixed(2)}%`} strong tone={result.grossMargin >= 0 ? "green" : "red"} />
            </div>

            <div className="border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={handleApply}
                disabled={isApplying}
                className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
              >
                {isApplying ? t("applying") : t("applyButton")}
              </button>
              <p className="mt-2 text-xs text-slate-400">{t("applyHint", { employeeNo: selected.employee_no ?? "-" })}</p>
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold text-slate-700">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </section>
  );
}

function NumInput({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: string) => void; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        value={value ? formatThousands(value) : ""}
        onChange={(e) => onChange(stripThousands(e.target.value))}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
      />
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

function ComputedField({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <input
        type="text"
        readOnly
        value={rp(value)}
        className="w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
      />
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

function RateInput({ label, value, onChange, isAmount }: { label: string; value: number; onChange: (v: number) => void; isAmount?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-700">{label} {isAmount ? "(Rp)" : "(%)"}</span>
      {isAmount ? (
        <input
          type="text"
          inputMode="numeric"
          value={value ? formatThousands(value) : ""}
          onChange={(e) => onChange(Number(stripThousands(e.target.value)) || 0)}
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
        />
      ) : (
        <input
          type="number"
          step={0.0001}
          value={value * 100}
          onChange={(e) => onChange(Number(e.target.value) / 100)}
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
        />
      )}
    </label>
  );
}

function ResultRow({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "green" | "red" }) {
  const toneClass = tone === "green" ? "text-green-700" : tone === "red" ? "text-red-700" : "text-slate-900";
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={`${strong ? "font-semibold" : "font-medium"} ${toneClass}`}>{value}</span>
    </div>
  );
}
