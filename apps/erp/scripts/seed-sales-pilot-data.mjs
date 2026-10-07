// Synthetic Sales data for the pilot (Wave 1). Explicit, idempotent and removable; NOT a migration.
//   ALLOW_PILOT_SEED_DATA=1 DATABASE_URL=... node scripts/seed-sales-pilot-data.mjs [--count 300] [--converted 40]
//   ALLOW_PILOT_SEED_DATA=1 DATABASE_URL=... node scripts/seed-sales-pilot-data.mjs --remove
// Every row is recognisable: tracker/opportunity opty_no = OPTYyyyy-S###, requisition_no = REQ-yyyy-S###,
// tracker progress_notes starts with MARK, client code starts with SEED-. --remove deletes only those rows.
// Converted rows are written exactly like convertToRequisition (src/app/sales/opportunity-tracker/actions.ts):
// one transaction, same opty_no, the unique indexes from migration 0013 still apply.
// Some trackers deliberately fail the Sales handoff guard (not qualified, no position, headcount 0) so the
// guard can be exercised by hand. Data only; no activity-log rows are written.
import postgres from 'postgres';

const MARK = '[SEED pilot]';
const YEAR = new Date().getFullYear();
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? Number(process.argv[i + 1]) : fallback;
};
const remove = process.argv.includes('--remove');
const count = arg('count', 300);
const converted = arg('converted', 40);

function fail(message) { console.error(message); process.exit(1); }
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) fail('DATABASE_URL is required.');
if (process.env.ALLOW_PILOT_SEED_DATA !== '1') fail('Set ALLOW_PILOT_SEED_DATA=1 to confirm this is the pilot, not production data.');
if (!Number.isInteger(count) || count < 1 || count > 5000) fail('--count must be 1..5000.');
if (!Number.isInteger(converted) || converted < 0 || converted > count) fail('--converted must be 0..count.');

// Deterministic: the same arguments always produce the same rows.
let state = 20261007;
const rnd = () => { state = (state + 0x6d2b79f5) | 0; let t = Math.imul(state ^ (state >>> 15), 1 | state); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (list) => list[Math.floor(rnd() * list.length)];
const weighted = (pairs) => { let r = rnd() * pairs.reduce((s, [, w]) => s + w, 0); for (const [v, w] of pairs) if ((r -= w) < 0) return v; return pairs[0][0]; };
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000);
const day = (d) => d.toISOString().slice(0, 10);

const CLIENTS = ['Nusantara Digital Prima', 'Garuda Teknologi Utama', 'Samudra Logistik Mandiri', 'Bumi Energi Lestari', 'Cakra Finansial Indonesia',
  'Duta Retail Sejahtera', 'Elang Telekomunikasi', 'Fajar Manufaktur Jaya', 'Gita Kesehatan Nusantara', 'Harapan Properti Raya',
  'Indah Media Kreasi', 'Jaya Konstruksi Perkasa', 'Kencana Perbankan Digital', 'Lintas Transportasi Bersama', 'Mitra Agro Makmur'];
const POSITIONS = ['Software Engineer', 'Data Analyst', 'QA Engineer', 'DevOps Engineer', 'Project Manager', 'UI/UX Designer',
  'Business Analyst', 'IoT Technician', 'Network Engineer', 'Customer Support', 'Data Engineer', 'Scrum Master'];
const SERVICES = ['outsourcing', 'headhunting', 'outplacement', 'managed_service', 'project_based', 'rpo'];
const LEVELS = ['internship', 'entry_level', 'junior', 'middle', 'senior', 'lead', 'manager'];
const PICS = ['Rina Sales (seed)', 'Bagas Sales (seed)', 'Dewi Sales (seed)', 'Andi Sales (seed)'];
const PERIODS = ['monthly', 'project', 'yearly', 'daily'];
const STATUSES = [['cv_submission', 25], ['solutioning', 25], ['proposal_sent', 20], ['win', 15], ['dropped', 10], ['need_action', 5]];

const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 10 });
try {
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(731882003)`;

    if (remove) {
      const trackerIds = (await tx`SELECT id FROM sales_opportunity_trackers WHERE progress_notes LIKE ${MARK + '%'}`).map((r) => r.id);
      let reqs = 0, optys = 0;
      if (trackerIds.length) {
        reqs = (await tx`DELETE FROM requisitions WHERE opportunity_id = ANY(${trackerIds}) RETURNING id`).length;
        optys = (await tx`DELETE FROM opportunities WHERE opportunity_tracker_id = ANY(${trackerIds}) RETURNING id`).length;
      }
      const trackers = (await tx`DELETE FROM sales_opportunity_trackers WHERE progress_notes LIKE ${MARK + '%'} RETURNING id`).length;
      const clients = (await tx`DELETE FROM clients WHERE code LIKE 'SEED-%' RETURNING id`).length;
      console.log(`removed: trackers=${trackers} requisitions=${reqs} pq_trackers=${optys} clients=${clients}`);
      return;
    }

    let clientsAdded = 0;
    for (const [i, name] of CLIENTS.entries()) {
      const code = `SEED-${String(i + 1).padStart(2, '0')}`;
      const [found] = await tx`SELECT id FROM clients WHERE code = ${code}`;
      if (!found) { await tx`INSERT INTO clients (name, code) VALUES (${'PT ' + name + ' (seed)'}, ${code})`; clientsAdded++; }
    }

    const made = [];
    for (let n = 1; n <= count; n++) {
      const optyNo = `OPTY${YEAR}-S${String(n).padStart(3, '0')}`;
      const clientName = `PT ${pick(CLIENTS)} (seed)`;
      const status = weighted(STATUSES);
      // Handoff-guard cases: ~15% not qualified, ~8% qualified without position, ~4% qualified with headcount 0.
      const kind = weighted([['ready', 73], ['not_qualified', 15], ['no_position', 8], ['zero_headcount', 4]]);
      const qualified = kind !== 'not_qualified';
      const position = kind === 'no_position' ? null : pick(POSITIONS);
      const headcount = kind === 'zero_headcount' ? 0 : 1 + Math.floor(rnd() * 12);
      const price = (4 + Math.floor(rnd() * 26)) * 1_000_000;
      const age = Math.floor(rnd() * 60);
      const row = {
        opty_no: optyNo, sales_qualified: qualified, client_name: clientName,
        service_type_code: pick(SERVICES), requirement_summary: `Kebutuhan ${position ?? 'tenaga ahli'} untuk ${clientName}`,
        opty_status_code: status, progress_notes: `${MARK} case=${kind}`,
        estimated_deal_amount: price * headcount, detail_requirement: 'Data sintetis untuk uji pilot; boleh diubah atau dihapus.',
        client_type_code: pick(['existing', 'new']), sales_pic_name: pick(PICS),
        last_communication_date: day(daysAgo(Math.floor(rnd() * 30))), bante_score: 1 + Math.floor(rnd() * 5),
        dropped_reason: status === 'dropped' ? pick(['Budget klien dibekukan', 'Kalah harga', 'Proyek ditunda']) : null,
        created_at: daysAgo(age), position_name: position, level_code: pick(LEVELS), headcount_target: headcount,
        price_amount: price, price_period_code: pick(PERIODS), estimated_duration_months: pick([3, 6, 12, 24]),
      };
      const [inserted] = await tx`INSERT INTO sales_opportunity_trackers ${tx(row)} ON CONFLICT (opty_no) DO NOTHING RETURNING id`;
      if (inserted) made.push({ id: inserted.id, row, kind, status, age });
    }

    // Convert the first `converted` ready trackers that are win / proposal_sent, like convertToRequisition does.
    let done = 0;
    const [{ existingConverted }] = await tx`SELECT count(*)::int AS "existingConverted" FROM requisitions r
      JOIN sales_opportunity_trackers t ON t.id = r.opportunity_id WHERE t.progress_notes LIKE ${MARK + '%'}`;
    for (const t of made.filter((m) => m.kind === 'ready' && ['win', 'proposal_sent'].includes(m.status))) {
      if (existingConverted + done >= converted) break;
      const requestDate = day(daysAgo(Math.max(0, t.age - 1)));
      const seq = String(existingConverted + done + 1).padStart(3, '0');
      await tx`INSERT INTO requisitions (requisition_no, opportunity_id, opty_request_date, client_name, position_name, service_type_code,
          level_code, headcount_target, priority_code, price_amount, estimated_duration_months, ta_pic_name, sales_pic_name, notes, created_at)
        VALUES (${`REQ-${YEAR}-S${seq}`}, ${t.id}, ${requestDate}, ${t.row.client_name}, ${t.row.position_name}, ${t.row.service_type_code},
          ${t.row.level_code}, ${t.row.headcount_target}, 'p2', ${t.row.price_amount}, ${t.row.estimated_duration_months},
          'Belum Ditentukan', ${t.row.sales_pic_name}, ${t.row.requirement_summary}, ${daysAgo(Math.max(0, t.age - 1))})`;
      await tx`INSERT INTO opportunities (opty_no, opty_request_date, client_name, client_type_code, project_name, position_name, service_type_code,
          level_code, headcount_target, priority_code, bant_score, price_amount, estimated_duration_months, sales_pic_name, pipeline_stage_code,
          opportunity_tracker_id, created_at)
        VALUES (${t.row.opty_no}, ${requestDate}, ${t.row.client_name}, ${t.row.client_type_code}, ${t.row.position_name}, ${t.row.position_name},
          ${t.row.service_type_code}, ${t.row.level_code}, ${t.row.headcount_target}, 'p2', ${t.row.bante_score}, ${t.row.price_amount},
          ${t.row.estimated_duration_months}, ${t.row.sales_pic_name}, 'on_going', ${t.id}, ${daysAgo(Math.max(0, t.age - 1))})`;
      done++;
    }
    const kinds = made.reduce((a, m) => ((a[m.kind] = (a[m.kind] ?? 0) + 1), a), {});
    console.log(`seeded: clients+${clientsAdded} trackers+${made.length} converted+${done} cases=${JSON.stringify(kinds)}`);
  });
} catch (error) {
  await sql.end();
  fail(`Seed failed: ${error instanceof Error ? error.message : 'unknown error'}`);
}
await sql.end();
