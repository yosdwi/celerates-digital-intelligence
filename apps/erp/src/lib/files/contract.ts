// Machine contract for the Company Files indexer (doc 17, ADR-018): GET /api/integration/v1/files/{catalog,feed,content}.
// Read credential only. Declared files only: identity documents and undeclared attachments are never listed or served.
import type { NextRequest } from "next/server";
import type { Sql } from "postgres";
import { fail } from "@/lib/integration/contract";
import { readObject } from "@/lib/object-store";
import { classSettings, fileFeed, fileObject, FILE_KINDS } from "./sources";

export async function handleFiles(request: NextRequest, path: string[], sql: Sql): Promise<unknown> {
  const params = request.nextUrl.searchParams;
  if (path[1] === "catalog" && path.length === 2) return { schema_version: "1.0", kinds: FILE_KINDS, classes: await classSettings(sql) };
  if (path[1] === "feed" && path.length === 2) {
    const after = params.get("after") ?? "";
    const limit = Number(params.get("limit") || 200);
    if (after.length > 300 || !Number.isInteger(limit) || limit < 1 || limit > 500) fail(422, "SCHEMA", "Invalid cursor/limit.");
    return { schema_version: "1.0", ...(await fileFeed(sql, after, limit)) };
  }
  if (path[1] === "content" && path.length === 2) {
    const ref = params.get("ref") ?? "";
    if (!/^(attachment|column):[\w.:-]{3,200}$/.test(ref)) fail(422, "SCHEMA", "Invalid file reference.");
    const settings = await classSettings(sql);
    const object = await fileObject(sql, ref);
    if (!object || settings[object.source.access_class]?.indexing === "none") fail(404, "NOT_FOUND", "File not available.");
    const { body, contentType } = await readObject(object!.bucket, object!.path).catch(() => fail(404, "NOT_FOUND", "File not available."));
    return new Response(new Uint8Array(body), { headers: { "Content-Type": contentType, "X-File-Name": encodeURIComponent(object!.name), "X-Content-Type-Options": "nosniff" } });
  }
  fail(404, "NOT_FOUND", "Files contract operation not available.");
}
