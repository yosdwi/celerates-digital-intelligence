// ADR-008 operator tool. Generates one Ed25519 key pair for ERP → Intelligence Agent delegation.
// Prints the ERP secret (private key) and the Intelligence public-key JSON. Nothing is written to disk.
// Usage: node scripts/generate-agent-delegation-key.mjs [kid]
import { generateKeyPairSync } from 'node:crypto';
const kid = process.argv[2] || `erp-${new Date().toISOString().slice(0, 10)}`;
if (!/^[A-Za-z0-9._-]{3,64}$/.test(kid)) throw new Error('kid must be 3-64 characters of [A-Za-z0-9._-]');
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString().trim().replace(/\n/g, '\\n');
const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString().trim().replace(/\n/g, '\\n');
console.log('# ERP service only (secret):');
console.log(`AGENT_DELEGATION_KID=${kid}`);
console.log(`AGENT_DELEGATION_PRIVATE_KEY=${privatePem}`);
console.log('\n# Intelligence API (public; add, do not replace, during rotation):');
console.log(`ERP_DELEGATION_PUBLIC_KEYS={"${kid}":"${publicPem}"}`);
