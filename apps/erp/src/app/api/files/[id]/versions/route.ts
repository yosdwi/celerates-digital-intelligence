// Company Files: a new version of a file the user uploaded.
import { NextRequest } from "next/server";
import { BffError } from "@/lib/agent/bff";
import { failure, MAX, relay, upstream, UUID } from "@/lib/files/bff";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!UUID.test(id)) throw new BffError(404, "Berkas tidak ditemukan.");
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File) || file.size === 0 || file.size > MAX) throw new BffError(422, "Pilih berkas hingga 20 MB.");
    const out = new FormData();
    out.append("file", file, file.name.slice(-120));
    return relay(await upstream(`/${id.toLowerCase()}/versions`, { method: "POST", body: out, write: request }), 201);
  } catch (error) {
    return failure(error);
  }
}
