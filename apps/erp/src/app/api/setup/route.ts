import { bootstrapOwner } from "@/lib/bootstrap";
export async function POST(request: Request) {
  const expected = process.env.NEXTAUTH_URL;
  if (!expected || request.headers.get("origin") !== new URL(expected).origin) return new Response("Forbidden", { status: 403 });
  if (Number(request.headers.get("content-length") || 0) > 4096) return new Response("Too large", { status: 413 });
  try {
    const data = await request.formData();
    await bootstrapOwner({ token: String(data.get("token") || ""), email: String(data.get("email") || ""), name: String(data.get("name") || ""), password: String(data.get("password") || "") });
    return Response.redirect(new URL('/login?setup=complete', expected), 303);
  } catch { return new Response("Setup gagal: periksa kode, email, dan password 14–72 karakter. Setup hanya bisa sekali.", { status: 400 }); }
}
