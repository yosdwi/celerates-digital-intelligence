// Operating Substrate cross-stack journeys (disposable local harness only).
// Real Next ERP + real FastAPI Intelligence + separate PostgreSQL databases. Verifies ADR-008/009/010/013:
// session → BFF → ERP-signed delegation → Intelligence run → delegated ERP reads → persisted AG-UI events, and
// signal/file → Intelligence proposes → ERP-held proposal → user confirms in ERP → receipts → outcome → learning.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventSchemas } from '@ag-ui/core/schemas';
import { HttpAgent } from '@ag-ui/client';
import postgres from 'postgres';

async function until(fn, label) { for (let i = 0; i < 120; i++) { try { if (await fn()) return; } catch {} await new Promise(r => setTimeout(r, 250)); } throw new Error('Timeout: ' + label); }
function parseSse(text) {
  return text.split('\n\n').filter(b => b.includes('data:')).map(block => {
    const lines = block.split('\n');
    const id = lines.find(l => l.startsWith('id:'))?.slice(3).trim() ?? null;
    return { id, event: JSON.parse(lines.filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n')) };
  });
}

export async function agentJourney({ base, request, db, env, python, publicKey, tracker, requisition, readToken, cookies }) {
  const intelligence = 'http://127.0.0.1:8010';
  const agentEnv = { ...env, ERP_DELEGATION_PUBLIC_KEYS: JSON.stringify({ 'test-k1': publicKey }) };
  let api = spawn(python, ['-m', 'uvicorn', 'cdi.api:app', '--host', '127.0.0.1', '--port', '8010'], { env: agentEnv, stdio: ['ignore', 'ignore', 'inherit'] });
  let fakeModel = null;
  try {
    await until(async () => (await fetch(intelligence + '/ready')).ok, 'Intelligence API');
    // Approved company knowledge relevant to the TA rule, through the governed curator path.
    const auth = { Authorization: 'Bearer ' + env.API_ACCESS_TOKEN };
    const source = await (await fetch(intelligence + '/api/knowledge/sources', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ source_key: 'agent-ta-sop', title: 'SOP Requisition TA PIC', scope_type: 'company', scope_id: 'company', classification: 'internal', source_kind: 'policy' }) })).json();
    const form = new FormData(); form.set('file', new Blob(['SOP Talent Acquisition: setiap Requisition wajib memiliki TA PIC sebelum sourcing dimulai. Tetapkan TA PIC dalam satu hari kerja setelah requisition dibuat.'], { type: 'text/markdown' }), 'sop.md');
    const version = await (await fetch(`${intelligence}/api/knowledge/sources/${source.id}/versions?version=1`, { method: 'POST', headers: auth, body: form })).json();
    const tick = spawn(python, ['-c', 'from cdi.knowledge import tick; tick()'], { env: agentEnv, stdio: 'inherit' });
    await new Promise((resolve, reject) => tick.on('exit', c => c === 0 ? resolve() : reject(Error('ingestion tick failed'))));
    assert.equal((await fetch(`${intelligence}/api/knowledge/versions/${version.id}/lifecycle`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve' }) })).status, 200);

    // Page/entity context from the catalog.
    const ctx = await (await request('/api/agent/context?path=' + encodeURIComponent(`/sales/opportunity-tracker/${tracker.id}/edit`))).json();
    assert.equal(ctx.enabled, true);
    assert.equal(ctx.entity.type, 'sales_opportunity');
    assert.equal(ctx.entity.id, tracker.id);

    // Boundary: the delegated contract refuses missing or forged delegation even with a valid machine token.
    const machine = { Authorization: 'Bearer ' + readToken, 'X-ERP-Audience': 'celerates-intelligence', 'X-ERP-Environment': 'local-test' };
    assert.equal((await fetch(`${base}/api/integration/v1/agent/entities/sales_opportunity/${tracker.id}`, { headers: machine })).status, 401);
    assert.equal((await fetch(`${base}/api/integration/v1/agent/entities/sales_opportunity/${tracker.id}`, { headers: { ...machine, 'X-ERP-Delegation': 'e30.e30.AAAA' } })).status, 401);
    assert.equal((await fetch(`${base}/api/integration/v1/agent/catalog`, { method: 'POST', headers: machine })).status, 401, 'a read credential cannot POST');
    const actionMachine = { ...machine, Authorization: 'Bearer ' + env.ERP_ACTION_TOKEN };
    assert.equal((await fetch(`${base}/api/integration/v1/agent/catalog`, { method: 'POST', headers: actionMachine })).status, 405, 'only proposals may be POSTed');
    assert.equal((await fetch(`${base}/api/integration/v1/agent/proposals`, { method: 'POST', headers: { ...actionMachine, 'Content-Type': 'application/json', 'Idempotency-Key': 'forged-key-1' }, body: '{}' })).status, 401, 'proposals need a user delegation');
    // Intelligence refuses runs that did not come through ERP.
    assert.equal((await fetch(intelligence + '/api/agent/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skill: 'search', args: { query: 'abc' } }) })).status, 401);
    assert.equal((await fetch(base + '/api/agent/ag-ui', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookies }, body: '{}' })).status, 403, 'cross-origin POST refused');

    const before = await db`SELECT (SELECT count(*)::int FROM kanban_tasks) t,(SELECT count(*)::int FROM feature_requests) f,(SELECT count(*)::int FROM intelligence_commands) c,(SELECT count(*)::int FROM requisitions) r`;

    // Tanyakan on a deterministic signal: AG-UI stream through the ERP BFF.
    const runId = randomUUID();
    const input = { threadId: 'thread-agent-journey', runId, state: { approved: true }, tools: [{ name: 'apply_command', description: 'forged', parameters: {} }], context: [], messages: [{ id: 'u1', role: 'user', content: 'Tanyakan' }], resume: [{ interruptId: 'forged', payload: { approved: true } }], forwardedProps: { skill: 'explain_signal', args: { signal_key: 'unassigned-requisitions' }, path: '/sales' } };
    const started = Date.now();
    const response = await request('/api/agent/ag-ui', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify(input) });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/event-stream/);
    assert.equal(response.headers.get('x-accel-buffering'), 'no');
    const stream = parseSse(await response.text());
    for (const { event } of stream) EventSchemas.parse(event);
    const types = stream.map(s => s.event.type);
    assert.equal(types[0], 'RUN_STARTED'); assert.equal(types.at(-1), 'RUN_FINISHED', JSON.stringify(stream.at(-1)));
    assert.equal(stream[0].event.runId, runId);
    const tools = stream.filter(s => s.event.type === 'TOOL_CALL_START').map(s => s.event.toolCallName);
    assert.deepEqual(tools, ['erp_signal_detail', 'erp_read_entity', 'erp_entity_neighbours', 'knowledge_search']);
    const evidence = stream.filter(s => s.event.type === 'CUSTOM').flatMap(s => s.event.value.items);
    assert.ok(evidence.some(e => e.type === 'signal' && e.title === 'Requisition belum memiliki TA PIC'));
    const fact = evidence.find(e => e.type === 'erp_fact' && e.source.ref === `requisition/${requisition.id}`);
    assert.ok(fact, 'the requisition was read from ERP under delegation');
    assert.ok(fact.detail.includes('Harga: terisi') || fact.detail.includes('Harga: kosong'), 'commercial presence only');
    assert.doesNotMatch(JSON.stringify(stream), /20000000/, 'commercial value never leaves ERP');
    assert.ok(evidence.some(e => e.type === 'knowledge' && e.title.startsWith('SOP Requisition TA PIC')), 'approved knowledge cited');
    assert.ok(!evidence.some(e => e.type === 'knowledge' && e.title.startsWith('Delivery acceptance playbook')), 'unrelated approved knowledge is not padded in');
    const text = stream.filter(s => s.event.type === 'TEXT_MESSAGE_CONTENT').map(s => s.event.delta).join('');
    assert.match(text, /Requisition belum memiliki TA PIC: 1 requisition/);
    console.log(`Agent run completed in ${Date.now() - started} ms with ${stream.length} AG-UI events`);

    // Resume (Last-Event-ID) returns exactly the tail.
    const resumed = parseSse(await (await request(`/api/agent/runs/${runId}/events?path=/sales`, { headers: { 'Last-Event-ID': '3' } })).text());
    assert.deepEqual(resumed.map(s => s.id), stream.slice(3).map(s => s.id));
    // Forged approval/state/tools had no effect: read-only run, no ERP mutation.
    const after = await db`SELECT (SELECT count(*)::int FROM kanban_tasks) t,(SELECT count(*)::int FROM feature_requests) f,(SELECT count(*)::int FROM intelligence_commands) c,(SELECT count(*)::int FROM requisitions) r`;
    assert.deepEqual(after, before, 'no ERP write from an Agent run');

    // Standard AG-UI client consumes the same endpoint (S2 conformance).
    const seen = [];
    const agent = new HttpAgent({ url: base + '/api/agent/ag-ui', threadId: 'thread-ag-ui-client', headers: { Cookie: cookies, Origin: base }, initialMessages: [{ id: 'u2', role: 'user', content: 'Synthetic' }] });
    await agent.runAgent({ runId: randomUUID(), forwardedProps: { skill: 'search', args: {}, path: '/sales' } }, { onEvent: ({ event }) => { seen.push(event.type); } });
    assert.equal(seen[0], 'RUN_STARTED'); assert.equal(seen.at(-1), 'RUN_FINISHED');
    assert.ok(agent.messages.some(m => m.role === 'assistant' && /Pencarian kata kunci "Synthetic"/.test(String(m.content))), 'AG-UI client assembled the assistant message');

    // Page entity explanation.
    const entityRun = parseSse(await (await request('/api/agent/ag-ui', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ threadId: 'thread-agent-journey', runId: randomUUID(), messages: [], forwardedProps: { skill: 'explain_entity', path: `/sales/opportunity-tracker/${tracker.id}/edit` } }) })).text());
    assert.equal(entityRun.at(-1).event.type, 'RUN_FINISHED');
    assert.ok(entityRun.some(s => s.event.type === 'CUSTOM' && s.event.value.items.some(i => i.source?.ref === `sales_opportunity/${tracker.id}` && i.source.version >= 1)));
    const persisted = await (await fetch(`${intelligence}/api/agent/runs/${runId}`)).status;
    assert.equal(persisted, 401, 'run status requires delegation');
    await proposalJourneys({ base, request, db, env, intelligence, requisition, cookies });
    if (process.env.ERP_BROWSER_TEST === '1') {
      // A fresh unassigned requisition for the browser's own `Tindak lanjuti` flow.
      await db`INSERT INTO requisitions (requisition_no,client_name,position_name,ta_pic_name) VALUES ('REQ-BROWSER','PT Synthetic Browser','Data Engineer','')`;
      const { agentBrowser } = await import('./agent-browser.mjs');
      await agentBrowser({ base, cookies: cookies.split('; ').map((pair) => [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)]) });
    }
    // Same runtime with an Agent model configured (ADR-014). The provider is a local OpenAI-compatible stand-in, so the
    // real LiteLLM → HTTP → validation → tools → ERP path runs without credentials.
    api.kill();
    await new Promise((r) => api.once('exit', r));
    fakeModel = spawn(python, ['../../services/intelligence-api/tests/fake_model_server.py', '8011'], { stdio: ['ignore', 'ignore', 'inherit'] });
    const modelEnv = { ...agentEnv, GENERATION_MODE: 'litellm', EMBEDDING_MODE: 'demo', AGENT_MODEL: 'openai/fake-agent', AGENT_TRANSCRIBE_MODEL: 'openai/whisper-fake', MODEL_API_BASE: 'http://127.0.0.1:8011/v1', MODEL_API_KEY: 'test-only', LITELLM_LOCAL_MODEL_COST_MAP: 'True' };
    api = spawn(python, ['-m', 'uvicorn', 'cdi.api:app', '--host', '127.0.0.1', '--port', '8010'], { env: modelEnv, stdio: ['ignore', 'ignore', 'inherit'] });
    await until(async () => (await fetch(intelligence + '/ready')).ok, 'Intelligence API with model');
    await modelJourneys({ request, db });
    if (process.env.ERP_BROWSER_TEST === '1') {
      const { agentModelBrowser, consoleBrowser } = await import('./agent-browser.mjs');
      await agentModelBrowser({ base, cookies: cookies.split('; ').map((pair) => [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)]) });
      await consoleBrowser({ env: modelEnv, python, base, cookies });
    }
    console.log('PASS: Agent — catalog page context, ERP-signed delegation, delegated reads with sensitivity filter, persisted AG-UI stream + resume, standard AG-UI client, forged approval inert, no ERP writes without the user; follow-up and import proposals confirmed in ERP with receipts, outcomes and mapping memory');
  } finally { api.kill(); fakeModel?.kill(); }
}

async function modelJourneys({ request, db }) {
  // A paraphrase with no word in common with the rule ("recruiter", "ditugasi" vs "TA PIC"): the model plans reads,
  // answers citing the rule and the SOP, and the answer is labelled as model inference.
  const para = await run(request, 'ask', { query: 'Siapa saja yang belum ditugasi recruiter?' });
  const prov = para.stream.find(s => s.event.type === 'CUSTOM' && s.event.name === 'celerates.provenance').event.value;
  assert.equal(prov.mode, 'model', JSON.stringify(prov));
  assert.equal(prov.model, 'openai/fake-agent');
  assert.match(para.text, /requisition yang belum punya TA PIC \(recruiter\) \[S\d+\]/);
  assert.ok(para.evidence.some(e => e.type === 'signal' && /^S\d+$/.test(e.cite)), 'cited rule shown as a Sinyal card');
  assert.ok(para.evidence.some(e => e.type === 'knowledge' && /^E\d+$/.test(e.cite)), 'cited SOP shown as knowledge');
  assert.ok(para.stream.some(s => s.event.type === 'CUSTOM' && s.event.name === 'celerates.actions'), 'follow-up offered');

  // Push-to-talk: audio → editable transcript only (no run starts); the reviewed text runs as a voice run.
  // Capabilities are cached by ERP for 15 s; Intelligence was just restarted with a model.
  await until(async () => (await (await request('/api/agent/context?path=/ta')).json()).capabilities?.voice === true, 'voice capability');
  const ctx = await (await request('/api/agent/context?path=/ta')).json();
  assert.deepEqual(ctx.capabilities, { reasoning: 'model', voice: true });
  const audio = new FormData();
  audio.set('file', new Blob([Buffer.alloc(4000, 1)], { type: 'audio/webm' }), 'speech.webm');
  const heard = await (await request('/api/agent/transcribe', { method: 'POST', body: audio })).json();
  assert.equal(heard.text, 'Siapa saja yang belum ditugasi recruiter?');
  const notAudio = new FormData();
  notAudio.set('file', new Blob(['x'], { type: 'text/plain' }), 'x.txt');
  assert.equal((await request('/api/agent/transcribe', { method: 'POST', body: notAudio })).status, 422);

  // Feedback on an answer goes through ERP (same origin, session) to Intelligence under the user's delegation.
  assert.equal((await request(`/api/agent/runs/${para.runId}/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: 1 }) })).status, 200);
  assert.equal((await request(`/api/agent/runs/${para.runId}/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: 5 }) })).status, 422);

  // Brain Console sign-in from ERP (Owner): a 303 to the console with a console-scoped assertion in the fragment.
  const signIn = await request('/api/agent/console');
  assert.equal(signIn.status, 303);
  assert.match(signIn.headers.get('location'), /^http:\/\/127\.0\.0\.1:8010\/app\/agent#erp_token=[\w-]+\.[\w-]+\.[\w-]+$/);
  assert.equal((await (await request('/api/agent/context?path=/ta')).json()).console, true);

  // An ungrounded number is never shown: the run falls back to the deterministic router and says so.
  const ungrounded = await run(request, 'ask', { query: 'berapa angka requisition?' });
  assert.doesNotMatch(ungrounded.text, /987654/);
  assert.match(ungrounded.text, /disusun tanpa model/);

  // Natural-language action → ERP-held proposal → the user confirms in ERP → a task linked to the record.
  const [req] = await db`SELECT id, requisition_no FROM requisitions ORDER BY created_at LIMIT 1`;
  const before = (await db`SELECT count(*)::int AS n FROM kanban_tasks`)[0].n;
  const act = await run(request, 'ask', { query: `Tolong buatkan task follow up ${req.requisition_no} hari ini` });
  assert.ok(act.proposal?.id, act.text);
  assert.equal((await db`SELECT count(*)::int AS n FROM kanban_tasks`)[0].n, before, 'the model changed nothing');
  const proposal = await (await request(`/api/agent/proposals/${act.proposal.id}`)).json();
  assert.equal(proposal.items[0].target.id, req.id);
  const done = await (await request(`/api/agent/proposals/${act.proposal.id}/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sha256: proposal.sha256 }) })).json();
  assert.equal(done.state, 'applied');
  const [task] = await db`SELECT source_type, source_id FROM kanban_tasks WHERE title=${'Follow up ' + req.requisition_no.toUpperCase()}`;
  assert.deepEqual({ ...task }, { source_type: 'requisition', source_id: req.id });
  // A dropped request letter becomes an ERP-held proposal for the requisition it asks for; ERP applies it on confirm.
  const letter = pdfBytes(['SURAT PERMINTAAN TENAGA KERJA', 'PT Synthetic Letter membutuhkan 2 Data Analyst mulai 1 Oktober 2026.']);
  const doc = await uploadFile(request, 'permintaan-model.pdf', letter, 'application/pdf');
  const brief = await run(request, 'read_document', { dataset_id: doc.body.id });
  assert.ok(brief.proposal?.id, brief.text);
  const drafted = await (await request(`/api/agent/proposals/${brief.proposal.id}`)).json();
  assert.deepEqual(drafted.items.map(i => [i.kind, i.params.client_name, i.params.position_name, i.params.headcount_target, i.validation.state]), [['requisition.create', 'PT Synthetic Letter', 'Data Analyst', 2, 'ok']]);
  const made = await (await request(`/api/agent/proposals/${brief.proposal.id}/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sha256: drafted.sha256 }) })).json();
  assert.equal(made.state, 'applied');
  assert.equal((await db`SELECT count(*)::int AS n FROM requisitions WHERE client_name='PT Synthetic Letter'`)[0].n, 1);
  console.log('PASS: Agent model path — paraphrase understood with cited rule/SOP as inference, ungrounded answer rejected, natural-language action → ERP proposal → confirmed task, dropped request letter → requisition proposal → applied');
}

/** A minimal one-page PDF with real text (Helvetica), for the document journeys. */
export function pdfBytes(lines) {
  const content = 'BT /F1 12 Tf 72 720 Td ' + lines.map((l) => `(${l}) Tj 0 -16 Td`).join(' ') + ' ET';
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}

async function uploadFile(request, name, body, type) {
  const form = new FormData();
  form.set('file', new Blob([body], { type }), name);
  const res = await request('/api/agent/datasets', { method: 'POST', body: form });
  return { status: res.status, body: await res.json() };
}

async function run(request, skill, args, path = '/ta') {
  const res = await request('/api/agent/ag-ui', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ threadId: 'thread-agent-journey', runId: randomUUID(), messages: [], forwardedProps: { skill, args, path } }) });
  const stream = parseSse(await res.text());
  for (const { event } of stream) EventSchemas.parse(event);
  assert.equal(stream.at(-1).event.type, 'RUN_FINISHED', JSON.stringify(stream.at(-1)));
  return {
    stream,
    proposal: stream.find(s => s.event.type === 'CUSTOM' && s.event.name === 'celerates.proposal')?.event.value,
    evidence: stream.filter(s => s.event.type === 'CUSTOM' && s.event.name === 'celerates.evidence').flatMap(s => s.event.value.items),
    text: stream.filter(s => s.event.type === 'TEXT_MESSAGE_CONTENT').map(s => s.event.delta).join(''),
    runId: stream[0].event.runId,
  };
}

async function proposalJourneys({ base, request, db, env, intelligence, requisition, cookies }) {
  const brain = postgres(env.DATABASE_URL, { max: 1, prepare: false });
  try {
    await db`INSERT INTO pics (name) VALUES ('Rina Synthetic'), ('Budi Synthetic')`;
    const json = async (path, init) => { const r = await request(path, init); return { status: r.status, body: await r.json() }; };
    const post = (path, body) => json(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

    // Signal history: an earlier day's snapshot makes Perlu perhatian and the Agent report what changed (observation).
    await db`INSERT INTO operational_signal_snapshots (day, rule_key, count, ids) VALUES (current_date - 3, 'unassigned-requisitions', 0, '[]'::jsonb)`;
    const withTrends = await json('/api/operations/context?path=/ta');
    assert.equal(withTrends.body.trends['unassigned-requisitions'].previous, 0);
    assert.ok(withTrends.body.trends['unassigned-requisitions'].added >= 1);
    const changed = await run(request, 'ask', { query: 'Apa yang berubah sejak kemarin?' });
    assert.match(changed.text, /Requisition belum memiliki TA PIC: 0 → \d+ \(\+\d+/);
    assert.ok(changed.evidence.some((e) => e.type === 'observation' && e.source.kind === 'erp_snapshot'));

    // Journey A — ask anything: rules, records and knowledge, deterministically routed; next step offered.
    const question = await run(request, 'ask', { query: 'Requisition mana yang belum punya TA PIC?' });
    assert.match(question.text, /Requisition belum memiliki TA PIC: 1 requisition saat ini/);
    assert.ok(question.evidence.some(e => e.type === 'signal'));
    assert.ok(question.evidence.some(e => e.type === 'knowledge' && e.title.startsWith('SOP Requisition TA PIC')), 'approved SOP cited');
    const offered = question.stream.find(s => s.event.type === 'CUSTOM' && s.event.name === 'celerates.actions');
    assert.deepEqual(offered.event.value.items.map(a => a.args.signal_key), ['unassigned-requisitions']);
    const byNumber = await run(request, 'ask', { query: `status ${requisition.requisition_no}` });
    assert.ok(byNumber.evidence.some(e => e.source?.ref === `requisition/${requisition.id}`), 'a record number resolves to that record');
    assert.match(byNumber.text, /Relasi:/);

    // Journey C — signal → proposal → confirm → receipt → outcome.
    const [original] = await db`SELECT ta_pic_name FROM requisitions WHERE id=${requisition.id}`;
    const follow = await run(request, 'follow_up_signal', { signal_key: 'unassigned-requisitions' });
    assert.ok(follow.proposal?.id, 'proposal card event');
    assert.match(follow.text, /Belum ada data yang berubah/);
    const [still] = await db`SELECT ta_pic_name FROM requisitions WHERE id=${requisition.id}`;
    assert.equal(still.ta_pic_name, original.ta_pic_name, 'proposing changed nothing');
    let proposal = (await json(`/api/agent/proposals/${follow.proposal.id}`)).body;
    assert.equal(proposal.state, 'pending');
    assert.equal(proposal.run_id, follow.runId);
    const item = proposal.items.find(i => i.target.id === requisition.id);
    assert.equal(item.validation.state, 'needs_input', 'the PIC is chosen by the user');
    assert.deepEqual(item.fields[0].options.map(o => o.value), ['Budi Synthetic', 'Rina Synthetic']);
    const decisions = [{ index: item.index, include: true, params: { ta_pic_name: 'Rina Synthetic' } }];
    assert.equal((await fetch(`${base}/api/agent/proposals/${proposal.id}/confirm`, { method: 'POST', headers: { Cookie: cookies, 'Content-Type': 'application/json', Origin: 'http://evil.test' }, body: JSON.stringify({ sha256: proposal.sha256, decisions }) })).status, 403, 'cross-origin confirm refused');
    assert.equal((await post(`/api/agent/proposals/${proposal.id}/confirm`, { sha256: 'f'.repeat(64), decisions })).status, 412);
    const confirmed = await post(`/api/agent/proposals/${proposal.id}/confirm`, { sha256: proposal.sha256, decisions });
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
    assert.equal(confirmed.body.state, 'applied');
    assert.equal(confirmed.body.outcome.resolved, 1);
    const [assigned] = await db`SELECT ta_pic_name FROM requisitions WHERE id=${requisition.id}`;
    assert.equal(assigned.ta_pic_name, 'Rina Synthetic');
    const [log] = await db`SELECT actor_name FROM activity_logs WHERE entity_label LIKE ${'%TA PIC → Rina Synthetic%'}`;
    assert.match(log.actor_name, /via Celerates Agent/);
    const again = await post(`/api/agent/proposals/${proposal.id}/confirm`, { sha256: proposal.sha256, decisions });
    assert.deepEqual(again.body.receipts, confirmed.body.receipts, 'replay is idempotent');
    const ctx = await json('/api/operations/context?path=/ta');
    assert.equal(ctx.body.groups.find(g => g.key === 'unassigned-requisitions').count, 0, 'the signal cleared in Perlu perhatian');
    const listed = (await json('/api/agent/proposals')).body.items.find(p => p.id === proposal.id);
    assert.equal(listed.outcome.resolved, 1, 'Tindak lanjut berjalan shows the outcome');
    const [outcome] = await brain`SELECT state, receipts FROM agent_outcomes WHERE proposal_id=${proposal.id}`;
    assert.equal(outcome.state, 'applied', 'ERP reported the outcome to Intelligence');

    // Journey B — drop a file → mapped by ERP command specs → proposal → confirm → rows in ERP → mapping memory.
    const csv = 'Kebutuhan klien Q4\nKlien;Jabatan;Jumlah;Level;Tanggal Request;Catatan\nPT Synthetic Import;Backend Engineer;3;Senior;03/10/2026;urgent\nPT Synthetic Import;QA Engineer;1;Wizard;04/10/2026;\n';
    const upload = async () => {
      const form = new FormData();
      form.set('file', new Blob([csv], { type: 'text/csv' }), 'kebutuhan-q4.csv');
      return json('/api/agent/datasets', { method: 'POST', body: form });
    };
    const bad = new FormData();
    bad.set('file', new Blob(['MZ'], { type: 'application/octet-stream' }), 'x.exe');
    assert.equal((await request('/api/agent/datasets', { method: 'POST', body: bad })).status, 422);
    const dataset = await upload();
    assert.equal(dataset.status, 201, JSON.stringify(dataset.body));
    assert.equal(dataset.body.rows, 2);
    const imported = await run(request, 'import_dataset', { dataset_id: dataset.body.id });
    assert.deepEqual(imported.evidence.map(e => e.type), ['document', 'inference']);
    proposal = (await json(`/api/agent/proposals/${imported.proposal.id}`)).body;
    assert.deepEqual(proposal.items.map(i => i.validation.state), ['ok', 'invalid'], 'ERP validates each row');
    assert.match(proposal.items[1].validation.messages.join(' '), /Level "Wizard" tidak dikenal/);
    const before = (await db`SELECT count(*)::int AS n FROM requisitions`)[0].n;
    const applied = await post(`/api/agent/proposals/${proposal.id}/confirm`, { sha256: proposal.sha256 });
    assert.equal(applied.body.state, 'applied');
    assert.equal((await db`SELECT count(*)::int AS n FROM requisitions`)[0].n, before + 1);
    const [row] = await db`SELECT r.headcount_target, r.level_code, o.pipeline_stage_code FROM requisitions r JOIN opportunities o ON o.opportunity_tracker_id=r.opportunity_id WHERE r.client_name='PT Synthetic Import'`;
    assert.deepEqual({ ...row }, { headcount_target: 3, level_code: 'senior', pipeline_stage_code: 'on_going' });
    const [template] = await brain`SELECT command, uses FROM agent_mapping_templates`;
    assert.equal(template.command, 'requisition.create', 'mapping learned from the applied import');
    const second = await upload();
    const reimport = await run(request, 'import_dataset', { dataset_id: second.body.id });
    assert.equal(reimport.evidence[1].type, 'observation', 'same headers → learned mapping, labelled as observation');
    const dup = (await json(`/api/agent/proposals/${reimport.proposal.id}`)).body;
    assert.equal(dup.items[0].validation.state, 'warning', 'duplicate of the row just imported is flagged by ERP');
    assert.equal((await post(`/api/agent/proposals/${dup.id}/reject`, {})).body.state, 'rejected');
    // Marketing on the same substrate: a leads sheet maps to `lead.create` from ERP's own command specs.
    const leadsCsv = await uploadFile(request, 'leads.csv', 'Perusahaan,Kontak,Sumber,Layanan,Kategori\nPT Synthetic Prospect,Rina,LinkedIn,Headhunting,IT\n', 'text/csv');
    const leadRun = await run(request, 'import_dataset', { dataset_id: leadsCsv.body.id });
    const leadProposal = await (await request(`/api/agent/proposals/${leadRun.proposal.id}`)).json();
    assert.deepEqual(leadProposal.items.map((i) => [i.kind, i.validation.state]), [['lead.create', 'ok']]);
    const leadDone = await post(`/api/agent/proposals/${leadProposal.id}/confirm`, { sha256: leadProposal.sha256 });
    assert.equal(leadDone.body.state, 'applied');
    const [lead] = await db`SELECT lead_source_code, service_type_code, category_code FROM leads WHERE client_name='PT Synthetic Prospect'`;
    assert.deepEqual({ ...lead }, { lead_source_code: 'linkedin', service_type_code: 'headhunting', category_code: 'it' });

    // Drop a document: read deterministically (sections, ERP records it names), then questions cite its pages.
    const letter = pdfBytes(['SURAT PERMINTAAN TENAGA KERJA', 'PT Synthetic Letter membutuhkan 2 Data Analyst mulai 1 Oktober 2026.', `Rujukan permintaan: ${requisition.requisition_no}.`, 'Kontrak berjalan 12 bulan.']);
    const doc = await uploadFile(request, 'permintaan.pdf', letter, 'application/pdf');
    assert.equal(doc.status, 201, JSON.stringify(doc.body));
    assert.equal(doc.body.kind, 'document');
    const read = await run(request, 'read_document', { dataset_id: doc.body.id });
    assert.equal(read.evidence[0].type, 'document');
    assert.ok(read.evidence.some(e => e.source?.ref === `requisition/${requisition.id}` && e.detail[0] === 'Disebut dalam berkas'), 'record named in the file is linked to ERP');
    const docQ = await run(request, 'ask', { query: 'berapa lama kontrak berjalan?', dataset_id: doc.body.id });
    assert.match(docQ.text, /Dari permintaan\.pdf:[\s\S]*12 bulan/);
    assert.ok(docQ.evidence.some(e => e.type === 'document' && /hal\. 1/.test(e.title)));
    const tooMuch = await uploadFile(request, 'x.pdf', Buffer.alloc(9 * 1024 * 1024), 'application/pdf');
    assert.equal(tooMuch.status, 413);

    // Name resolution: legal forms are ignored; a typo still finds the client (fuzzy with pg_trgm, any-term without).
    const legal = await run(request, 'ask', { query: 'PT Synthetic Import Tbk' });
    assert.ok(legal.evidence.some(e => /Synthetic Import/.test(e.title)), legal.text);
    const typo = await run(request, 'ask', { query: 'Sinthetic Import' });
    assert.ok(typo.evidence.some(e => /Synthetic Import/.test(e.title)), typo.text);
    assert.match(typo.text, /cocok sebagian/);
    console.log('PASS: Agent proposals — follow-up (signal → proposal → confirm → receipt → signal cleared → outcome) and import (file → mapping → per-row validation → confirm → learned mapping)');
  } finally {
    await brain.end();
  }
}
