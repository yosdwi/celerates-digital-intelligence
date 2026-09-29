// ADR-010: ERP-held proposals. Intelligence may create a proposal (machine action token + user delegation);
// only that same user, in an ERP session, can confirm it against the stored digest. Confirmation re-validates
// every item with the user's *current* authority and applies each in its own savepoint with a receipt.
import type { Sql, TransactionSql } from "postgres";
import { digest } from "@/lib/integration/contract";
import { operationalContext } from "@/lib/operations/policy";
import { CATALOG, hrefFor, type EntityType } from "./catalog";
import { choices, COMMANDS, CommandConflict, validateItem, type Actor, type NormalizedItem } from "./commands";

export const MAX_ITEMS = 200;
type Tx = Sql | TransactionSql;
export class ProposalError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}
type Row = {
  id: string;
  user_id: string;
  run_id: string | null;
  title: string;
  context_path: string | null;
  items: NormalizedItem[];
  sha256: string;
  state: string;
  created_at: Date;
  expires_at: Date;
  decided_at: Date | null;
};
/** jsonb arrives parsed from PostgreSQL, but as text through some drivers/proxies (e.g. PGlite socket). */
function rowOf(raw: unknown): Row {
  const row = raw as Row & { items: unknown };
  return { ...row, items: (typeof row.items === "string" ? JSON.parse(row.items) : row.items) as NormalizedItem[] };
}
function receiptsOf(raw: unknown): Receipt[] {
  return (raw as (Receipt & { params: unknown })[]).map((r) => ({ ...r, params: (typeof r.params === "string" ? JSON.parse(r.params) : r.params) as Record<string, unknown> }));
}
type Receipt = { item_index: number; kind: string; state: string; target_type: string | null; target_id: string | null; message: string | null; params: Record<string, unknown> };

function editableSpecs(item: NormalizedItem, refs: Record<string, string[]>) {
  const spec = COMMANDS.get(item.kind);
  if (!spec) return [];
  return spec.params
    .filter((p) => item.editable.includes(p.name))
    .map((p) => ({
      name: p.name,
      label: p.label,
      kind: p.kind,
      required: Boolean(p.required),
      options: p.kind === "enum" ? p.enum!.map(([code, label]) => ({ value: code, label })) : p.kind === "choice" ? (refs[p.choices!] ?? []).map((v) => ({ value: v, label: v })) : null,
    }));
}

async function view(tx: Tx, row: Row, receipts: Receipt[], withOutcome: boolean) {
  const refs = row.state === "pending" ? await choices(tx) : {};
  const byIndex = new Map(receipts.map((r) => [r.item_index, r]));
  const outcome = { resolved: 0, open: 0, unknown: 0 };
  const items = [];
  for (const item of row.items) {
    const receipt = byIndex.get(item.index) ?? null;
    let status: string | null = null;
    if (withOutcome && receipt?.state === "applied") {
      status = await COMMANDS.get(item.kind)!.outcome(tx, { target_id: receipt.target_id });
      outcome[status as keyof typeof outcome]++;
    }
    const ref = receipt?.target_id && receipt.target_type ? { type: receipt.target_type, id: receipt.target_id } : item.target;
    const href = ref && CATALOG.has(ref.type as EntityType) ? hrefFor(ref.type as EntityType, ref.id) : null;
    items.push({ ...item, fields: row.state === "pending" ? editableSpecs(item, refs) : [], receipt, outcome: status, href });
  }
  const counts = { ok: 0, warning: 0, needs_input: 0, invalid: 0 };
  for (const item of row.items) counts[item.validation.state]++;
  return {
    schema_version: "1.0",
    id: row.id,
    run_id: row.run_id,
    title: row.title,
    context_path: row.context_path,
    state: row.state,
    sha256: row.sha256,
    created_at: row.created_at,
    expires_at: row.expires_at,
    decided_at: row.decided_at,
    counts,
    receipts: {
      applied: receipts.filter((r) => r.state === "applied").length,
      skipped: receipts.filter((r) => r.state === "skipped").length,
      failed: receipts.filter((r) => r.state === "failed").length,
    },
    outcome: withOutcome ? outcome : null,
    items,
  };
}

export async function createProposal(sql: Sql, actor: Actor, key: string, input: unknown) {
  const body = (input && typeof input === "object" ? input : {}) as { run_id?: unknown; title?: unknown; context_path?: unknown; items?: unknown };
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (title.length < 3 || title.length > 200) throw new ProposalError(422, "SCHEMA", "Judul usulan 3–200 karakter.");
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > MAX_ITEMS) throw new ProposalError(422, "SCHEMA", `Usulan berisi 1–${MAX_ITEMS} item.`);
  const runId = typeof body.run_id === "string" && /^[0-9a-f-]{36}$/i.test(body.run_id) ? body.run_id.toLowerCase() : null;
  const contextPath = operationalContext(body.context_path).path;
  const rawItems = body.items as unknown[];
  const requestHash = digest({ title, run_id: runId, context_path: contextPath, items: rawItems });
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${actor.id + ":proposal:" + key},0))`;
    const [prior] = await tx`SELECT * FROM agent_proposals WHERE user_id=${actor.id} AND request_key=${key}`;
    if (prior) {
      if (prior.request_hash !== requestHash) throw new ProposalError(409, "IDEMPOTENCY_CONFLICT", "Request key was used with different content.");
      return view(tx, rowOf(prior), [], false);
    }
    const refs = await choices(tx);
    const items: NormalizedItem[] = [];
    for (let i = 0; i < rawItems.length; i++) items.push(await validateItem(tx, actor, i, rawItems[i], refs));
    const [row] = await tx`INSERT INTO agent_proposals (user_id,request_key,request_hash,run_id,title,context_path,items,sha256)
      VALUES (${actor.id},${key},${requestHash},${runId},${title},${contextPath},${JSON.stringify(items)}::jsonb,${digest(items)}) RETURNING *`;
    return view(tx, rowOf(row), [], false);
  });
}

async function load(tx: Tx, actor: Actor, id: string, lock = false) {
  const rows = lock
    ? await tx`SELECT * FROM agent_proposals WHERE id=${id} AND user_id=${actor.id} FOR UPDATE`
    : await tx`SELECT * FROM agent_proposals WHERE id=${id} AND user_id=${actor.id}`;
  if (!rows.length) throw new ProposalError(404, "NOT_FOUND", "Usulan tidak ditemukan.");
  const row = rowOf(rows[0]);
  if (row.state === "pending" && new Date(row.expires_at) <= new Date()) {
    await tx`UPDATE agent_proposals SET state='expired' WHERE id=${id} AND state='pending'`;
    row.state = "expired";
  }
  const receipts = receiptsOf(await tx`SELECT item_index,kind,state,target_type,target_id,message,params FROM agent_action_receipts WHERE proposal_id=${id} ORDER BY item_index`);
  return { row, receipts };
}

export async function getProposal(sql: Sql, actor: Actor, id: string) {
  const { row, receipts } = await load(sql, actor, id);
  return view(sql, row, receipts, true);
}

export type Decision = { index: number; include: boolean; params?: Record<string, unknown> };

export async function confirmProposal(sql: Sql, actor: Actor, id: string, input: unknown) {
  const body = (input && typeof input === "object" ? input : {}) as { sha256?: unknown; decisions?: unknown };
  const decisions = new Map<number, Decision>();
  if (Array.isArray(body.decisions))
    for (const d of body.decisions.slice(0, MAX_ITEMS)) {
      const x = d as Decision;
      if (Number.isInteger(x?.index)) decisions.set(x.index, { index: x.index, include: x.include === true, params: x.params && typeof x.params === "object" ? x.params : undefined });
    }
  return sql.begin(async (tx) => {
    const { row, receipts } = await load(tx, actor, id, true);
    if (["applied", "partially_applied", "failed"].includes(row.state)) return view(tx, row, receipts, true); // replay: same receipts, no effect
    if (row.state !== "pending") throw new ProposalError(409, "NOT_PENDING", row.state === "expired" ? "Usulan sudah kedaluwarsa; minta Agent menyiapkan ulang." : "Usulan sudah ditolak.");
    if (body.sha256 !== row.sha256) throw new ProposalError(412, "PROPOSAL_CHANGED", "Usulan berubah; muat ulang sebelum konfirmasi.");
    const refs = await choices(tx);
    const out: Receipt[] = [];
    for (const item of row.items) {
      const decision = decisions.get(item.index);
      const include = decision ? decision.include : item.validation.state === "ok";
      const base = { item_index: item.index, kind: item.kind, target_type: item.target?.type ?? null, target_id: item.target?.id ?? null };
      if (!include) {
        out.push({ ...base, state: "skipped", message: "Tidak dipilih.", params: item.params });
        continue;
      }
      const overrides = Object.fromEntries(Object.entries(decision?.params ?? {}).filter(([k]) => item.editable.includes(k)));
      const current = await validateItem(tx, actor, item.index, { kind: item.kind, target: item.target, params: { ...item.params, ...overrides } }, refs);
      if (current.validation.state === "invalid" || current.validation.state === "needs_input") {
        out.push({ ...base, state: "skipped", message: current.validation.messages.join(" "), params: current.params });
        continue;
      }
      try {
        const applied = await tx.savepoint((sp) => COMMANDS.get(item.kind)!.apply(sp, actor, current.params, current.target, row.id));
        out.push({ ...base, state: "applied", target_type: applied.target_type, target_id: applied.target_id, message: applied.message, params: current.params });
      } catch (error) {
        const message = error instanceof CommandConflict ? error.message : "Gagal diterapkan; tidak ada perubahan untuk item ini.";
        if (!(error instanceof CommandConflict)) console.error("agent_command_failed", item.kind);
        out.push({ ...base, state: error instanceof CommandConflict ? "skipped" : "failed", message, params: current.params });
      }
    }
    for (const r of out)
      await tx`INSERT INTO agent_action_receipts (proposal_id,item_index,kind,state,target_type,target_id,message,params)
        VALUES (${row.id},${r.item_index},${r.kind},${r.state},${r.target_type},${r.target_id},${r.message},${JSON.stringify(r.params)}::jsonb)`;
    const applied = out.filter((r) => r.state === "applied").length;
    const failed = out.filter((r) => r.state === "failed").length;
    const state = applied === 0 ? "failed" : failed || out.some((r) => r.state === "skipped" && decisions.get(r.item_index)?.include) ? "partially_applied" : "applied";
    const [updated] = await tx`UPDATE agent_proposals SET state=${state},decided_at=now() WHERE id=${row.id} RETURNING *`;
    return view(tx, rowOf(updated), out, true);
  });
}

export async function rejectProposal(sql: Sql, actor: Actor, id: string) {
  return sql.begin(async (tx) => {
    const { row, receipts } = await load(tx, actor, id, true);
    if (row.state === "pending") {
      const [updated] = await tx`UPDATE agent_proposals SET state='rejected',decided_at=now() WHERE id=${id} RETURNING *`;
      return view(tx, rowOf(updated), receipts, false);
    }
    return view(tx, row, receipts, true);
  });
}

/** Follow-ups for `Perlu perhatian`: the user's recent proposals, with live outcome of applied effects. */
export async function listProposals(sql: Sql, actor: Actor, limit = 8) {
  const rows = (await sql`SELECT * FROM agent_proposals WHERE user_id=${actor.id} AND created_at > now() - interval '14 days' ORDER BY created_at DESC LIMIT ${limit}`).map(rowOf);
  const out = [];
  for (const row of rows) {
    const receipts = receiptsOf(await sql`SELECT item_index,kind,state,target_type,target_id,message,params FROM agent_action_receipts WHERE proposal_id=${row.id} ORDER BY item_index`);
    const v = await view(sql, row.state === "pending" && new Date(row.expires_at) <= new Date() ? { ...row, state: "expired" } : row, receipts, true);
    out.push({ ...v, items: undefined });
  }
  return { schema_version: "1.0", items: out };
}
