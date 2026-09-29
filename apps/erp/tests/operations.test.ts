import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { readOperationalContext } from "../src/lib/operations/reader";
import { materializePmo } from "../src/lib/operations/materialize";
import { invoiceStatusExpression } from "../src/lib/invoice-status";
import { projectInvoices } from "../src/db/schema";
import {
  operationalContext,
  selectedModules,
  type OperationalActor,
} from "../src/lib/operations/policy";
const owner = { id: "owner", status: "active", isOwner: true };
const actor = (divisionKey: string, level = "viewer"): OperationalActor => ({
  id: "member",
  status: "active",
  accountType: "backoffice",
  access: [{ divisionKey, level }],
});
test("context and capabilities fail closed across every supported role", () => {
  assert.deepEqual(
    selectedModules(actor("sales"), operationalContext("/sales")),
    ["sales"],
  );
  for (const role of [
    "marketing",
    "sales",
    "ta",
    "hr",
    "tm",
    "pmo",
    "finance",
    "school",
    "automation",
  ]) {
    assert.deepEqual(selectedModules(actor(role), operationalContext("/")), [
      role,
    ]);
    assert.deepEqual(
      selectedModules(
        actor(role),
        operationalContext(role === "hr" ? "/finance" : "/hr"),
      ),
      [],
    );
    assert.deepEqual(
      selectedModules(actor(role, "invented"), operationalContext("/")),
      [],
    );
  }
  for (const bad of [
    {},
    { ...owner, status: "pending" },
    { ...owner, status: "rejected" },
    { ...actor("hr"), accountType: "talent" },
  ])
    assert.deepEqual(selectedModules(bad, operationalContext("/")), []);
  assert.equal(
    operationalContext("/pmo/invoices?token=secret#salary").path,
    "/pmo/invoices",
  );
  for (const path of [
    "//evil.test",
    "/sales/../../finance",
    "/sales%2ffoo",
    "/sales';SELECT",
    "/unknown/email@example.test",
  ])
    assert.equal(operationalContext(path).path, "/");
  assert.equal(operationalContext("/hr/some-personal-name").path, "/hr");
});
test("real SQL signals, sensitive-field projection, Jakarta boundary and PMO commands", async () => {
  // @ts-expect-error JS runner
  const { migrate } = await import("../scripts/migrate.mjs");
  const pg = await PGlite.create();
  const server = new PGLiteSocketServer({
    db: pg,
    port: 55441,
    host: "127.0.0.1",
  });
  await server.start();
  const url =
    process.env.OPERATIONS_DATABASE_URL ||
    "postgres://postgres:postgres@127.0.0.1:55441/postgres";
  const sql = postgres(url, {
    max: process.env.OPERATIONS_DATABASE_URL ? 4 : 1,
    prepare: false,
  });
  try {
    await migrate(url);
    const [user] =
      await sql`INSERT INTO users (email,full_name,status,is_owner) VALUES ('ops@example.test','Synthetic Owner','active',true) RETURNING id`;
    const identity = { userId: user.id, userName: "Synthetic Owner" };
    await sql`INSERT INTO leads (lead_no,client_name,contact_name,service_type_code,lead_source_code,category_code,sales_pic_name,is_qualified,contact_email,price_amount) SELECT 'LEAD-'||n,'Confidential Client','PRIVATE PERSON','outsourcing','inbound','new','Sales',true,'PRIVATE@EMAIL',99999999 FROM generate_series(1,7) n`;
    const [tracker] =
      await sql`INSERT INTO sales_opportunity_trackers (opty_no,client_name,sales_pic_name,sales_qualified) VALUES ('TRACKER-1','Confidential','Sales',true) RETURNING id`;
    const [opty] =
      await sql`INSERT INTO opportunities (opty_no,client_name,project_name,service_type_code,sales_pic_name) VALUES ('PQ-1','Confidential','Synthetic','outsourcing','Sales') RETURNING id`;
    const [contract] =
      await sql`INSERT INTO project_contracts(opportunity_id) VALUES (${opty.id}) RETURNING id`;
    await sql`INSERT INTO project_monthly_billings(contract_id,month,amount) VALUES (${contract.id},'2026-01-01',100),(${contract.id},'2026-04-01',200),(${contract.id},'2026-04-01',300)`;
    await sql`INSERT INTO finance_document_handoffs(opportunity_id,status_code,doc_url,notes) VALUES (${opty.id},'notified','https://PRIVATE-DOC','PRIVATE NOTE')`;
    await sql`INSERT INTO project_invoices(opportunity_id,services_month_start,status_code) VALUES (${opty.id},'2026-02-01','planned'),(${opty.id},'2026-02-01',NULL),(${opty.id},'2026-02-01','submitted'),(${opty.id},'2026-02-01','canceled'),(${opty.id},'2027-01-01','overdue')`;
    const now = new Date("2026-03-14T17:00:00.001Z");
    const read = (a = owner, p = "/") => readOperationalContext(sql, a, p, now);
    const before = await read();
    const group = (result: typeof before, key: string) =>
      result.groups.find((g) => g.key === key)!;
    assert.equal(group(before, "qualified-leads").count, 7);
    assert.equal(group(before, "qualified-leads").items.length, 5);
    assert.equal(group(before, "qualified-trackers").count, 1);
    assert.equal(group(before, "invoice-submission").count, 3);
    assert.equal(group(before, "missing-invoices").count, 1);
    assert.equal(group(before, "ambiguous-billing").count, 1);
    assert.equal(group(before, "missing-documents").count, 1);
    assert.equal(group(before, "finance-review").count, 1);
    assert.doesNotMatch(
      JSON.stringify(before),
      /PRIVATE|Confidential|99999999|price_amount|doc_url|contact_email/,
    );
    const boundary = await readOperationalContext(
      sql,
      owner,
      "/pmo",
      new Date("2026-03-14T17:00:00Z"),
    );
    assert.equal(
      group(boundary, "invoice-submission").count,
      1,
      "exact threshold is not yet overdue",
    );
    const projected = await drizzle(sql)
      .select({ status: invoiceStatusExpression(now) })
      .from(projectInvoices);
    assert.equal(
      projected.filter((r) => r.status === "overdue").length,
      3,
      "table and assistance agree",
    );
    const sales = await readOperationalContext(
      sql,
      actor("sales"),
      "/sales",
      now,
    );
    assert.deepEqual(
      sales.groups.map((g) => g.module),
      ["sales"],
    );
    const finance = await readOperationalContext(
      sql,
      actor("finance"),
      "/finance",
      now,
    );
    assert.deepEqual(
      finance.groups.map((g) => g.module),
      ["finance"],
    );
    const poison = {
      begin: () => {
        throw new Error("unauthorized query");
      },
    } as unknown as typeof sql;
    for (const role of ["hr", "tm", "ta", "sales"])
      assert.equal(
        (await readOperationalContext(poison, actor(role), "/finance")).groups
          .length,
        0,
      );
    await sql`UPDATE opportunities SET opportunity_tracker_id=${tracker.id} WHERE id=${opty.id}`;
    assert.equal(
      group(await read(), "qualified-trackers").count,
      0,
      "linked extension/PQ excluded",
    );
    const concurrent = await Promise.all([
      materializePmo(sql, "invoices", identity),
      materializePmo(sql, "invoices", identity),
    ]);
    assert.deepEqual(
      concurrent.sort(),
      [0, 1],
      "concurrent preparation inserts one set",
    );
    assert.equal(
      (
        await sql`SELECT count(*)::int n FROM project_invoices WHERE services_month_start='2026-04-01'`
      )[0].n,
      0,
      "ambiguous schedule not summed or arbitrarily selected",
    );
    assert.equal(await materializePmo(sql, "documents", identity), 1);
    assert.equal(await materializePmo(sql, "documents", identity), 0);
    assert.equal(
      (
        await sql`SELECT count(*)::int n FROM activity_logs WHERE actor_user_id=${user.id}`
      )[0].n,
      4,
      "command audit commits with effects",
    );
    assert.equal(
      (
        await sql`SELECT count(*)::int n FROM project_invoices WHERE status_code='planned'`
      )[0].n,
      2,
      "derived reads do not mutate statuses",
    );
    assert.equal(group(await read(), "missing-invoices").count, 0);
    assert.equal(group(await read(), "missing-documents").count, 0);
  } finally {
    await sql.end();
    await server.stop();
    await pg.close();
  }
});
