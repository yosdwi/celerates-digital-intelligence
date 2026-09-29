import { Resend } from "resend";

/** Lazy init -- biar file ini boleh di-import walau RESEND_API_KEY belum di-set (baru meledak pas beneran dipanggil). */
function getClient(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY belum di-set di .env");
  return new Resend(key);
}

export async function sendEmail(target: string, subject: string, message: string): Promise<void> {
  const client = getClient();
  const from = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  const { error } = await client.emails.send({
    from,
    to: target,
    subject,
    text: message,
  });
  if (error) throw new Error(error.message);
}
