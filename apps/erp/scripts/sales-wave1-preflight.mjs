import postgres from 'postgres';

const requiredDomains = ['celerates.com', 'celerates.co.id'];
const blockers = [];
const warnings = [];
const facts = [];

function addBlocker(message) { blockers.push(message); }
function addWarning(message) { warnings.push(message); }
function addFact(message) { facts.push(message); }

function redactUrl(value) {
  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password) {
      parsed.username = '***';
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return '<invalid URL>';
  }
}

function validateEnvironment() {
  const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!databaseUrl) addBlocker('DATABASE_URL or DIRECT_URL is required.');
  else addFact(`Database target: ${redactUrl(databaseUrl)}`);

  const domains = (process.env.AUTH_EMAIL_DOMAINS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const domainSet = new Set(domains);
  if (requiredDomains.some((domain) => !domainSet.has(domain)) || domainSet.size !== requiredDomains.length) {
    addBlocker(`AUTH_EMAIL_DOMAINS must be exactly ${requiredDomains.join(',')}.`);
  } else {
    addFact(`Corporate mailbox domains: ${requiredDomains.join(', ')}`);
  }

  let nextAuth;
  try {
    nextAuth = new URL(process.env.NEXTAUTH_URL || '');
  } catch {
    addBlocker('NEXTAUTH_URL must be a valid canonical HTTPS URL.');
  }
  if (nextAuth) {
    if (nextAuth.protocol !== 'https:') addBlocker('NEXTAUTH_URL must use HTTPS for the pilot.');
    if (nextAuth.pathname !== '/' || nextAuth.search || nextAuth.hash) {
      addBlocker('NEXTAUTH_URL must be the canonical origin with no path, query, or fragment.');
    }
    if (['localhost', '127.0.0.1', '::1'].includes(nextAuth.hostname)) {
      addBlocker('NEXTAUTH_URL must use the real pilot hostname, not localhost.');
    }
    addFact(`Canonical ERP origin: ${nextAuth.origin}`);

    const rpId = (process.env.PASSKEY_RP_ID || '').trim().toLowerCase();
    if (!rpId) addBlocker('PASSKEY_RP_ID must be explicit for the pilot cut-over.');
    else if (rpId !== nextAuth.hostname.toLowerCase()) {
      addBlocker(`PASSKEY_RP_ID must equal NEXTAUTH_URL hostname (${nextAuth.hostname}).`);
    }

    const passkeyOrigin = (process.env.PASSKEY_ORIGIN || '').trim();
    if (!passkeyOrigin) addBlocker('PASSKEY_ORIGIN must be explicit for the pilot cut-over.');
    else if (passkeyOrigin !== nextAuth.origin) {
      addBlocker(`PASSKEY_ORIGIN must equal NEXTAUTH_URL origin (${nextAuth.origin}).`);
    }
  }

  if ((process.env.PASSKEY_RP_NAME || '').trim() !== 'Celerates ERP') {
    addBlocker('PASSKEY_RP_NAME must be "Celerates ERP".');
  }
  if ((process.env.NEXTAUTH_SECRET || '').length < 32) {
    addBlocker('NEXTAUTH_SECRET must contain at least 32 characters.');
  }
  if (!/^[a-f0-9]{64}$/i.test(process.env.PII_ENCRYPTION_KEY || '')) {
    addBlocker('PII_ENCRYPTION_KEY must be 32 bytes encoded as 64 hex characters.');
  }
  if ((process.env.AUTH_EMAIL_OTP || '').toLowerCase() === 'off') {
    addBlocker('AUTH_EMAIL_OTP=off is not allowed for the real-user pilot.');
  }
  for (const name of ['S3_ENDPOINT', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']) {
    if (!process.env[name]) addBlocker(`${name} is required by the ERP runtime.`);
  }
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    addWarning('SMTP_HOST/SMTP_USER are incomplete; mailbox bootstrap/recovery must be rechecked before onboarding users.');
  }
}

async function inspectDatabase() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) return;
  const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 10 });
  try {
    const [version] = await sql`SELECT current_database() AS database, current_user AS username, version() AS version`;
    addFact(`Connected database: ${version.database} as ${version.username}`);

    const [objects] = await sql`
      SELECT
        to_regclass('public.erp_migrations')::text AS migrations,
        to_regclass('public.requisitions')::text AS requisitions,
        to_regclass('public.opportunities')::text AS opportunities,
        to_regclass('public.users')::text AS users,
        to_regclass('public.user_access')::text AS user_access,
        to_regclass('public.divisions')::text AS divisions,
        to_regclass('public.auth_passkey_credentials')::text AS passkeys,
        to_regclass('public.auth_passkey_challenges')::text AS passkey_challenges,
        to_regclass('public.uq_requisitions_opportunity')::text AS requisition_unique_index,
        to_regclass('public.uq_opportunities_opportunity_tracker')::text AS opportunity_unique_index
    `;

    for (const table of ['requisitions', 'opportunities', 'users', 'user_access', 'divisions']) {
      if (!objects[table]) addBlocker(`Required table public.${table} is missing.`);
    }

    if (objects.migrations) {
      const applied = await sql`
        SELECT name, applied_at
        FROM erp_migrations
        WHERE name IN ('0012_passkeys.sql', '0013_sales_handoff_uniqueness.sql')
        ORDER BY name
      `;
      const appliedNames = new Set(applied.map((row) => row.name));
      addFact(`Migration 0012: ${appliedNames.has('0012_passkeys.sql') ? 'already applied' : 'pending'}`);
      addFact(`Migration 0013: ${appliedNames.has('0013_sales_handoff_uniqueness.sql') ? 'already applied' : 'pending'}`);
    } else {
      addBlocker('erp_migrations is missing. The migration runner refuses automatic baseline on a populated untracked database.');
    }

    if (objects.requisitions) {
      const duplicateRequisitions = await sql`
        SELECT opportunity_id::text AS upstream_id, count(*)::int AS copies
        FROM requisitions
        WHERE opportunity_id IS NOT NULL
        GROUP BY opportunity_id
        HAVING count(*) > 1
        ORDER BY copies DESC, upstream_id
        LIMIT 25
      `;
      if (duplicateRequisitions.length) {
        addBlocker(`Found ${duplicateRequisitions.length} duplicated requisition handoff key(s); migration 0013 must not run until reconciled.`);
      } else addFact('Requisition handoff duplicates: 0');
    }

    if (objects.opportunities) {
      const duplicateOpportunities = await sql`
        SELECT opportunity_tracker_id::text AS upstream_id, count(*)::int AS copies
        FROM opportunities
        WHERE opportunity_tracker_id IS NOT NULL
        GROUP BY opportunity_tracker_id
        HAVING count(*) > 1
        ORDER BY copies DESC, upstream_id
        LIMIT 25
      `;
      if (duplicateOpportunities.length) {
        addBlocker(`Found ${duplicateOpportunities.length} duplicated PQ handoff key(s); migration 0013 must not run until reconciled.`);
      } else addFact('PQ Tracker handoff duplicates: 0');
    }

    if (objects.passkeys && objects.passkey_challenges) addFact('Passkey tables: present');
    else addFact('Passkey tables: pending migration 0012');
    if (objects.requisition_unique_index && objects.opportunity_unique_index) addFact('Sales handoff unique indexes: present');
    else addFact('Sales handoff unique indexes: pending migration 0013');

    if (objects.users && objects.user_access && objects.divisions) {
      const coverage = await sql`
        SELECT d.key AS division, ua.level, count(*)::int AS users
        FROM user_access ua
        JOIN users u ON u.id = ua.user_id
        JOIN divisions d ON d.id = ua.division_id
        WHERE d.key IN ('sales', 'ta')
          AND u.status = 'active'
          AND u.account_type = 'backoffice'
        GROUP BY d.key, ua.level
        ORDER BY d.key, ua.level
      `;
      const summary = coverage.map((row) => `${row.division}:${row.level}=${row.users}`).join(', ');
      addFact(`Active pilot-role coverage: ${summary || 'none'}`);
      const salesWrite = coverage.some((row) => row.division === 'sales' && ['editor', 'full'].includes(row.level) && row.users > 0);
      const taAny = coverage.some((row) => row.division === 'ta' && ['viewer', 'editor', 'full'].includes(row.level) && row.users > 0);
      if (!salesWrite) addWarning('No active Sales editor/full account is currently provisioned.');
      if (!taAny) addWarning('No active TA viewer/editor/full account is currently provisioned.');
    }
  } finally {
    await sql.end();
  }
}

function printSection(title, items) {
  console.log(`\n${title}`);
  if (!items.length) console.log('- none');
  else for (const item of items) console.log(`- ${item}`);
}

validateEnvironment();
try {
  await inspectDatabase();
} catch (error) {
  addBlocker(`Database preflight failed: ${error instanceof Error ? error.message : String(error)}`);
}

console.log('Sales Wave 1 pilot preflight');
printSection('Facts', facts);
printSection('Warnings', warnings);
printSection('Blockers', blockers);

if (blockers.length) {
  console.error(`\nNO-GO: ${blockers.length} blocker(s) must be resolved before starting the Wave 1 image.`);
  process.exitCode = 2;
} else {
  console.log('\nGO: environment and database preflight passed. Real-device/user validation is still required after deployment.');
}
