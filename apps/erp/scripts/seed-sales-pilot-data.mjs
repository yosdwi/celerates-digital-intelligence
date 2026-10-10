// Synthetic Sales data for the pilot (Wave 1). Explicit, idempotent and removable; NOT a migration.
//   ALLOW_PILOT_SEED_DATA=1 DATABASE_URL=... node scripts/seed-sales-pilot-data.mjs [--count 300] [--converted 40]
//   ALLOW_PILOT_SEED_DATA=1 DATABASE_URL=... node scripts/seed-sales-pilot-data.mjs --remove
// Every row is recognisable: tracker/opportunity opty_no = OPTYyyyy-S###, requisition_no = REQ-yyyy-S###,
// tracker progress_notes starts with MARK, client code starts with SEED-. --remove deletes only those rows.
// Converted rows are written exactly like convertToRequisition (src/app/sales/opportunity-tracker/actions.ts):
// one transaction, same opty_no, the unique indexes from migration 0013 still apply.
// Some trackers deliberately fail the Sales handoff guard (not qualified, no position, headcount 0) so the
// guard can be exercised by hand. Data only; no activity-log rows are written.
//
// Journey (QA 2026-10-08, "test dari hulu ke hilir"): the same seeded clients also get the downstream records so every
// page on the way has data, and some records stop at each hand-off so it can be done by hand:
//   Account (CRM) crm_clients + contacts + activities, same names as the trackers (Account 360 matches by client_name)
//   Client Active  candidates + applications on the converted requisitions, client submission statuses
//   TA Onboarding  onboarding_requests; some left un-promoted (Promote by hand)
//   HR / TM        employees (+ contract, BPJS rows like promoteToEmployee); some left without a talent assignment
//                  (TM "Perlu ditindaklanjuti"), the rest on_project with COGS components
//   OT & BT        claims across draft, forwarded_to_sales, submitted_to_finance, invoiced
//   Profitability  not written: "Sync dari Talents Book" on the page computes it from the assignments, as in real use
// Markers: crm_clients.notes, candidates/applications/onboarding_requests/talent_assignments/claims .notes start with
// MARK; candidate_no SEED-C####, employee_no SEED-MTG-###, claim_no OT-SEED-####. --remove deletes them first, with the
// rows the app made on top of them while testing (contracts, BPJS, invoices, extension requests…).
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

// ---- Journey: Account (CRM) → Client Active → Onboarding → Employee → Talent assignment → OT & BT -------------------
const INDUSTRY = { 'Nusantara Digital Prima': 'Teknologi', 'Garuda Teknologi Utama': 'Teknologi', 'Samudra Logistik Mandiri': 'Logistik',
  'Bumi Energi Lestari': 'Energi', 'Cakra Finansial Indonesia': 'Jasa Keuangan', 'Duta Retail Sejahtera': 'Retail',
  'Elang Telekomunikasi': 'Telekomunikasi', 'Fajar Manufaktur Jaya': 'Manufaktur', 'Gita Kesehatan Nusantara': 'Kesehatan',
  'Harapan Properti Raya': 'Properti', 'Indah Media Kreasi': 'Media', 'Jaya Konstruksi Perkasa': 'Konstruksi',
  'Kencana Perbankan Digital': 'Perbankan', 'Lintas Transportasi Bersama': 'Transportasi', 'Mitra Agro Makmur': 'Agribisnis' };
const FIRST = ['Adi', 'Bayu', 'Citra', 'Dimas', 'Eka', 'Fitri', 'Galih', 'Hana', 'Indra', 'Joko', 'Kirana', 'Laras', 'Made', 'Nadia',
  'Oki', 'Putri', 'Raka', 'Sinta', 'Teguh', 'Utami', 'Wahyu', 'Yuni', 'Zaki', 'Ayu', 'Bima', 'Dewanti', 'Fajar', 'Gilang'];
const LAST = ['Pratama', 'Wijaya', 'Saputra', 'Lestari', 'Nugroho', 'Hidayat', 'Kusuma', 'Santoso', 'Permata', 'Siregar', 'Halim',
  'Rahman', 'Wibowo', 'Utomo', 'Purnama', 'Setiawan'];
const CONTACT_ROLES = ['HR Manager', 'Procurement Lead', 'IT Director', 'Head of Engineering', 'Talent Acquisition Lead', 'VP Operations'];
const TA_PICS = ['Sari TA (seed)', 'Yoga TA (seed)'];
const PMO_PICS = ['Nina PMO (seed)', 'Rudi PMO (seed)'];
const ACTIVITIES = [
  ['call', 'Discovery call kebutuhan tim', 'Bahas rencana rekrutmen kuartal depan dan skill yang paling mendesak.'],
  ['meeting', 'Meeting presentasi layanan', 'Presentasi outsourcing dan managed service; klien minta contoh profil kandidat.'],
  ['email', 'Kirim proposal harga', 'Proposal rate card per level dikirim; menunggu review procurement.'],
  ['email', 'Follow-up proposal', 'Tanya status review; procurement minta revisi termin pembayaran.'],
  ['call', 'Negosiasi rate', 'Klien minta diskon 5% untuk kontrak 12 bulan.'],
  ['meeting', 'Kick-off penempatan talent', 'Sepakati jadwal onboarding dan akses kantor untuk talent.'],
  ['note', 'Catatan account', 'Budget tahun depan dibuka bulan Januari; jaga komunikasi dengan HR Manager.'],
  ['call', 'Check-in kepuasan klien', 'Klien puas dengan talent yang ditempatkan; ada peluang tambah 2 HC.'],
];
const slug = (name) => name.toLowerCase().replace(/[^a-z]+/g, '');
const personName = () => `${pick(FIRST)} ${pick(LAST)}`;
// Hiring status → what the client side shows (Client Active), per V1's meaning of each stage.
const SUBMISSION = { cv_sent: null, hr_interview: null, tech_test: 'sent_to_client', user_interview: 'client_interview',
  offering: 'client_accepted', mcu_process: 'client_accepted', onboarding: 'client_accepted', offering_hold: 'on_hold',
  reject_cv: 'client_rejected', reject_user_interview: 'client_rejected', failed_tech_test: null };

async function seedJourney(tx) {
  const out = { accounts: 0, contacts: 0, activities: 0, candidates: 0, applications: 0, onboarding: 0, employees: 0, assignments: 0, claims: 0 };

  // Account (CRM): one per seeded client, status from its pipeline (a win → active, nothing for 45+ days → dormant).
  for (const name of CLIENTS) {
    const full = `PT ${name} (seed)`;
    const [found] = await tx`SELECT id FROM crm_clients WHERE name = ${full}`;
    if (found) continue;
    const [{ wins, latest }] = await tx`SELECT count(*) FILTER (WHERE opty_status_code = 'win')::int AS wins, max(created_at) AS latest
      FROM sales_opportunity_trackers WHERE client_name = ${full}`;
    const status = wins > 0 ? 'active' : latest && Date.now() - new Date(latest).getTime() > 45 * 86_400_000 ? 'dormant' : 'prospect';
    const [acc] = await tx`INSERT INTO crm_clients (name, industry, status_code, notes, created_by_name, created_at)
      VALUES (${full}, ${INDUSTRY[name]}, ${status}, ${`${MARK} Klien sintetis untuk uji pilot.`}, ${pick(PICS)}, ${daysAgo(60 + Math.floor(rnd() * 120))}) RETURNING id`;
    out.accounts++;
    const contacts = [];
    for (let i = 0, n = 1 + Math.floor(rnd() * 3); i < n; i++) {
      const cname = personName();
      const [c] = await tx`INSERT INTO crm_client_contacts (client_id, name, role_title, email, phone, is_primary)
        VALUES (${acc.id}, ${cname}, ${pick(CONTACT_ROLES)}, ${`${slug(cname.split(' ')[0])}@${slug(name)}.example`},
          ${`+62 812 0000 ${String(1000 + Math.floor(rnd() * 9000))}`}, ${i === 0}) RETURNING id`;
      contacts.push(c.id);
      out.contacts++;
    }
    for (let i = 0, n = 3 + Math.floor(rnd() * 5); i < n; i++) {
      const [type, title, description] = pick(ACTIVITIES);
      await tx`INSERT INTO crm_client_activities (client_id, contact_id, type_code, title, description, activity_date, created_by_name)
        VALUES (${acc.id}, ${type === 'note' ? null : pick(contacts)}, ${type}, ${title}, ${description}, ${day(daysAgo(Math.floor(rnd() * 75)))}, ${pick(PICS)})`;
      out.activities++;
    }
  }

  // The rest hangs off the converted requisitions; seeded once (re-runs keep what testing has changed since).
  const [{ seeded }] = await tx`SELECT count(*)::int AS seeded FROM candidates WHERE candidate_no LIKE 'SEED-C%'`;
  if (seeded) return { ...out, note: 'candidates already seeded; downstream skipped' };
  const reqs = await tx`SELECT r.id, r.client_name, r.position_name, r.level_code, r.headcount_target, r.price_amount, r.ta_pic_name,
      t.opty_status_code AS status, o.id AS pq_id
    FROM requisitions r JOIN sales_opportunity_trackers t ON t.id = r.opportunity_id
    LEFT JOIN opportunities o ON o.opportunity_tracker_id = t.id
    WHERE t.progress_notes LIKE ${MARK + '%'} ORDER BY r.requisition_no`;
  let cand = 0, emp = 0, claim = 0;
  const placed = [];
  for (const r of reqs) {
    // A won deal has its first candidate already placed; the others spread over the pipeline.
    const statuses = [];
    for (let i = 0, n = r.status === 'win' ? Math.min(3, Math.max(1, r.headcount_target)) : 0; i < n; i++) statuses.push('onboarding');
    for (let i = statuses.length, n = 2 + Math.floor(rnd() * 3); i < n; i++) {
      statuses.push(weighted([['cv_sent', 20], ['hr_interview', 15], ['tech_test', 15], ['user_interview', 15], ['offering', 8],
        ['offering_hold', 4], ['onboarding', 5], ['reject_cv', 8], ['failed_tech_test', 5], ['reject_user_interview', 5]]));
    }
    for (const hiring of statuses) {
      const name = personName();
      const ta = pick(TA_PICS);
      const created = daysAgo(Math.floor(rnd() * 40));
      const [c] = await tx`INSERT INTO candidates (candidate_no, candidate_name, position_name, level_code, wa_number, email,
          current_salary_amount, expected_salary_amount, ta_pic_name, candidate_source_code, notes, candidate_date, created_at)
        VALUES (${`SEED-C${String(++cand).padStart(4, '0')}`}, ${name}, ${r.position_name}, ${r.level_code},
          ${`+62 813 0000 ${String(1000 + Math.floor(rnd() * 9000))}`}, ${`${slug(name)}.${cand}@mail.example`},
          ${(6 + Math.floor(rnd() * 14)) * 1_000_000}, ${(8 + Math.floor(rnd() * 16)) * 1_000_000}, ${ta},
          ${pick(['linkedin_job_portal', 'glints', 'referral', 'database', 'kalibrr'])}, ${`${MARK} Kandidat sintetis.`}, ${day(created)}, ${created}) RETURNING id`;
      out.candidates++;
      const sub = SUBMISSION[hiring] ?? null;
      const [a] = await tx`INSERT INTO applications (application_date, requisition_id, candidate_id, level_code, ta_pic_name, price_amount,
          hiring_status_code, notes, client_submission_status_code, client_submission_updated_at, client_submission_updated_by_name,
          client_submission_note, created_at)
        VALUES (${day(created)}, ${r.id}, ${c.id}, ${r.level_code}, ${ta}, ${r.price_amount}, ${hiring}, ${`${MARK}`},
          ${sub}, ${sub ? daysAgo(Math.floor(rnd() * 10)) : null}, ${sub ? pick(PICS) : null},
          ${sub === 'client_rejected' ? 'Klien memilih kandidat dengan pengalaman domain lebih kuat.' : sub === 'on_hold' ? 'Budget klien sedang direview.' : null},
          ${created}) RETURNING id`;
      out.applications++;
      if (hiring !== 'onboarding') continue;

      // TA Onboarding with everything Promote needs; every fifth one is left for Promote by hand.
      const start = daysAgo(Math.floor(rnd() * 90));
      // Monthly figures (the tracker's price may be per day, project or year): salary 7–25 juta, salary at 50–75% of price,
      // ratio, so Profitability shows healthy, thin and a few negative margins after COGS.
      const salary = Math.round((7 + rnd() * 18) * 10) * 100_000;
      const price = Math.round(salary / (0.5 + rnd() * 0.25) / 100_000) * 100_000;
      const gender = pick(['male', 'female']);
      const [ob] = await tx`INSERT INTO onboarding_requests (candidate_id, requisition_id, ta_pic_name, salary_deal_amount, employee_status_code,
          start_date, end_date, employment_type_code, employee_category_code, job_level_code, company_email, gender_code, religion_code,
          ptkp_code, price_amount, basic_salary_amount, notes)
        VALUES (${c.id}, ${r.id}, ${ta}, ${salary}, 'new_hire', ${day(start)}, ${day(new Date(start.getTime() + 365 * 86_400_000))}, 'pkwt',
          'talent', 'staff', ${`${slug(name)}.${cand}@celerates.example`}, ${gender}, ${pick(['islam', 'kristen', 'katolik', 'hindu', 'buddha'])},
          ${pick(['tk0', 'tk0', 'k0', 'k1'])}, ${price}, ${salary}, ${`${MARK} Onboarding sintetis.`}) RETURNING id, ptkp_code`;
      out.onboarding++;
      if (out.onboarding % 5 === 0) continue;

      // Employee, as promoteToEmployee writes it (contract + both BPJS rows).
      const [e] = await tx`INSERT INTO employees (onboarding_request_id, employee_no, employee_category_code, job_level_code, position_name,
          company_email, join_date, gender_code, religion_code, ptkp_code, ptkp_effective_year, notes)
        VALUES (${ob.id}, ${`SEED-MTG-${String(++emp).padStart(3, '0')}`}, 'talent', 'staff', ${r.position_name},
          ${`${slug(name)}.${cand}@celerates.example`}, ${day(start)}, ${gender}, 'islam', ${ob.ptkp_code}, ${YEAR}, ${`${MARK}`}) RETURNING id`;
      await tx`INSERT INTO employment_contracts (employee_id, contract_no, start_date, end_date, employment_type_code)
        VALUES (${e.id}, ${`SEED-${String(emp).padStart(3, '0')}/PKWT/MTG.01/${YEAR}`}, ${day(start)}, ${day(new Date(start.getTime() + 365 * 86_400_000))}, 'pkwt')`;
      await tx`INSERT INTO bpjs_registrations (employee_id, scheme, status_code) VALUES (${e.id}, 'kesehatan', 'belum_terdaftar'), (${e.id}, 'ketenagakerjaan', 'belum_terdaftar')`;
      out.employees++;
      if (emp % 4 === 0) continue; // TM "Perlu ditindaklanjuti": promoted, no talent assignment yet

      // Talent assignment with COGS components, so Profitability's Sync has something to compute.
      const [ta2] = await tx`INSERT INTO talent_assignments (employee_id, requisition_id, pq_tracker_id, start_date, end_date, status_code,
          talent_track_code, price_amount, basic_salary_amount, transport_allowance_amount, project_allowance_amount,
          thr_allowance_amount, annual_medical_reimbursement_amount, notes)
        VALUES (${e.id}, ${r.id}, ${r.pq_id}, ${day(start)}, ${day(new Date(start.getTime() + 365 * 86_400_000))}, 'on_project',
          ${pick(['pm', 'sad', 'bdcs', 'das'])}, ${price}, ${salary}, ${500_000}, ${pick([0, 750_000, 1_000_000])},
          ${Math.round(salary / 12)}, ${250_000}, ${`${MARK}`}) RETURNING id`;
      out.assignments++;
      placed.push({ employee: e.id, pq: r.pq_id, salary, client: r.client_name });
    }
  }

  // OT & BT: one to three claims per placed talent, spread along PMO → Sales → Finance → Invoiced.
  const ym = `${YEAR}${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  for (const p of placed) {
    for (let i = 0, n = 1 + Math.floor(rnd() * 3); i < n; i++) {
      const type = weighted([['overtime', 50], ['business_trip', 25], ['reimbursement', 10], ['medical_claim', 8], ['ganti_hari', 7]]);
      const status = weighted([['draft', 30], ['forwarded_to_sales', 30], ['submitted_to_finance', 25], ['invoiced', 15]]);
      const start = daysAgo(5 + Math.floor(rnd() * 50));
      const days = type === 'business_trip' ? 2 + Math.floor(rnd() * 4) : 1 + Math.floor(rnd() * 3);
      const hours = type === 'overtime' ? 4 + Math.floor(rnd() * 20) : null;
      const hourly = Math.round(p.salary / 173);
      const saku = type === 'business_trip' ? days * 350_000 : 0;
      const transport = type === 'business_trip' ? 1_200_000 + Math.floor(rnd() * 8) * 250_000 : 0;
      const etc = ['reimbursement', 'medical_claim'].includes(type) ? (2 + Math.floor(rnd() * 12)) * 100_000 : 0;
      const toTalent = (hours ? hours * hourly * 1.5 : 0) + saku + transport + etc;
      const toClient = Math.round(toTalent * 1.15);
      const done = ['submitted_to_finance', 'invoiced'].includes(status);
      const title = { overtime: `Lembur ${hours} jam`, business_trip: `Perjalanan dinas ${days} hari`, reimbursement: 'Reimburse perangkat kerja',
        medical_claim: 'Klaim rawat jalan', ganti_hari: 'Ganti hari kerja akhir pekan' }[type];
      await tx`INSERT INTO overtime_business_trip_claims (claim_no, opportunity_id, employee_id, claim_type_code, claim_title, days_count,
          start_date, end_date, duration_hours_client, duration_hours_pmo_basic, duration_hours_payroll, pq_submit_date, pq_status_code,
          po_status_code, cr_status_code, pic_1_name, pic_2_name, amount_given_to_talent_initial, amount_claim_to_client_total,
          amount_uang_saku_celerates, amount_transport, amount_etc, amount_total_given_to_talent, talent_payment_status_code,
          talent_payment_date, invoice_no, amount_total_billed_to_client, billing_status_code, status_code, notes, created_by_name, created_at)
        VALUES (${`OT-SEED-${String(++claim).padStart(4, '0')}`}, ${p.pq}, ${p.employee}, ${type}, ${title}, ${days},
          ${day(start)}, ${day(new Date(start.getTime() + (days - 1) * 86_400_000))}, ${hours}, ${hours}, ${hours},
          ${status === 'draft' ? null : day(daysAgo(Math.floor(rnd() * 5)))}, ${status === 'draft' ? 'not_started' : done ? 'done' : 'on_progress'},
          ${done ? 'done' : 'not_started'}, ${status === 'invoiced' ? 'done' : 'not_started'}, ${pick(PMO_PICS)}, ${status === 'draft' ? null : pick(PICS)},
          ${saku + transport || null}, ${toClient}, ${saku || null}, ${transport || null}, ${etc || null}, ${Math.round(toTalent)},
          ${done ? pick(['done', 'pending']) : 'pending'}, ${done ? day(daysAgo(2)) : null},
          ${status === 'invoiced' ? `INV-SEED-${ym}-${String(claim).padStart(4, '0')}` : null}, ${status === 'invoiced' ? toClient : null},
          ${status === 'invoiced' ? 'done' : status === 'submitted_to_finance' ? 'on_progress' : 'not_started'}, ${status},
          ${`${MARK} Klaim sintetis untuk ${p.client}.`}, ${pick(PMO_PICS)}, ${start})`;
      out.claims++;
    }
  }
  return out;
}

// Deletes the journey rows and anything the app attached to them while testing, children first.
async function removeJourney(tx, trackerIds) {
  const like = MARK + '%';
  const reqIds = trackerIds.length ? (await tx`SELECT id FROM requisitions WHERE opportunity_id = ANY(${trackerIds})`).map((r) => r.id) : [];
  const pqIds = trackerIds.length ? (await tx`SELECT id FROM opportunities WHERE opportunity_tracker_id = ANY(${trackerIds})`).map((r) => r.id) : [];
  const candIds = (await tx`SELECT id FROM candidates WHERE candidate_no LIKE 'SEED-C%' OR notes LIKE ${like}`).map((r) => r.id);
  const obIds = (await tx`SELECT id FROM onboarding_requests WHERE notes LIKE ${like} OR candidate_id = ANY(${candIds}) OR requisition_id = ANY(${reqIds})`).map((r) => r.id);
  const empIds = (await tx`SELECT id FROM employees WHERE employee_no LIKE 'SEED-MTG-%' OR onboarding_request_id = ANY(${obIds})`).map((r) => r.id);
  const taIds = (await tx`SELECT id FROM talent_assignments WHERE employee_id = ANY(${empIds}) OR requisition_id = ANY(${reqIds}) OR pq_tracker_id = ANY(${pqIds})`).map((r) => r.id);
  const n = {};
  const del = async (key, q) => { n[key] = (await q).length; };
  await del('profitability', tx`DELETE FROM profitability_entries WHERE talent_assignment_id = ANY(${taIds}) OR employee_id = ANY(${empIds}) RETURNING id`);
  await del('claims', tx`DELETE FROM overtime_business_trip_claims WHERE claim_no LIKE 'OT-SEED-%' OR employee_id = ANY(${empIds}) OR opportunity_id = ANY(${pqIds}) RETURNING id`);
  await del('assignments', tx`DELETE FROM talent_assignments WHERE id = ANY(${taIds}) RETURNING id`);
  await del('extensions', tx`DELETE FROM extension_increment_requests WHERE employee_id = ANY(${empIds}) OR requisition_id = ANY(${reqIds}) OR pq_tracker_id = ANY(${pqIds}) RETURNING id`);
  for (const t of ['project_invoices', 'project_contracts', 'project_documents', 'finance_document_handoffs']) {
    await del(t, tx`DELETE FROM ${tx(t)} WHERE opportunity_id = ANY(${pqIds}) RETURNING id`);
  }
  await del('contracts', tx`DELETE FROM employment_contracts WHERE employee_id = ANY(${empIds}) RETURNING id`);
  await del('bpjs', tx`DELETE FROM bpjs_registrations WHERE employee_id = ANY(${empIds}) RETURNING id`);
  await del('identity_links', tx`DELETE FROM talent_identity_links WHERE erp_employee_id = ANY(${empIds}) RETURNING id`);
  await del('identity_documents', tx`DELETE FROM identity_documents WHERE subject_employee_id = ANY(${empIds}) OR subject_onboarding_id = ANY(${obIds}) RETURNING id`);
  await del('employees', tx`DELETE FROM employees WHERE id = ANY(${empIds}) RETURNING id`);
  await tx`UPDATE opportunities SET onboarding_request_id = NULL WHERE onboarding_request_id = ANY(${obIds})`;
  await del('generated_docs', tx`DELETE FROM automation_generated_documents WHERE onboarding_request_id = ANY(${obIds}) RETURNING id`);
  await del('onboarding', tx`DELETE FROM onboarding_requests WHERE id = ANY(${obIds}) RETURNING id`);
  await del('applications', tx`DELETE FROM applications WHERE candidate_id = ANY(${candIds}) OR requisition_id = ANY(${reqIds}) RETURNING id`);
  await del('candidates', tx`DELETE FROM candidates WHERE id = ANY(${candIds}) RETURNING id`);
  const accIds = (await tx`SELECT id FROM crm_clients WHERE notes LIKE ${like}`).map((r) => r.id);
  if ((await tx`SELECT to_regclass('public.crm_emails') AS t`)[0].t) {
    await del('emails', tx`DELETE FROM crm_emails WHERE client_id = ANY(${accIds}) RETURNING id`);
  }
  await del('activities', tx`DELETE FROM crm_client_activities WHERE client_id = ANY(${accIds}) RETURNING id`);
  await del('contacts', tx`DELETE FROM crm_client_contacts WHERE client_id = ANY(${accIds}) RETURNING id`);
  await del('accounts', tx`DELETE FROM crm_clients WHERE id = ANY(${accIds}) RETURNING id`);
  return n;
}

const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 10 });
try {
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(731882003)`;

    if (remove) {
      const trackerIds = (await tx`SELECT id FROM sales_opportunity_trackers WHERE progress_notes LIKE ${MARK + '%'}`).map((r) => r.id);
      const journey = await removeJourney(tx, trackerIds);
      console.log(`removed journey: ${JSON.stringify(journey)}`);
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
    console.log(`journey: ${JSON.stringify(await seedJourney(tx))}`);
  });
} catch (error) {
  await sql.end();
  fail(`Seed failed: ${error instanceof Error ? error.message : 'unknown error'}`);
}
await sql.end();
