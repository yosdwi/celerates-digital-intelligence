/**
 * Whitelist email untuk akses fitur beta/testing di production.
 * Hanya dipakai bersama email yang login via Google (sudah terverifikasi oleh Google),
 * bukan email dari form register/credentials yang bisa diklaim siapa saja.
 */
const BETA_EMAILS = (process.env.BETA_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isBetaWhitelisted(email: string | null | undefined): boolean {
  if (!email) return false;
  return BETA_EMAILS.includes(email.toLowerCase());
}
