// Invitation email (QA 2026-10-09): what the invited person needs to start, nothing secret. The link only opens the
// activation step with their email filled in; the 6-digit code still goes to this mailbox, so a forwarded invitation
// gives nobody else access.
import { systemTransport } from "./security/email-otp";

export type Invite = { to: string; name: string; inviter: string; access: string };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function activationLink(email: string): string {
  const base = (process.env.NEXTAUTH_URL ?? "https://ierp.celeratesapps.com").replace(/\/$/, "");
  return `${base}/login?aktivasi=${encodeURIComponent(email)}`;
}

export function inviteMessage(i: Invite) {
  const link = activationLink(i.to);
  const steps = [
    "Klik tombol Aktifkan akun (atau buka link di bawah).",
    "Klik Kirim kode. Kode 6 digit dikirim ke email ini.",
    "Masukkan kode lalu buat password Anda.",
  ];
  const text = [
    `Halo ${i.name},`,
    "",
    `${i.inviter} mengundang Anda ke Celerates ERP dengan akses ${i.access}.`,
    "",
    ...steps.map((s, n) => `${n + 1}. ${s}`),
    "",
    link,
    "",
    "Setelah masuk, Anda bisa mendaftarkan biometrik (Face ID, sidik jari, Windows Hello) di menu Profil agar login berikutnya cukup satu sentuhan.",
    "Jika Anda tidak merasa diundang, abaikan email ini.",
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6fa;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px">
<tr><td style="background:#194667;border-radius:12px 12px 0 0;padding:20px 28px;color:#ffffff;font-size:18px;font-weight:bold">Celerates ERP</td></tr>
<tr><td style="padding:28px">
<p style="margin:0 0 12px;font-size:15px">Halo ${esc(i.name)},</p>
<p style="margin:0 0 16px;font-size:14px;line-height:1.5"><b>${esc(i.inviter)}</b> mengundang Anda ke Celerates ERP dengan akses <b>${esc(i.access)}</b>.</p>
<ol style="margin:0 0 20px;padding-left:20px;font-size:14px;line-height:1.6">${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
<p style="margin:0 0 20px"><a href="${esc(link)}" style="display:inline-block;background:#194667;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:12px 22px;border-radius:8px">Aktifkan akun</a></p>
<p style="margin:0 0 16px;font-size:12px;color:#64748b;word-break:break-all">${esc(link)}</p>
<p style="margin:0 0 8px;font-size:13px;color:#334155;line-height:1.5">Setelah masuk, daftarkan biometrik (Face ID, sidik jari, Windows Hello) di menu Profil agar login berikutnya cukup satu sentuhan.</p>
<p style="margin:0;font-size:12px;color:#94a3b8">Jika Anda tidak merasa diundang, abaikan email ini.</p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject: "Undangan ke Celerates ERP", text, html };
}

async function smtpInvite(i: Invite): Promise<void> {
  const m = inviteMessage(i);
  await systemTransport().sendMail({ from: process.env.SMTP_FROM, to: i.to, subject: m.subject, text: m.text, html: m.html });
}

/** Replaceable in tests; production sends through SMTP. */
export const inviteMail = { send: smtpInvite };
