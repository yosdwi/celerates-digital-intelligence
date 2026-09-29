import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const PREFIX = "enc:v1:";

function getKey(): Buffer {
  const keyHex = process.env.PII_ENCRYPTION_KEY;
  if (!keyHex) throw new Error("PII_ENCRYPTION_KEY belum di-set di .env -- tidak bisa enkripsi/dekripsi data PII");
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) throw new Error("PII_ENCRYPTION_KEY harus 32 byte (64 karakter hex)");
  return key;
}

/** Enkripsi field PII (NIK/NPWP/No.KK/No.Rekening) sebelum disimpan ke DB. Null/kosong dibiarkan null. */
export function encryptPII(plaintext: string | null | undefined): string | null {
  if (!plaintext) return null;
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

/**
 * Dekripsi field PII buat ditampilkan. Data lama yang belum sempat dimigrasi
 * (belum ada prefix "enc:v1:") ditampilkan apa adanya -- supaya transisi ke
 * enkripsi tidak bikin data lama mendadak hilang/error sebelum migrasi jalan.
 */
export function decryptPII(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!stored.startsWith(PREFIX)) return stored;

  const key = getKey();
  const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

export function isEncryptedPII(value: string | null | undefined): boolean {
  return Boolean(value && value.startsWith(PREFIX));
}
