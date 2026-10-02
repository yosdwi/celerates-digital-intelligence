// Identity documents (docs/security/04). POST uploads one file for a subject; GET lists status metadata only.
// Same-origin route handlers; every decision is lib/security/policy.ts `can()` and every attempt is audited.
import { sql } from "@/db";
import { currentClaims, requestMeta } from "@/lib/actor";
import { IdentityDocError, identityDocumentStatus, MAX_IDENTITY_BYTES, uploadIdentityDocument, type Subject } from "@/lib/security/identity-documents";
import type { SessionClaims } from "@/lib/security/session";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

/** The subject named by the request. A Talent can only ever name themselves (and their linked ERP employee). */
async function subjectFor(claims: SessionClaims, kind: unknown, id: unknown): Promise<Subject | null> {
  if (kind === "self" || claims.accountType === "talent") {
    const [link] = await sql`SELECT erp_employee_id FROM talent_identity_links WHERE user_id = ${claims.userId} AND status = 'active'`;
    return { userId: claims.userId, employeeId: (link?.erp_employee_id as string | undefined) ?? null };
  }
  if (typeof id !== "string" || !UUID.test(id)) return null;
  if (kind === "onboarding") return { onboardingId: id };
  if (kind === "employee") return { employeeId: id };
  return null;
}

export async function GET(request: Request) {
  const claims = await currentClaims();
  if (!claims) return json({ error: "unauthorized" }, 403);
  const params = new URL(request.url).searchParams;
  const subject = await subjectFor(claims, params.get("subject_kind"), params.get("subject_id"));
  const documents = subject ? await identityDocumentStatus(sql, claims, subject) : null;
  return documents ? json({ documents }) : json({ error: "not_found" }, 404);
}

export async function POST(request: Request) {
  const claims = await currentClaims();
  if (!claims) return json({ error: "unauthorized" }, 403);
  if (Number(request.headers.get("content-length") || 0) > MAX_IDENTITY_BYTES + 64 * 1024) return json({ error: "invalid_size" }, 413);
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) return json({ error: "file_required" }, 400);
  const subject = await subjectFor(claims, form.get("subject_kind"), form.get("subject_id"));
  if (!subject) return json({ error: "not_found" }, 404);
  try {
    const { id } = await uploadIdentityDocument(
      sql,
      claims,
      { subject, docType: String(form.get("doc_type") ?? ""), declaredType: file.type, bytes: Buffer.from(await file.arrayBuffer()) },
      await requestMeta(),
    );
    return json({ id }, 201);
  } catch (error) {
    if (error instanceof IdentityDocError) return json({ error: error.code }, error.status);
    console.error("[identity-documents] upload failed", (error as Error).name);
    return json({ error: "upload_failed" }, 500);
  }
}
