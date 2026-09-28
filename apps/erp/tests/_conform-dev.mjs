// Local iteration runner for the ConForm journey (not part of CI): reuses the harness databases and a running
// `next dev` on :3311. The full harness (http-smoke.mjs) is the verification of record.
import postgres from 'postgres';
import { encode } from 'next-auth/jwt';
import { conformJourney } from './conform-journey.mjs';

const base = process.env.JOURNEY_BASE || 'http://localhost:3311'; // next dev rewrites Host to localhost
const db = postgres(process.env.DATABASE_URL, { max: 2, prepare: false });
await db`UPDATE users SET status='active' WHERE email='owner@example.test'`;
await db`DELETE FROM talent_link_grants`;
await db`DELETE FROM talent_identity_links`;
await db`DELETE FROM activity_logs WHERE actor_user_id IN (SELECT id FROM users WHERE account_type='talent')`;
await db`DELETE FROM users WHERE account_type='talent'`;
const [owner] = await db`SELECT id FROM users WHERE email='owner@example.test'`;
const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { email: 'owner@example.test', name: 'Owner', userId: owner.id, status: 'active', isOwner: true, accountType: 'backoffice', access: [] } });
try {
  await conformJourney({ base, db, cookies: [['next-auth.session-token', token]] });
} finally {
  await db.end();
}
