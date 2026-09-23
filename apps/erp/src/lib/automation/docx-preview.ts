import mammoth from "mammoth";

/**
 * Konversi buffer .docx jadi HTML buat ditampilkan sebagai preview visual
 * (paragraf, bold, tabel ikut kebawa -- bukan cuma teks polos). Bukan render
 * 1:1 identik Word (margin/font halaman tidak dipertahankan persis), tapi
 * cukup buat verifikasi cepat "datanya kefill dengan benar atau tidak" tanpa
 * perlu download & buka Word.
 */
export async function docxToPreviewHtml(buffer: Buffer): Promise<string> {
  const { value: html } = await mammoth.convertToHtml({ buffer });
  // Jaga-jaga: docx nggak punya elemen <script>, tapi tetap dibuang kalau
  // entah kenapa ada -- defense-in-depth murah buat konten yang asalnya dari
  // file upload user, sebelum dirender via dangerouslySetInnerHTML.
  return html.replace(/<script[\s\S]*?<\/script>/gi, "");
}
