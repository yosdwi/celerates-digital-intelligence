// Break-glass sign-in (docs/security/02 R5.6). An operator with host access issues a one-time code for a NAMED
// backoffice user when email delivery is down or the user is locked out. Run inside the ERP container:
//   docker exec -it celerates-erp node scripts/issue-recovery-code.mjs <email> "<reason>" [--reset]
// The code is printed to this terminal only; give it to the person out of band (phone, in person). It is an
// ordinary challenge (10 minutes, single use, 5 tries) marked delivery=break_glass, and an audit row is written.
// Without --reset it is a login code (entered after the password); with --reset it sets a new password.
import postgres from 'postgres';
import { createHmac, randomInt } from 'node:crypto';

export async function issueRecoveryCode(sql, email, reason, purpose = 'login') {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error('NEXTAUTH_SECRET is required');
  if (!reason || reason.trim().length < 3) throw new Error('A reason is required');
  const [user] = await sql`SELECT id, account_type FROM users WHERE email = ${email.trim().toLowerCase()} AND status = 'active'`;
  if (!user || user.account_type === 'talent') throw new Error('No active backoffice account with that email');
  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  const hmac = createHmac('sha256', secret).update(`otp:v1:${user.id}:${purpose}:${code}`).digest('hex');
  await sql.begin(async (tx) => {
    await tx`UPDATE auth_email_challenges SET consumed_at = now() WHERE user_id = ${user.id} AND purpose = ${purpose} AND consumed_at IS NULL`;
    await tx`INSERT INTO auth_email_challenges (user_id, purpose, code_hmac, delivery, expires_at)
      VALUES (${user.id}, ${purpose}, ${hmac}, 'break_glass', now() + interval '10 minutes')`;
    await tx`INSERT INTO sensitive_access_log (actor_user_id, action, resource_type, resource_id, subject_user_id, decision, reason)
      VALUES (NULL, 'break_glass_code_issued', 'user', ${user.id}, ${user.id}, 'allow', ${`${purpose}: ${reason.trim()}`.slice(0, 200)})`;
  });
  return code;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  const [email, reason] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!email || !reason) {
    console.error('usage: node scripts/issue-recovery-code.mjs <email> "<reason>" [--reset]');
    process.exit(2);
  }
  const sql = postgres(process.env.DIRECT_URL || process.env.DATABASE_URL, { max: 1, prepare: false });
  try {
    const code = await issueRecoveryCode(sql, email, reason, process.argv.includes('--reset') ? 'reset' : 'login');
    console.log(`One-time code for ${email} (valid 10 minutes, single use): ${code}`);
  } finally {
    await sql.end();
  }
}
