import type { Sql } from "postgres";
/** Explicit PMO command only. Caller must authenticate and require PMO editor.
 * Locks target against simultaneous manual INSERT during reconciliation. No
 * uniqueness policy is imposed on historical/manual invoices after this command.
 */
export async function materializePmo(
  sql: Sql,
  kind: "invoices" | "documents",
  actor: { userId: string; userName: string },
) {
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(827341)`;
    let created: number;
    if (kind === "invoices") {
      await tx`LOCK TABLE project_invoices IN SHARE ROW EXCLUSIVE MODE`;
      const rows = await tx`
        INSERT INTO project_invoices (opportunity_id,services_month_start,price_per_month,status_code,invoice_plan_date)
        SELECT pc.opportunity_id,pmb.month,min(pmb.amount),'planned',pmb.month
        FROM project_monthly_billings pmb JOIN project_contracts pc ON pc.id=pmb.contract_id
        WHERE NOT EXISTS (SELECT 1 FROM project_invoices pi WHERE pi.opportunity_id=pc.opportunity_id AND pi.services_month_start=pmb.month)
        GROUP BY pc.opportunity_id,pmb.month HAVING count(*)=1 RETURNING id`;
      created = rows.length;
    } else {
      await tx`LOCK TABLE project_documents IN SHARE ROW EXCLUSIVE MODE`;
      const rows = await tx`
        INSERT INTO project_documents (opportunity_id,po_start_date,po_end_date,pq_price)
        SELECT DISTINCT o.id,o.start_date,o.end_date,o.price_amount FROM project_contracts pc JOIN opportunities o ON o.id=pc.opportunity_id
        WHERE NOT EXISTS (SELECT 1 FROM project_documents pd WHERE pd.opportunity_id=o.id) RETURNING id`;
      created = rows.length;
    }
    await tx`INSERT INTO activity_logs (division_key,action_type,entity_label,page_label,actor_user_id,actor_name)
      VALUES ('pmo','create',${`Siapkan ${kind}: ${created} baris dibuat; existing/ambigu tidak ditimpa`},'PMO preparation',${actor.userId},${actor.userName})`;
    return created;
  });
}
