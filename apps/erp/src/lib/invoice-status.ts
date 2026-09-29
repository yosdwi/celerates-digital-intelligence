import { sql } from "drizzle-orm";
import { derivedSubmissionOverdue } from "./operations/invoice-rule";
import { projectInvoices } from "@/db/schema";
/** Existing submission rule, made independent of page visits and server timezone.
 * Explicit statuses remain authoritative; no payment/collection claim is made. */
export function invoiceStatusExpression(asOf = new Date()) {
  const predicate = derivedSubmissionOverdue(
    "project_invoices.status_code",
    "project_invoices.services_month_start",
    "clock.as_of",
  );
  return sql<
    string | null
  >`(SELECT CASE WHEN ${sql.raw(predicate)} THEN 'overdue' ELSE ${projectInvoices.status_code} END FROM (SELECT ${asOf.toISOString()}::timestamptz AS as_of) clock)`;
}
