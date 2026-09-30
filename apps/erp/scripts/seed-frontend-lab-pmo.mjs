// Frontend Lab-only PMO seed. Idempotent and safe to run repeatedly.
// Credentials come from Railway env and are never committed or printed.
import postgres from 'postgres';
import bcrypt from 'bcryptjs';

const url = process.env.DATABASE_URL;
const email = (process.env.FRONTEND_LAB_SEED_EMAIL ?? '').trim().toLowerCase();
const password = process.env.FRONTEND_LAB_SEED_PASSWORD ?? '';

if (!url) throw new Error('DATABASE_URL is required');
if (!email || !password) {
  console.log('Frontend Lab PMO seed skipped: credentials are not configured.');
  process.exit(0);
}
if (email.length > 254) throw new Error('FRONTEND_LAB_SEED_EMAIL is too long');
if (password.length < 8 || password.length > 72) throw new Error('FRONTEND_LAB_SEED_PASSWORD must be 8-72 characters');

const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 10 });
try {
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(731882003)`;
    const [division] = await tx`SELECT id FROM divisions WHERE key = 'pmo'`;
    if (!division) throw new Error('PMO division is missing; run db:migrate first');

    const [existing] = await tx`SELECT id, password_hash FROM users WHERE email = ${email}`;
    const hash = existing?.password_hash && (await bcrypt.compare(password, existing.password_hash))
      ? existing.password_hash
      : await bcrypt.hash(password, 12);

    let userId;
    if (existing) {
      await tx`
        UPDATE users
        SET full_name = 'PMO (test)',
            role_title = 'PMO',
            password_hash = ${hash},
            status = 'active',
            is_owner = false,
            account_type = 'backoffice'
        WHERE id = ${existing.id}
      `;
      userId = existing.id;
    } else {
      const [created] = await tx`
        INSERT INTO users (email, full_name, role_title, password_hash, status, is_owner, account_type)
        VALUES (${email}, 'PMO (test)', 'PMO', ${hash}, 'active', false, 'backoffice')
        RETURNING id
      `;
      userId = created.id;
    }

    await tx`DELETE FROM user_access WHERE user_id = ${userId} AND division_id <> ${division.id}`;
    await tx`
      INSERT INTO user_access (user_id, division_id, level)
      VALUES (${userId}, ${division.id}, 'full')
      ON CONFLICT (user_id, division_id) DO UPDATE SET level = excluded.level
    `;
  });
  console.log(`Frontend Lab PMO seed applied for ${email}.`);
} finally {
  await sql.end();
}
