/**
 * STUB -- belum ada provider WA yang dikonfigurasi. Signature-nya sengaja
 * dibuat sama seperti sendEmail() supaya "channels/index.ts" bisa dispatch
 * ke sini tanpa ubah apa pun di reminder-engine.ts begitu provider (mis.
 * Fonnte/WhatsApp Cloud API) sudah dipasang -- tinggal isi badan fungsi ini.
 */
export async function sendWhatsAppNumber(_target: string, _message: string): Promise<void> {
  throw new Error("Channel WhatsApp (nomor) belum dikonfigurasi.");
}

export async function sendWhatsAppGroup(_target: string, _message: string): Promise<void> {
  throw new Error("Channel WhatsApp (grup) belum dikonfigurasi.");
}
