import { S3Client, PutObjectCommand, GetObjectCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
const allowed = new Set(["candidate-documents", "automation-documents"]);
let client: S3Client | undefined;
function bucket(logical: string) {
  if (!allowed.has(logical)) throw new Error("Invalid bucket");
  return `${process.env.S3_BUCKET_PREFIX || "erp"}-${logical}`;
}
function s3() {
  if (!process.env.S3_ENDPOINT || !process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY) throw new Error("Private storage is not configured");
  return client ??= new S3Client({ endpoint: process.env.S3_ENDPOINT, region: process.env.S3_REGION || "us-east-1", forcePathStyle: true, credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY } });
}
export function validateObjectPath(path: string) {
  if (!path || path.length > 600 || path.startsWith("/") || path.split("/").some(p => p === ".." || !p) || /[\x00-\x1f\x7f]/.test(path)) throw new Error("Invalid object path");
  return path;
}
export async function putObject(logical: string, path: string, body: Buffer, contentType: string) {
  if (body.length > 20 * 1024 * 1024) throw new Error("Maksimum file 20 MB pada pilot.");
  await s3().send(new PutObjectCommand({ Bucket: bucket(logical), Key: validateObjectPath(path), Body: body, ContentType: contentType, IfNoneMatch: "*" }));
  return path;
}
export async function readObject(logical: string, path: string) {
  const result = await s3().send(new GetObjectCommand({ Bucket: bucket(logical), Key: validateObjectPath(path) }));
  if (!result.Body || (result.ContentLength ?? Infinity) > 20 * 1024 * 1024) { if (result.Body && "destroy" in result.Body) result.Body.destroy(); throw new Error("Object unavailable"); }
  return { body: Buffer.from(await result.Body.transformToByteArray()), contentType: result.ContentType || "application/octet-stream" };
}
export function objectUrl(logical: string, path: string) {
  bucket(logical); validateObjectPath(path);
  return `/api/documents?bucket=${encodeURIComponent(logical)}&path=${encodeURIComponent(path)}`;
}
export async function checkStorage() {
  await Promise.all([...[...allowed].map(bucket), identityBucket()].map(Bucket => s3().send(new HeadBucketCommand({ Bucket }))));
}
// Identity documents (docs/security/04) live in their own private bucket that is deliberately NOT in `allowed`, so
// the generic /api/documents route can never name it. Objects are ciphertext under opaque keys; no URLs are issued.
const identityBucket = () => `${process.env.S3_BUCKET_PREFIX || "erp"}-identity-documents`;
const IDENTITY_KEY = /^id\/[0-9a-f]{32}$/;
export async function putIdentityObject(key: string, body: Buffer) {
  if (!IDENTITY_KEY.test(key)) throw new Error("Invalid identity object key");
  await s3().send(new PutObjectCommand({ Bucket: identityBucket(), Key: key, Body: body, ContentType: "application/octet-stream", IfNoneMatch: "*" }));
}
export async function readIdentityObject(key: string): Promise<Buffer> {
  if (!IDENTITY_KEY.test(key)) throw new Error("Invalid identity object key");
  const result = await s3().send(new GetObjectCommand({ Bucket: identityBucket(), Key: key }));
  if (!result.Body || (result.ContentLength ?? Infinity) > 6 * 1024 * 1024) throw new Error("Object unavailable");
  return Buffer.from(await result.Body.transformToByteArray());
}
