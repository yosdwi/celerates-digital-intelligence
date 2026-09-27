// Company Files: search/list (GET) and upload (POST) for the session user, via Intelligence under delegation.
import { NextRequest } from "next/server";
import { BffError } from "@/lib/agent/bff";
import { failure, MAX, relay, upstream } from "@/lib/files/bff";
export const dynamic = "force-dynamic";
const FIELDS = ["kind", "access_class", "owner_division", "title", "entity_type", "entity_id", "entity_label", "entity_href"];

export async function GET(request: NextRequest) {
  try {
    const params = new URLSearchParams();
    const input = request.nextUrl.searchParams;
    const q = (input.get("q") ?? "").trim().slice(0, 200);
    if (q) params.set("q", q);
    for (const kind of input.getAll("kind").filter((k) => /^[a-z_]{2,40}$/.test(k)).slice(0, 5)) params.append("kind", kind);
    const [type, id] = [input.get("entity_type") ?? "", input.get("entity_id") ?? ""];
    if (/^[a-z_]{2,40}$/.test(type) && /^[0-9a-f-]{36}$/i.test(id)) params.set("entity_type", type), params.set("entity_id", id);
    return relay(await upstream(`?${params}`));
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (Number(request.headers.get("content-length") || 0) > MAX + 65536) throw new BffError(413, "Ukuran maksimum 20 MB.");
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File) || file.size === 0) throw new BffError(422, "Pilih berkas.");
    if (file.size > MAX) throw new BffError(413, "Ukuran maksimum 20 MB.");
    const out = new FormData();
    out.append("file", file, file.name.slice(-120));
    for (const name of FIELDS) {
      const value = form!.get(name);
      if (typeof value === "string" && value.trim()) out.append(name, value.trim().slice(0, 300));
    }
    return relay(await upstream("", { method: "POST", body: out, write: request }), 201);
  } catch (error) {
    return failure(error);
  }
}
