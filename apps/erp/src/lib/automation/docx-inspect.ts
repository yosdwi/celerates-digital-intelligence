import PizZip from "pizzip";

function readDocumentXml(buffer: Buffer): string {
  const zip = new PizZip(buffer);
  const file = zip.file("word/document.xml");
  if (!file) throw new Error("File bukan .docx yang valid (word/document.xml tidak ditemukan di dalam zip).");
  return file.asText();
}

function decodeXmlEntities(text: string): string {
  return text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

/**
 * Ekstrak teks yang KELIHATAN di dokumen (concat semua <w:t> per paragraf <w:p>).
 * Ini bukan konversi visual/layout penuh -- cukup buat verifikasi cepat isi
 * dokumen (preview) tanpa perlu buka file .docx-nya di Word.
 */
/** Sama seperti visibleTextOf di docx-autofill.ts -- <w:tab/> jadi spasi, biar label yang dipisah tab dari titik-titiknya tidak nempel jadi 1 kata di hasil ekstraksi. */
function visibleTextOfFragment(fragment: string): string {
  const parts: string[] = [];
  const re = /<w:t[^>]*>([^<]*)<\/w:t>|<w:tab\s*\/>|<w:(?:br|cr)\s*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fragment)) !== null) {
    if (m[1] !== undefined) parts.push(decodeXmlEntities(m[1]));
    else if (m[0].includes("w:tab")) parts.push(" ");
    else parts.push("\n");
  }
  return parts.join("");
}

export function extractDocxParagraphs(buffer: Buffer): string[] {
  const xml = readDocumentXml(buffer);
  const paragraphs = xml.split(/<\/w:p>/).map((para) => visibleTextOfFragment(para));
  return paragraphs.filter((p) => p.trim().length > 0);
}

export function extractDocxText(buffer: Buffer): string {
  return extractDocxParagraphs(buffer).join("\n");
}

/**
 * Baris yang MASIH mengandung blank (titik-titik/ellipsis/underscore) --
 * dipakai buat diagnosa "field mana yang belum kefill" tanpa perlu buka file
 * .docx-nya. Threshold 3+ karakter (bukan 2+) SENGAJA lebih ketat daripada
 * DOT_RUN yang dipakai buat isi-otomatis -- di sini cuma buat ditampilkan ke
 * user, jadi false-positive dari mis. ".." di akhir kalimat biasa (bukan
 * blank sungguhan) mau dihindari, walau risikonya blank 2-karakter asli jadi
 * tidak ke-flag (kasus sangat jarang).
 */
export function findRemainingBlanks(buffer: Buffer): string[] {
  const BLANK_RE = /[.…_]{3,}/;
  return extractDocxParagraphs(buffer).filter((p) => BLANK_RE.test(p));
}

/**
 * Tag {xxx} yang KETEMU di teks visible dokumen -- dipakai buat validasi
 * template sebelum generate. Catatan: kalau Word "memecah" tag jadi beberapa
 * run karena autocorrect, tag tetap kedeteksi di sini (karena teks di-gabung
 * dulu sebelum di-scan) TAPI docxtemplater tetap bisa gagal replace-nya saat
 * render karena docxtemplater kerja di level XML run, bukan teks gabungan.
 * Jadi: "tag terdeteksi di sini" != "dijamin ke-replace pas generate".
 */
export function extractDocxTags(buffer: Buffer): string[] {
  const text = extractDocxText(buffer);
  const matches = [...text.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]);
  return [...new Set(matches)];
}
