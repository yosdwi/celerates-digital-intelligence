import { calculatePph21Ter } from "./ter-tax-table";

/**
 * Rumus disalin dari TEMPLATE COGS (TALENT & CANDIDATE).xlsx, sheet
 * "COGS & SALARY" + "COGS & SALARY (TAX)". Default rate di bawah ini persis
 * angka yang dipakai di template (baris asumsi/row 6 & row 1 tiap sheet) --
 * semuanya tetap bisa dioverride dari form kalkulator.
 */
export const COGS_DEFAULTS = {
  bpjsKesehatanCompanyRate: 0.04,
  bpjsKesehatanCompanyCap: 12_000_000,
  jkkRate: 0.001,
  jkmRate: 0.002,
  jhtCompanyRate: 0.037,
  jkpRate: 0.0024,
  jpCompanyRate: 0.02,
  jpCompanyCap: 11_086_300,
  bpjsKesehatanEmployeeRate: 0.01,
  jhtEmployeeRate: 0.02,
  jpEmployeeRate: 0.01,
  overheadRate: 0.15,
  komisiSalesRate: 0.018, // dari Price, dipakai kalau opsi "auto" dicentang
  annualMedicalReimbursementPkwttRate: 0.8, // dari Basic Salary, cuma buat PKWTT
} as const;

export type CogsInput = {
  ptkpCode: string;
  price: number;
  basicSalary: number;
  functionalAllowance: number;
  transportAllowance: number;
  projectAllowance: number;
  accommodationAllowance: number;
  fieldAllowance: number;
  overtimeAllowance: number;
  // Other component (dijumlah lalu dirata-rata /12 buat jadi biaya bulanan)
  komisiSales: number;
  makanMalam: number;
  kompensasiShiftMalam: number;
  seragam: number;
  mcu: number;
  lainnya: number;
  kompensasi: number;
  thrAllocation: number;
  annualBonusAllocation: number;
  annualMedicalReimbursement: number;
  laptopOwnership: number;
  training: number;
  refreshment: number;
  // Rate BPJS & overhead -- default dari COGS_DEFAULTS, bisa dioverride
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
};

export type CogsResult = {
  grossSalary: number;
  avgOtherMonthlyCost: number;
  bpjsCompany: { kesehatan: number; jkk: number; jkm: number; jht: number; jkp: number; jp: number; total: number };
  bpjsEmployee: { kesehatan: number; jht: number; jp: number; total: number };
  pajakBruto: number;
  terCategory: "A" | "B" | "C" | null;
  terRate: number;
  pph21: number;
  takeHomePay: number;
  monthlyRemunerationCost: number;
  overheadAllocation: number;
  totalCogs: number;
  grossMargin: number;
  marginPercent: number;
};

export function calculateCogs(input: CogsInput): CogsResult {
  const grossSalary =
    input.basicSalary + input.functionalAllowance + input.transportAllowance +
    input.projectAllowance + input.accommodationAllowance + input.fieldAllowance + input.overtimeAllowance;

  const avgOtherMonthlyCost = (
    input.komisiSales + input.makanMalam + input.kompensasiShiftMalam + input.seragam + input.mcu + input.lainnya +
    input.kompensasi + input.thrAllocation + input.annualBonusAllocation + input.annualMedicalReimbursement +
    input.laptopOwnership + input.training + input.refreshment
  ) / 12;

  const bpjsKesehatanCompany = Math.min(input.basicSalary, input.bpjsKesehatanCompanyCap) * input.bpjsKesehatanCompanyRate;
  const jkk = input.basicSalary * input.jkkRate;
  const jkm = input.basicSalary * input.jkmRate;
  const jhtCompany = input.basicSalary * input.jhtCompanyRate;
  const jkp = input.basicSalary * input.jkpRate;
  const jpCompany = Math.min(input.basicSalary, input.jpCompanyCap) * input.jpCompanyRate;
  const bpjsCompanyTotal = bpjsKesehatanCompany + jkk + jkm + jkp + jhtCompany + jpCompany;

  const bpjsKesehatanEmployee = input.basicSalary * input.bpjsKesehatanEmployeeRate;
  const jhtEmployee = input.basicSalary * input.jhtEmployeeRate;
  const jpEmployee = input.basicSalary * input.jpEmployeeRate;
  const bpjsEmployeeTotal = bpjsKesehatanEmployee + jhtEmployee + jpEmployee;

  const pajakBruto = grossSalary + bpjsCompanyTotal;
  const { category: terCategory, rate: terRate, pph21 } = calculatePph21Ter(input.ptkpCode, pajakBruto);

  const takeHomePay = grossSalary - bpjsEmployeeTotal - pph21;

  const monthlyRemunerationCost = bpjsCompanyTotal + avgOtherMonthlyCost + grossSalary;
  const overheadAllocation = monthlyRemunerationCost * input.overheadRate;
  const totalCogs = monthlyRemunerationCost + overheadAllocation;

  const grossMargin = input.price - totalCogs;
  const marginPercent = input.price ? (grossMargin / input.price) * 100 : 0;

  return {
    grossSalary,
    avgOtherMonthlyCost,
    bpjsCompany: { kesehatan: bpjsKesehatanCompany, jkk, jkm, jht: jhtCompany, jkp, jp: jpCompany, total: bpjsCompanyTotal },
    bpjsEmployee: { kesehatan: bpjsKesehatanEmployee, jht: jhtEmployee, jp: jpEmployee, total: bpjsEmployeeTotal },
    pajakBruto,
    terCategory,
    terRate,
    pph21,
    takeHomePay,
    monthlyRemunerationCost,
    overheadAllocation,
    totalCogs,
    grossMargin,
    marginPercent,
  };
}
