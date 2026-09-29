import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
const globalForDb = globalThis as unknown as { dbClient?: ReturnType<typeof postgres> };
const poolMax = Number(process.env.DB_POOL_MAX || 5);
if (!Number.isInteger(poolMax) || poolMax < 1 || poolMax > 20) throw new Error("DB_POOL_MAX must be 1..20");
export const sql = globalForDb.dbClient ?? postgres(process.env.DATABASE_URL || "postgres://build:build@127.0.0.1:5432/build", {
  prepare: false, max: poolMax, idle_timeout: 20, connect_timeout: 10,
  connection: { application_name: "celerates-erp", statement_timeout: 15000, idle_in_transaction_session_timeout: 10000 },
});
globalForDb.dbClient = sql;
export const db = drizzle(sql);
