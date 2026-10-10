import { count, desc, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { crmClientActivities, crmClientContacts, crmClients, crmEmails } from "@/db/schema";
import { getAccountHistoryMap, getAccountStatsMap } from "@/lib/crm";
import type { Account, Activity, Contact } from "./account-model";

/** Everything the Account workspace shows, read the way V1's Account list and Account 360 pages read it. */
export async function loadAccountWorkspace(): Promise<Account[]> {
  const rows = await db.select().from(crmClients).orderBy(desc(crmClients.created_at));
  const names = rows.map((r) => r.name);
  const [stats, history, contactRows, activityRows, emailCounts] = await Promise.all([
    getAccountStatsMap(names),
    getAccountHistoryMap(names),
    db.select().from(crmClientContacts).orderBy(desc(crmClientContacts.is_primary), crmClientContacts.created_at),
    db.select().from(crmClientActivities).orderBy(desc(crmClientActivities.activity_date), desc(crmClientActivities.created_at)),
    db.select({ clientId: crmEmails.client_id, n: count() }).from(crmEmails).where(isNotNull(crmEmails.client_id)).groupBy(crmEmails.client_id),
  ]);
  const emails = new Map(emailCounts.map((e) => [e.clientId!, e.n]));

  const contacts = new Map<string, Contact[]>();
  const contactName = new Map<string, string>();
  for (const c of contactRows) {
    contactName.set(c.id, c.name);
    const list = contacts.get(c.client_id) ?? [];
    list.push({ id: c.id, name: c.name, role: c.role_title, email: c.email, phone: c.phone, primary: c.is_primary });
    contacts.set(c.client_id, list);
  }
  const activities = new Map<string, Activity[]>();
  for (const a of activityRows) {
    const list = activities.get(a.client_id) ?? [];
    list.push({ id: a.id, type: a.type_code, title: a.title, description: a.description, date: a.activity_date, contact: a.contact_id ? contactName.get(a.contact_id) ?? null : null, by: a.created_by_name });
    activities.set(a.client_id, list);
  }

  return rows.map((r) => {
    const s = stats.get(r.name);
    return {
      id: r.id,
      name: r.name,
      industry: r.industry,
      status: r.status_code,
      notes: r.notes,
      createdBy: r.created_by_name,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
      leads: s?.leadCount ?? 0,
      opportunities: s?.opportunityCount ?? 0,
      activeOpportunities: s?.activeOpportunityCount ?? 0,
      contracts: s?.contractCount ?? 0,
      monthlyValue: s?.monthlyContractValue ?? 0,
      invoices: s?.invoiceCount ?? 0,
      overdueInvoices: s?.overdueInvoiceCount ?? 0,
      contacts: contacts.get(r.id) ?? [],
      activities: activities.get(r.id) ?? [],
      emails: emails.get(r.id) ?? 0,
      history: history.get(r.name) ?? { leads: [], opportunities: [], contracts: [], invoices: [] },
    };
  });
}
