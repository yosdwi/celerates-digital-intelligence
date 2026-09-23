import { sql } from "@/db";
export const dynamic = "force-dynamic";
export default async function SetupPage() {
  const [owner] = await sql`SELECT id FROM users WHERE is_owner = true LIMIT 1`;
  if (owner || !process.env.SETUP_TOKEN) return <main className="max-w-lg mx-auto p-8"><h1 className="text-2xl font-bold">Setup tidak tersedia</h1><a href="/login">Masuk ke ERP</a></main>;
  return <main className="max-w-lg mx-auto p-8 space-y-5"><h1 className="text-3xl font-bold">Aktifkan ERP pilot</h1><p>Buat Owner pertama. Minta kode aktivasi dari pengelola deployment. Kode hanya berlaku sebelum Owner pertama dibuat.</p><form method="post" action="/api/setup" className="flex flex-col gap-4">
    <label>Kode aktivasi<input className="border rounded w-full p-2" type="password" name="token" required autoComplete="off" /></label>
    <label>Nama<input className="border rounded w-full p-2" name="name" required maxLength={120} autoComplete="name" /></label>
    <label>Email<input className="border rounded w-full p-2" type="email" name="email" required autoComplete="username" /></label>
    <label>Password<input className="border rounded w-full p-2" type="password" name="password" required minLength={14} maxLength={72} autoComplete="new-password" /></label>
    <button className="bg-pink-600 text-white rounded p-3">Buat Owner dan mulai</button>
  </form></main>;
}
