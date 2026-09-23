import { db } from "@/db";
import { leads, opportunities, projectContracts, projectInvoices } from "@/db/schema";
import { inArray } from "drizzle-orm";

export type AccountStats = {
  leadCount: number;
  opportunityCount: number;
  activeOpportunityCount: number;
  contractCount: number;
  monthlyContractValue: number;
  invoiceCount: number;
  overdueInvoiceCount: number;
};

function emptyStats(): AccountStats {
  return { leadCount: 0, opportunityCount: 0, activeOpportunityCount: 0, contractCount: 0, monthlyContractValue: 0, invoiceCount: 0, overdueInvoiceCount: 0 };
}

/**
 * Agregat leads/opportunity/contract/invoice per nama klien -- dicocokkan by
 * client_name (exact match teks), BUKAN foreign key, supaya tabel-tabel yang
 * sudah ada (leads, opportunities, project_contracts, project_invoices) tidak
 * perlu diubah sama sekali untuk fitur Account/CRM ini.
 */
export async function getAccountStatsMap(clientNames: string[]): Promise<Map<string, AccountStats>> {
  const map = new Map<string, AccountStats>();
  if (clientNames.length === 0) return map;
  for (const name of clientNames) map.set(name, emptyStats());

  const [leadRows, optyRows] = await Promise.all([
    db.select({ client_name: leads.client_name }).from(leads).where(inArray(leads.client_name, clientNames)),
    db.select().from(opportunities).where(inArray(opportunities.client_name, clientNames)),
  ]);

  for (const r of leadRows) {
    const s = map.get(r.client_name);
    if (s) s.leadCount++;
  }

  const optyIdToClient = new Map<string, string>();
  for (const o of optyRows) {
    const s = map.get(o.client_name);
    if (s) {
      s.opportunityCount++;
      if (o.pipeline_stage_code === "on_going") s.activeOpportunityCount++;
    }
    optyIdToClient.set(o.id, o.client_name);
  }

  const optyIds = optyRows.map((o) => o.id);
  if (optyIds.length > 0) {
    const [contractRows, invoiceRows] = await Promise.all([
      db.select().from(projectContracts).where(inArray(projectContracts.opportunity_id, optyIds)),
      db.select().from(projectInvoices).where(inArray(projectInvoices.opportunity_id, optyIds)),
    ]);
    for (const c of contractRows) {
      const clientName = optyIdToClient.get(c.opportunity_id);
      const s = clientName ? map.get(clientName) : undefined;
      if (s) {
        s.contractCount++;
        s.monthlyContractValue += c.monthly_value_amount ?? 0;
      }
    }
    for (const inv of invoiceRows) {
      const clientName = optyIdToClient.get(inv.opportunity_id);
      const s = clientName ? map.get(clientName) : undefined;
      if (s) {
        s.invoiceCount++;
        if (inv.status_code === "overdue") s.overdueInvoiceCount++;
      }
    }
  }

  return map;
}

export type RelatedHistory = {
  leads: { id: string; lead_no: string; project_name: string | null; is_qualified: boolean | null }[];
  opportunities: { id: string; opty_no: string; price_amount: number | null; price_period_code: string | null; pipeline_stage_code: string }[];
  contracts: { id: string; contract_duration_months: number | null; start_date: string | null; end_date: string | null }[];
  invoices: { id: string; group_name: string | null; price_per_month: number | null; status_code: string | null }[];
};

/** Riwayat lengkap (bukan cuma hitungan) buat halaman Account 360 satu klien. */
export async function getAccountHistory(clientName: string): Promise<RelatedHistory> {
  const [leadRows, optyRows] = await Promise.all([
    db.select({ id: leads.id, lead_no: leads.lead_no, project_name: leads.project_name, is_qualified: leads.is_qualified }).from(leads).where(inArray(leads.client_name, [clientName])),
    db.select().from(opportunities).where(inArray(opportunities.client_name, [clientName])),
  ]);

  const optyIds = optyRows.map((o) => o.id);
  const [contractRows, invoiceRows] = optyIds.length > 0
    ? await Promise.all([
        db.select().from(projectContracts).where(inArray(projectContracts.opportunity_id, optyIds)),
        db.select().from(projectInvoices).where(inArray(projectInvoices.opportunity_id, optyIds)),
      ])
    : [[], []];

  return {
    leads: leadRows,
    opportunities: optyRows.map((o) => ({ id: o.id, opty_no: o.opty_no, price_amount: o.price_amount, price_period_code: o.price_period_code, pipeline_stage_code: o.pipeline_stage_code })),
    contracts: contractRows.map((c) => ({ id: c.id, contract_duration_months: c.contract_duration_months, start_date: c.start_date, end_date: c.end_date })),
    invoices: invoiceRows.map((i) => ({ id: i.id, group_name: i.group_name, price_per_month: i.price_per_month, status_code: i.status_code })),
  };
}
