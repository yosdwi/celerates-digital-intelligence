// Key encryption keys for identity documents (docs/security/04). Every object has its own random data key (DEK);
// only the wrapped DEK and the KEK version are stored. v1 is a local keyring file on the VPS, separate from
// PII_ENCRYPTION_KEY. A KMS/Vault provider can implement KeyProvider later; rows keep kek_version, so rotation is
// re-wrapping DEKs, never rewriting objects.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

export interface KeyProvider {
  wrap(dek: Buffer): Promise<{ wrapped: string; version: number }>;
  unwrap(wrapped: string, version: number): Promise<Buffer>;
}

/** Keyring file: one `v<N>:<64 hex>` per line; the highest version wraps new keys, every listed version unwraps. */
export class LocalKeyring implements KeyProvider {
  private readonly current: number;
  constructor(private readonly keys: Map<number, Buffer>) {
    if (!keys.size) throw new Error("identity keyring is empty");
    for (const k of keys.values()) if (k.length !== 32) throw new Error("identity KEK must be 32 bytes");
    this.current = Math.max(...keys.keys());
  }
  static parse(text: string): LocalKeyring {
    const keys = new Map<number, Buffer>();
    for (const line of text.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))) {
      const m = /^v(\d+):([0-9a-f]{64})$/i.exec(line);
      if (!m) throw new Error("identity keyring line is malformed");
      keys.set(Number(m[1]), Buffer.from(m[2], "hex"));
    }
    return new LocalKeyring(keys);
  }
  async wrap(dek: Buffer) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.keys.get(this.current)!, iv);
    cipher.setAAD(Buffer.from(`identity-dek:v${this.current}`));
    const ct = Buffer.concat([cipher.update(dek), cipher.final()]);
    return { wrapped: Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64"), version: this.current };
  }
  async unwrap(wrapped: string, version: number) {
    const kek = this.keys.get(version);
    if (!kek) throw new Error("identity KEK version unavailable");
    const raw = Buffer.from(wrapped, "base64");
    const decipher = createDecipheriv("aes-256-gcm", kek, raw.subarray(0, 12));
    decipher.setAAD(Buffer.from(`identity-dek:v${version}`));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
  }
}

let cached: KeyProvider | undefined;
export function keyring(): KeyProvider {
  const file = process.env.IDENTITY_KEYRING_FILE;
  if (!file) throw new Error("IDENTITY_KEYRING_FILE is not configured");
  return (cached ??= LocalKeyring.parse(readFileSync(file, "utf8")));
}
/** Tests only: forget the cached keyring after changing IDENTITY_KEYRING_FILE. */
export const resetKeyringForTests = () => (cached = undefined);
