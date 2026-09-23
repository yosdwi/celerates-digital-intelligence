import PizZip from "pizzip";

/**
 * "Isi otomatis tanpa tag" -- baca template .docx APA ADANYA (label + titik-titik
 * yang sudah ada di draft kontrak), cocokkan label ke data yang kita punya, lalu
 * timpa titik-titiknya langsung di XML. User tidak perlu sisipkan {tag} apa pun.
 *
 * Strategi: daripada coba tempel nilai persis di posisi titik-titik (rawan gagal
 * karena Word suka "memecah" 1 baris jadi banyak <w:r> run kalau ada autocorrect/
 * format campuran), paragraf/cell yang KETEMU pola dikenal langsung ditulis ULANG
 * seluruhnya jadi 1 run baru pakai teks final -- korbankan variasi bold/italic di
 * DALAM baris yang sama, demi jauh lebih robust terhadap struktur run yang aneh-aneh.
 */

// Blank di draft kontrak bisa berupa titik literal berulang ("......"), karakter
// ellipsis Unicode "…" (sering muncul kalau Word/macOS autocorrect "..." jadi 1
// karakter), underscore, atau CAMPURAN ketiganya (mis. beberapa "…" diselingi
// titik literal). Satu character class -- bukan alternasi -- biar campuran
// begini tetap ke-match sebagai SATU blank, bukan gagal karena "sisa" karakter
// di ujung yang tidak masuk salah satu alternatif.
const DOT_RUN = "[.\\u2026_]{2,}";
const WS = "\\s*";

function escapeXml(text: string): string {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function decodeXmlEntities(text: string): string {
  return text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

/**
 * Rekonstruksi teks visible SESUAI URUTAN di XML, termasuk <w:tab/> (jadi
 * spasi) dan <w:br/>/<w:cr/> (jadi newline) -- bukan cuma <w:t>. Tanpa ini,
 * label yang dipisah tab dari titik-titiknya (umum dipakai buat perataan
 * kolom di Word) bakal nempel jadi 1 kata tanpa spasi sama sekali, bikin
 * pencocokan label gagal diam-diam.
 */
function visibleTextOf(xmlFragment: string): string {
  const parts: string[] = [];
  const re = /<w:t[^>]*>([^<]*)<\/w:t>|<w:tab\s*\/>|<w:(?:br|cr)\s*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xmlFragment)) !== null) {
    if (m[1] !== undefined) parts.push(decodeXmlEntities(m[1]));
    else if (m[0].includes("w:tab")) parts.push(" ");
    else parts.push("\n");
  }
  return parts.join("");
}

/** Normalisasi label buat dibandingkan: lowercase, buang tanda baca umum, rapikan spasi. */
function normalizeLabel(text: string): string {
  return text
    .toLowerCase()
    // Buang list-marker di depan -- HARUS spesifik (huruf tunggal / angka romawi / angka),
    // bukan `[a-z0-9]+` sembarang -- kalau tidak, "No." di "No. Induk Karyawan" ikut
    // kebuang karena kebetulan bentuknya sama kayak marker "no." (2 huruf + titik).
    .replace(/^(?:[a-z]|[ivxlcdm]{1,4}|[0-9]{1,3})[.)]\s+/i, "")
    // Titik/kolon jadi SPASI (bukan dihapus) -- "No.KTP" (tanpa spasi) harus
    // tetap kebaca "no ktp" (2 kata terpisah), bukan nempel "noktp" (1 kata)
    // yang gagal dicocokkan ke key manapun.
    .replace(/[.:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Bikin 1 <w:p> baru: pertahankan <w:pPr> & atribut tag pembuka aslinya, tapi isinya 1 run baru dengan teks final. */
function rewriteParagraph(rawParagraphXml: string, newText: string): string {
  const openTag = rawParagraphXml.match(/^<w:p[^>]*>/)?.[0] ?? "<w:p>";
  const pPrMatch = rawParagraphXml.match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
  const pPr = pPrMatch ? pPrMatch[0] : "";
  const rPrMatch = rawParagraphXml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
  const rPr = rPrMatch ? rPrMatch[0] : "";
  return `${openTag}${pPr}<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(newText)}</w:t></w:r></w:p>`;
}

type LabelResolver = (data: Record<string, string>) => string;

/** Peta label (dinormalisasi) -> cara ambil nilainya dari mergeData. Beberapa label beda kata tapi rujuk field yang sama. */
const SIMPLE_LABEL_MAP: Record<string, LabelResolver> = {
  "id pegawai": (d) => d.id_pegawai,
  "no induk karyawan": (d) => d.no_induk_karyawan,
  nama: (d) => d.nama,
  "nama lengkap": (d) => d.nama,
  "tanggal bergabung": (d) => d.tanggal_mulai,
  "no ktp": (d) => d.nik,
  nik: (d) => d.nik,
  "tempat, tanggal lahir": (d) => `${d.tempat_lahir}, ${d.tanggal_lahir}`,
  "tempat tanggal lahir": (d) => `${d.tempat_lahir}, ${d.tanggal_lahir}`,
  umur: (d) => d.umur,
  "jenis kelamin": (d) => d.jenis_kelamin,
  alamat: (d) => d.alamat,
  "no hp": (d) => d.no_tlp,
  "no telepon": (d) => d.no_tlp,
  "tugas pokok / jabatan": (d) => d.jabatan,
  "tugas pokok/jabatan": (d) => d.jabatan,
  jabatan: (d) => d.jabatan,
  "business unit": (d) => d.business_unit,
  npwp: (d) => d.npwp,
  email: (d) => d.email,
  tanggal: (d) => d.tanggal_ttd,
};

/** Cek apakah `needle` (array kata) muncul sebagai potongan kata BERURUTAN utuh di dalam `haystack` (array kata) -- bukan substring mentah, biar "teknik" nggak ke-anggap ngandung "nik". */
function containsWordSequence(haystack: string[], needle: string[]): boolean {
  if (needle.length > haystack.length) return false;
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    if (needle.every((w, j) => haystack[i + j] === w)) return true;
  }
  return false;
}

/**
 * Exact match dulu; kalau gagal, coba fuzzy BERBASIS KATA UTUH (bukan substring
 * karakter mentah -- biar "teknik" nggak salah ke-anggap ngandung "nik") --
 * jaga-jaga penulisan di Word beda dikit dari yang kita kenali persis (mis.
 * "No. KTP Nasional" tetap ke-mapping ke "no ktp"). Key pendek (<2 kata) tidak
 * ikut fuzzy sama sekali, biar tidak asal tembak ke label yang nggak nyambung.
 * Dipakai baik buat SIMPLE_LABEL_MAP maupun COMPENSATION_LABEL_MAP.
 */
function fuzzyLookup<T>(map: Record<string, T>, normalizedLabel: string): T | null {
  if (map[normalizedLabel] !== undefined) return map[normalizedLabel];

  const labelWords = normalizedLabel.split(" ").filter(Boolean);
  let bestKey: string | null = null;
  for (const key of Object.keys(map)) {
    const keyWords = key.split(" ").filter(Boolean);
    if (keyWords.length < 2) continue; // key 1 kata terlalu rawan salah tembak, skip fuzzy
    if (containsWordSequence(labelWords, keyWords) || containsWordSequence(keyWords, labelWords)) {
      if (!bestKey || keyWords.length > bestKey.split(" ").length) bestKey = key;
    }
  }
  return bestKey !== null ? map[bestKey] : null;
}

function resolveSimpleLabel(normalizedLabel: string): LabelResolver | null {
  return fuzzyLookup(SIMPLE_LABEL_MAP, normalizedLabel);
}

const COMPENSATION_LABEL_MAP: Record<string, string> = {
  "gaji pokok": "gaji_pokok",
  "tunjangan transportasi": "tunjangan_transportasi",
  "tunjangan penugasan proyek": "tunjangan_penugasan_proyek",
  "tunjangan akomodasi": "tunjangan_akomodasi",
  "total gross gaji": "total_gross_gaji",
};

function resolveCompensationLabel(normalizedLabel: string): string | null {
  return fuzzyLookup(COMPENSATION_LABEL_MAP, normalizedLabel);
}

/** Ambil angka Rupiah mentah dari string terformat "Rp 5.000.000" -> 5000000, buat kebutuhan terbilang. */
function parseRupiah(formatted: string): number {
  const digits = formatted.replace(/[^0-9]/g, "");
  return digits ? Number(digits) : 0;
}

const SATUAN = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh",
  "sebelas", "dua belas", "tiga belas", "empat belas", "lima belas", "enam belas", "tujuh belas", "delapan belas", "sembilan belas"];

function threeDigitsToWords(num: number): string {
  if (num === 0) return "";
  if (num < 20) return SATUAN[num];
  if (num < 100) {
    const p = Math.floor(num / 10);
    const s = num % 10;
    return `${p === 1 ? "sepuluh" : `${SATUAN[p]} puluh`}${s ? ` ${SATUAN[s]}` : ""}`;
  }
  const r = Math.floor(num / 100);
  const s = num % 100;
  return `${r === 1 ? "seratus" : `${SATUAN[r]} ratus`}${s ? ` ${threeDigitsToWords(s)}` : ""}`;
}

/** Terbilang Rupiah penuh (ribu/juta/miliar) -- dipakai buat kolom "(...)" di tabel kompensasi. */
export function terbilangRupiah(amount: number): string {
  if (amount === 0) return "nol rupiah";
  const scaleWords = ["", "ribu", "juta", "miliar", "triliun"];
  const groups: string[] = [];
  let remaining = Math.round(amount);
  let scaleIdx = 0;
  while (remaining > 0) {
    const group = remaining % 1000;
    if (group > 0) {
      let text = threeDigitsToWords(group);
      if (scaleIdx === 1 && group === 1) text = "seribu";
      else if (scaleWords[scaleIdx]) text = `${text} ${scaleWords[scaleIdx]}`;
      groups.unshift(text);
    }
    remaining = Math.floor(remaining / 1000);
    scaleIdx++;
  }
  return `${groups.join(" ")} rupiah`.trim();
}

/** Pola kalimat Pasal 2 (durasi + tanggal mulai/berakhir) yang formatnya khas banyak blank sekaligus dalam 1 kalimat. */
const DURATION_SENTENCE_RE = new RegExp(
  "perjanjian\\s+ini\\s+berlaku\\s+selama" + WS + DOT_RUN + WS + "\\(" + WS + DOT_RUN + WS + "\\)" + WS + "bulan,?" + WS +
  "berlaku\\s+mulai\\s+tanggal" + WS + DOT_RUN + WS + "bulan" + WS + DOT_RUN + WS + "tahun" + WS + DOT_RUN + WS +
  "\\(" + WS + DOT_RUN + WS + "/" + WS + DOT_RUN + WS + "/" + WS + DOT_RUN + WS + "\\)" + WS +
  "dan\\s+berakhir\\s+tanggal" + WS + DOT_RUN + WS + "bulan" + WS + DOT_RUN + WS + "tahun" + WS + DOT_RUN + WS +
  "\\(" + WS + DOT_RUN + WS + "/" + WS + DOT_RUN + WS + "/" + WS + DOT_RUN + WS + "\\)" + WS + "\\.?",
  "i"
);

function buildDurationSentence(data: Record<string, string>): string {
  return (
    `Perjanjian ini berlaku selama ${data.durasi_terbilang} (${data.durasi_bulan}) bulan, berlaku mulai tanggal ` +
    `${data.tanggal_mulai_hari} bulan ${data.tanggal_mulai_bulan} tahun ${data.tanggal_mulai_tahun} ` +
    `(${data.tanggal_mulai_slash}) dan berakhir tanggal ${data.tanggal_selesai_hari} bulan ${data.tanggal_selesai_bulan} ` +
    `tahun ${data.tanggal_selesai_tahun} (${data.tanggal_selesai_slash}).`
  );
}

/**
 * Pola kalimat pembuka "Pada hari ini .... tanggal .... bulan .... tahun ....
 * (.../.../....)" yang umum di kop perjanjian. BEDA dari Pasal 2 -- kalimat ini
 * biasanya dilanjut teks spesifik perusahaan (lokasi, dst) yang TIDAK BOLEH
 * di-hardcode di kode. Makanya cuma bagian tanggalnya yang di-generate ulang,
 * prefix & suffix aslinya (grup 1 & 2) diambil dari teks asli & dipertahankan.
 */
const OPENING_DATE_RE = new RegExp(
  "^(.*?)pada\\s+hari\\s+ini" + WS + DOT_RUN + WS + "tanggal" + WS + DOT_RUN + WS + "bulan" + WS + DOT_RUN + WS +
  "tahun" + WS + DOT_RUN + WS + "\\(" + WS + DOT_RUN + WS + "/" + WS + DOT_RUN + WS + "/" + WS + DOT_RUN + WS + "\\)(.*)$",
  "i"
);

function buildOpeningDateSentence(data: Record<string, string>, prefix: string, suffix: string): string {
  return (
    `${prefix}Pada hari ini ${data.hari_ttd}, tanggal ${data.tanggal_ttd_hari} bulan ${data.tanggal_ttd_bulan} ` +
    `tahun ${data.tanggal_ttd_tahun} (${data.tanggal_ttd_slash})${suffix}`
  );
}

/**
 * Pola "Tertanggal: .... 2026" -- tahun di template SUDAH ketikan manual
 * (angka literal, bukan blank), jadi cuma bagian tanggal+bulan yang diisi
 * otomatis (pakai tanggal hari ini generate dijalankan); tahun aslinya di
 * template dipertahankan apa adanya (grup 1), TIDAK dipaksa ganti ke tahun
 * berjalan -- kalau tahunnya suatu saat sudah tidak sesuai, itu perlu
 * diedit manual di templatenya, bukan ditimpa otomatis oleh sistem.
 */
const TERTANGGAL_RE = new RegExp(`^tertanggal\\s*[:\\uFF1A]\\s*${DOT_RUN}\\s*(\\d{4})\\s*$`, "i");

function buildTertanggalLine(data: Record<string, string>, originalYear: string): string {
  return `Tertanggal: ${data.tanggal_ttd_hari} ${data.tanggal_ttd_bulan} ${originalYear}`;
}

export type AutoFillResult = { buffer: Buffer; filledLabels: string[] };

/**
 * Jalan SEBELUM docxtemplater. Timpa langsung paragraf/cell yang labelnya
 * dikenali. Apa pun yang tidak match (termasuk tag {..} kalau user tetap mau
 * pakai) dibiarkan apa adanya buat diproses docxtemplater sesudah ini.
 */
export function autoFillDocx(templateBuffer: Buffer, mergeData: Record<string, string>): AutoFillResult {
  const zip = new PizZip(templateBuffer);
  const file = zip.file("word/document.xml");
  if (!file) throw new Error("File bukan .docx yang valid.");
  let xml = file.asText();
  const filledLabels: string[] = [];

  // --- Tier 1: baris tabel kompensasi (label di 1 cell, nilai di cell terakhir baris yang sama) ---
  xml = xml.replace(/<w:tr[ >][\s\S]*?<\/w:tr>/g, (rowXml) => {
    const cellMatches = [...rowXml.matchAll(/<w:tc[ >][\s\S]*?<\/w:tc>/g)];
    if (cellMatches.length < 2) return rowXml;
    const labelKey = normalizeLabel(visibleTextOf(cellMatches[0][0]));
    const mergeKey = resolveCompensationLabel(labelKey);
    if (!mergeKey) return rowXml;

    const amount = parseRupiah(mergeData[mergeKey] ?? "0");

    // Jangan asumsikan kolom nilai = cell TERAKHIR -- tabel kompensasi bisa
    // punya kolom ke-3 (mis. "Syarat dan Ketentuan") setelah kolom Nilai, jadi
    // kolom terakhir bukan yang mau diisi. Coba tiap cell SETELAH label satu
    // per satu, berhenti begitu 1 cell KETEMU pola "Rp ...." / "(....)" --
    // supaya nggak nyasar ke kolom syarat & ketentuan di sebelahnya.
    const rupiahLineRe = new RegExp(`rp\\.?\\s*${DOT_RUN}`, "i");
    const terbilangLineRe = new RegExp(`\\(\\s*${DOT_RUN}\\s*\\)`);
    const blankOnlyRe = new RegExp(`^${DOT_RUN}$`);

    // Absolut relatif rowXml -- cellStart + posisi paragraf di dalam cell.
    const candidateCells = cellMatches.slice(1).map((cm) => ({
      cellStart: cm.index!,
      paras: [...cm[0].matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)],
    }));

    const edits: { start: number; end: number; text: string }[] = [];
    let rupiahCellIndex = -1;
    let terbilangFilled = false;

    // 1) Cari & isi baris "Rp ....", dan "(....)" KALAU ada di cell yang SAMA.
    for (let ci = 0; ci < candidateCells.length; ci++) {
      const { cellStart, paras } = candidateCells[ci];
      let matchedInCell = false;
      for (const pm of paras) {
        const text = visibleTextOf(pm[0]).trim();
        const start = cellStart + pm.index!;
        if (rupiahLineRe.test(text)) {
          edits.push({ start, end: start + pm[0].length, text: rewriteParagraph(pm[0], `Rp ${amount.toLocaleString("id-ID")}`) });
          matchedInCell = true;
        } else if (terbilangLineRe.test(text)) {
          edits.push({ start, end: start + pm[0].length, text: rewriteParagraph(pm[0], `(${terbilangRupiah(amount)})`) });
          matchedInCell = true;
          terbilangFilled = true;
        }
      }
      if (matchedInCell) { rupiahCellIndex = ci; break; }
    }

    // 2) Kalau kolom Nilai cuma punya baris "Rp ...." TANPA baris "(....)" sendiri
    // (mis. baris TOTAL GROSS GAJI), terbilang-nya taruh di cell SETELAHNYA yang
    // isinya CUMA blank polos (mis. kolom "Syarat dan Ketentuan" yang kosong) --
    // BUKAN cell yang isinya teks syarat sungguhan (itu dibiarkan apa adanya).
    if (rupiahCellIndex !== -1 && !terbilangFilled) {
      for (let i = rupiahCellIndex + 1; i < candidateCells.length; i++) {
        const { cellStart, paras } = candidateCells[i];
        // Jangan syaratkan cell cuma punya PERSIS 1 paragraf -- bisa ada paragraf
        // kosong tambahan buat spacing vertikal. Cukup: semua paragraf yang
        // ADA ISINYA di cell ini harus blank polos (bukan teks syarat sungguhan),
        // lalu timpa paragraf blank PERTAMA yang ketemu.
        const nonEmptyParas = paras.filter((pm) => visibleTextOf(pm[0]).trim().length > 0);
        if (nonEmptyParas.length === 0) continue;
        // Terima blank polos MAUPUN yang sudah dibungkus kurung "(....)" --
        // dua-duanya sama-sama "belum ada isi", cuma beda gaya penulisan di template.
        const wrappedBlankRe = new RegExp(`^\\(?\\s*${DOT_RUN}\\s*\\)?$`);
        const allBlank = nonEmptyParas.every((pm) => wrappedBlankRe.test(visibleTextOf(pm[0]).trim()));
        if (!allBlank) continue;
        const target = nonEmptyParas[0];
        const start = cellStart + target.index!;
        edits.push({ start, end: start + target[0].length, text: rewriteParagraph(target[0], `(${terbilangRupiah(amount)})`) });
        break;
      }
    }

    // Fallback: kalau tidak ada cell yang cocok pola "Rp ...." sama sekali
    // (mis. cell cuma berisi titik-titik polos tanpa "Rp" di depannya), timpa
    // paragraf pertama yang isinya blank di CELL PALING DEKAT setelah label saja.
    if (rupiahCellIndex === -1 && candidateCells[0]) {
      for (const pm of candidateCells[0].paras) {
        const text = visibleTextOf(pm[0]).trim();
        if (new RegExp(DOT_RUN).test(text)) {
          const start = candidateCells[0].cellStart + pm.index!;
          edits.push({ start, end: start + pm[0].length, text: rewriteParagraph(pm[0], `Rp ${amount.toLocaleString("id-ID")}`) });
          rupiahCellIndex = 0;
          break;
        }
      }
    }
    if (rupiahCellIndex === -1) return rowXml;

    filledLabels.push(labelKey);
    edits.sort((a, b) => b.start - a.start);
    let newRowXml = rowXml;
    for (const e of edits) newRowXml = newRowXml.slice(0, e.start) + e.text + newRowXml.slice(e.end);
    return newRowXml;
  });

  // --- Tier 2: kalimat Pasal 2 (durasi + tanggal mulai/berakhir dalam 1 paragraf) ---
  xml = xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (paraXml) => {
    const text = visibleTextOf(paraXml).replace(/\s+/g, " ").trim();
    if (!DURATION_SENTENCE_RE.test(text)) return paraXml;
    filledLabels.push("Pasal 2 (durasi & tanggal)");
    return rewriteParagraph(paraXml, buildDurationSentence(mergeData));
  });

  // --- Tier 2b: kalimat pembuka "Pada hari ini .... (.../.../....)" ---
  xml = xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (paraXml) => {
    const text = visibleTextOf(paraXml).replace(/\s+/g, " ").trim();
    const match = text.match(OPENING_DATE_RE);
    if (!match) return paraXml;
    filledLabels.push("Kalimat pembuka (Pada hari ini ...)");
    return rewriteParagraph(paraXml, buildOpeningDateSentence(mergeData, match[1], match[2]));
  });

  // --- Tier 2c: "Tertanggal: .... 2026" (tahun literal dipertahankan, cuma tanggal+bulan diisi) ---
  xml = xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (paraXml) => {
    const text = visibleTextOf(paraXml).trim();
    const match = text.match(TERTANGGAL_RE);
    if (!match) return paraXml;
    filledLabels.push("Tertanggal");
    return rewriteParagraph(paraXml, buildTertanggalLine(mergeData, match[1]));
  });

  // --- Tier 3: baris "Label : titik-titik" biasa (paling umum) ---
  xml = xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (paraXml) => {
    const text = visibleTextOf(paraXml);
    const match = text.match(new RegExp(`^\\s*(.+?)\\s*[:\\uFF1A]\\s*${DOT_RUN}\\s*$`));
    if (!match) return paraXml;
    const labelKey = normalizeLabel(match[1]);
    const resolver = resolveSimpleLabel(labelKey);
    if (!resolver) return paraXml;

    const value = resolver(mergeData) || "-";
    filledLabels.push(match[1].trim());
    return rewriteParagraph(paraXml, `${match[1].trim()} : ${value}`);
  });

  // --- Tier 4: "Label" sendirian di 1 paragraf, ": titik-titik" di PARAGRAF BERIKUTNYA ---
  // (mis. blok tanda tangan "Nama Lengkap" lalu baris baru ":............" terpisah).
  // PENTING: pakai posisi index (bukan cari-teks/.replace(string)) -- kalau ada
  // 2 baris blank dengan teks XML PERSIS SAMA (mis. dua ": …………………….." dengan
  // jumlah titik identik) di tempat berbeda, .replace(string) bakal nimpa
  // kemunculan PERTAMA di seluruh dokumen, bukan yang dimaksud -- salah sasaran.
  {
    const paraMatches = [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)];
    const edits: { start: number; end: number; text: string }[] = [];
    for (let i = 0; i < paraMatches.length - 1; i++) {
      const labelText = visibleTextOf(paraMatches[i][0]).trim();
      if (!labelText || /[:：]/.test(labelText)) continue;
      const nextMatch = paraMatches[i + 1];
      const nextText = visibleTextOf(nextMatch[0]).trim();
      if (!new RegExp(`^[:\\uFF1A]\\s*${DOT_RUN}\\s*$`).test(nextText)) continue;

      const resolver = resolveSimpleLabel(normalizeLabel(labelText));
      if (!resolver) continue;
      const value = resolver(mergeData) || "-";
      filledLabels.push(labelText);
      edits.push({ start: nextMatch.index!, end: nextMatch.index! + nextMatch[0].length, text: rewriteParagraph(nextMatch[0], `: ${value}`) });
    }
    // Terapkan dari index PALING BESAR ke KECIL -- supaya index yang belum
    // diproses tidak ikut bergeser gara-gara panjang teks berubah.
    edits.sort((a, b) => b.start - a.start);
    for (const e of edits) xml = xml.slice(0, e.start) + e.text + xml.slice(e.end);
  }

  // --- Tier 5: 1 baris tabel dengan cell "isinya cuma N label" + cell lain "isinya cuma N blank" ---
  // (mis. blok tanda tangan 2 kolom: kolom kiri "PERUSAHAAN" sudah keisi manual,
  // kolom kanan "KARYAWAN" isinya "Nama Lengkap" / "Jabatan" bertumpuk di 1 cell
  // lalu ": ...." / ": ...." bertumpuk di cell lain -- BUKAN label-blank berpasangan
  // langsung kayak Tier 4, jadi perlu dicocokkan per-cell, bukan per-paragraf).
  // Sama kayak Tier 4 -- pakai index, JANGAN .replace(string) -- 2 blank
  // dengan jumlah titik identik ("SATU KOLUMN sama semua panjangnya") sangat
  // mungkin terjadi di tabel beneran, apalagi kalau blank-nya diketik dengan
  // pola berulang yang sama (mis. semua ":............" 12 titik persis).
  xml = xml.replace(/<w:tr[ >][\s\S]*?<\/w:tr>/g, (rowXml) => {
    const cellMatches = [...rowXml.matchAll(/<w:tc[ >][\s\S]*?<\/w:tc>/g)];
    if (cellMatches.length < 2) return rowXml;

    const blankParaRe = new RegExp(`^[:\\uFF1A]\\s*${DOT_RUN}\\s*$`);
    const cellInfo = cellMatches.map((cm) => {
      const cellStart = cm.index!;
      const paraMatches = [...cm[0].matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)]
        .filter((pm) => visibleTextOf(pm[0]).trim().length > 0)
        .map((pm) => ({ text: pm[0], start: cellStart + pm.index!, end: cellStart + pm.index! + pm[0].length }));
      const isPureBlank = paraMatches.length > 0 && paraMatches.every((p) => blankParaRe.test(visibleTextOf(p.text).trim()));
      const isPureLabel = !isPureBlank && paraMatches.length > 0 && paraMatches.every((p) => {
        const t = visibleTextOf(p.text).trim();
        return !/[:：]/.test(t) && resolveSimpleLabel(normalizeLabel(t)) !== null;
      });
      return { paras: paraMatches, isPureBlank, isPureLabel };
    });

    const edits: { start: number; end: number; text: string }[] = [];
    for (let i = 0; i < cellInfo.length; i++) {
      if (!cellInfo[i].isPureBlank) continue;
      // Cari cell "pure label" TERDEKAT SEBELUM cell blank ini (skip cell kosong/lain di antaranya).
      let labelCellInfo: (typeof cellInfo)[number] | null = null;
      for (let j = i - 1; j >= 0; j--) {
        if (cellInfo[j].isPureLabel) { labelCellInfo = cellInfo[j]; break; }
        if (cellInfo[j].paras.length > 0) break; // ada cell berisi tapi bukan pure-label -- berhenti cari, jangan lompat jauh
      }
      if (!labelCellInfo || labelCellInfo.paras.length !== cellInfo[i].paras.length) continue;

      for (let k = 0; k < labelCellInfo.paras.length; k++) {
        const labelText = visibleTextOf(labelCellInfo.paras[k].text).trim();
        const resolver = resolveSimpleLabel(normalizeLabel(labelText))!;
        const value = resolver(mergeData) || "-";
        filledLabels.push(labelText);
        const target = cellInfo[i].paras[k];
        edits.push({ start: target.start, end: target.end, text: rewriteParagraph(target.text, `: ${value}`) });
      }
    }
    if (edits.length === 0) return rowXml;
    edits.sort((a, b) => b.start - a.start);
    let newRowXml = rowXml;
    for (const e of edits) newRowXml = newRowXml.slice(0, e.start) + e.text + newRowXml.slice(e.end);
    return newRowXml;
  });

  zip.file("word/document.xml", xml);
  return { buffer: zip.generate({ type: "nodebuffer" }) as Buffer, filledLabels };
}

export type TableDebugRow = { cells: string[] };

/** Dump struktur tabel MENTAH (isi tiap cell per baris) -- dipakai buat diagnosa kalau Tier 1 (tabel kompensasi) gagal match dan perlu lihat persis apa yang sistem baca dari file aslinya. */
export function debugTableRows(templateBuffer: Buffer): TableDebugRow[] {
  const zip = new PizZip(templateBuffer);
  const file = zip.file("word/document.xml");
  if (!file) return [];
  const xml = file.asText();
  const rows = [...xml.matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)].map((m) => m[0]);
  return rows.map((rowXml) => ({
    cells: [...rowXml.matchAll(/<w:tc[ >][\s\S]*?<\/w:tc>/g)].map((m) => visibleTextOf(m[0]).trim()),
  }));
}
