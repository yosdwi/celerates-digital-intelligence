// Sales email (roadmap #2): which Account a message belongs to, how messages group into threads, and template
// variables. Pure: no IMAP, no database, so it is tested directly (tests/sales-v2.test.ts).

/** Public mail providers: a shared domain says nothing about the company, so these match by full address only. */
export const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.id", "ymail.com", "hotmail.com", "outlook.com", "live.com",
  "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "mail.com", "zoho.com",
]);

export const normAddress = (a: string) => a.trim().toLowerCase();
export const domainOf = (a: string) => normAddress(a).split("@")[1] ?? "";

export type ContactRef = { id: string; clientId: string; email: string | null };

/**
 * The Account a message is about: a participant who is a known contact first, else a participant whose company domain
 * a contact shares. Our own addresses (the mailbox, the Sales team's domain) never decide it.
 */
export function matchAccount(participants: string[], contacts: ContactRef[], ownDomains: Set<string>): { clientId: string; contactId: string | null } | null {
  const outside = participants.map(normAddress).filter((a) => a.includes("@") && !ownDomains.has(domainOf(a)));
  const byEmail = new Map(contacts.filter((c) => c.email).map((c) => [normAddress(c.email!), c]));
  for (const a of outside) {
    const c = byEmail.get(a);
    if (c) return { clientId: c.clientId, contactId: c.id };
  }
  for (const a of outside) {
    const d = domainOf(a);
    if (FREE_MAIL.has(d)) continue;
    const c = contacts.find((x) => x.email && domainOf(x.email) === d);
    if (c) return { clientId: c.clientId, contactId: null };
  }
  return null;
}

/** A thread is named by its first message: the oldest References entry, else what it replies to, else itself. */
export function threadKey(messageId: string, inReplyTo?: string | null, references?: string | string[] | null): string {
  const refs = Array.isArray(references) ? references : references ? references.split(/\s+/).filter(Boolean) : [];
  return refs[0] ?? inReplyTo ?? messageId;
}

/** `{{kontak.nama}}`-style variables; an unknown or empty one is left visible so the sender sees what to fill. */
export function fillTemplate(text: string, vars: Record<string, string | null | undefined>): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, key: string) => vars[key]?.trim() || m);
}

export const TEMPLATE_VARIABLES = ["kontak.nama", "account.nama", "pengirim.nama", "opty.no", "opty.posisi"] as const;

export function snippet(text: string | null | undefined, max = 160): string {
  const flat = (text ?? "").replace(/^>.*$/gm, "").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

const EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

/** "a@x.com, b@y.co.id" as typed in the To / Cc fields. */
export function parseAddressList(input: string): { valid: string[]; invalid: string[] } {
  const parts = input.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  const valid = Array.from(new Set(parts.filter((p) => EMAIL.test(p)).map(normAddress)));
  return { valid, invalid: parts.filter((p) => !EMAIL.test(p)) };
}

/** HTML-only mail as readable text (the parser gives text when the message has a text part). */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
