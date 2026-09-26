import ExcelJS from "exceljs";
import fs from "fs/promises";
import path from "path";

// Template resmi client Astra International -- disalin ke src/lib/timesheet-templates.
// Catatan deploy: kalau target hosting-nya serverless (mis. Vercel), pastikan file ini
// ikut ter-bundle (Next.js men-trace file statis yang di-`fs.readFile` dari dalam
// direktori project secara otomatis untuk Route Handler/Server Action).
const TEMPLATE_PATH = path.join(process.cwd(), "src/lib/timesheet-templates/astra-timesheet-template.xlsx");

const DATA_START_ROW = 8;

export type AstraGeneratorRow = {
  entry_date: string; // ISO yyyy-mm-dd
  issueKey: string;
  issueSummary: string;
  hours: number;
  isEmpty: boolean;
  username: string;
  fullName: string;
  period: string;
  projectName: string;
  activityType: string;
};

export type AstraGeneratorInput = {
  talentDisplayName: string; // ditulis ke H3 & dipakai fallback kolom Full Name/Username
  clientName: string; // fallback kolom "Project Name" (kolom 10) kalau baris itu sendiri kosong
  rows: AstraGeneratorRow[]; // urut tanggal (hasil buildMonthlyCalendar + jira rows)
};

const FOOTER_LABELS = ["Consultant (Developer)", "Team Leader Approval", "Project Manager Approval", "Resource Manager Approval"] as const;
const FOOTER_COLUMNS = [3, 6, 9, 11] as const;

/**
 * Port setia dari algoritma generator.js proyek timesheet-converter lama --
 * baca template resmi Astra International (exceljs), isi baris data mulai
 * row 8, grouping per tanggal (buat merge cell), total row, header meta,
 * signature footer 4 kolom, lalu bersihkan sheet lain & sisa baris sample.
 */
export async function generateAstraTimesheetXlsx(input: AstraGeneratorInput): Promise<Buffer> {
  const buffer = await fs.readFile(TEMPLATE_PATH);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);

  const sheet = workbook.getWorksheet("Sheet1");
  if (!sheet) throw new Error('Template Astra tidak punya worksheet "Sheet1".');

  // Bongkar dulu merge BAWAAN template yang mulai dari row >= DATA_START_ROW
  // (mis. "I49:J49" pada sample row jauh di bawah) -- kalau tidak, ExcelJS
  // menolak ("Cannot merge already merged cells") begitu baris data/merge
  // grup baru kita menyentuh sel yang kebetulan masih ter-merge dari sononya.
  // Persis langkah pre-processing di generator.js lama (unmerge start row >= 8).
  const existingMerges = [...(sheet.model.merges ?? [])];
  for (const range of existingMerges) {
    const startCellRef = range.split(":")[0];
    const rowMatch = startCellRef.match(/\d+/);
    const startRow = rowMatch ? Number(rowMatch[0]) : 0;
    if (startRow >= DATA_START_ROW) {
      sheet.unMergeCells(range);
    }
  }

  // Style acuan dari row 8 template, di-clone ke setiap baris data yang digenerate.
  const styleRow = sheet.getRow(DATA_START_ROW);
  const styleByCol = new Map<number, Partial<ExcelJS.Style>>();
  for (let col = 1; col <= 11; col++) {
    const cell = styleRow.getCell(col);
    styleByCol.set(col, {
      font: cell.font ? { ...cell.font } : undefined,
      border: cell.border ? { ...cell.border } : undefined,
      fill: cell.fill ? { ...cell.fill } : undefined,
      numFmt: cell.numFmt,
    });
  }

  // Hitung group number: naik tiap kali tanggal berganti (baris berurutan
  // dengan tanggal sama = group yang sama, nanti di-merge).
  let currentGroupNumber = 0;
  let lastDate: string | null = null;
  const groupNumbers: number[] = [];
  for (const row of input.rows) {
    if (row.entry_date !== lastDate) {
      currentGroupNumber++;
      lastDate = row.entry_date;
    }
    groupNumbers.push(currentGroupNumber);
  }

  const lastDataRow = DATA_START_ROW + input.rows.length - 1;

  input.rows.forEach((r, idx) => {
    const rowNumber = DATA_START_ROW + idx;
    const groupNumber = groupNumbers[idx];
    const row = sheet.getRow(rowNumber);

    row.getCell(1).value = groupNumber;
    row.getCell(2).value = r.issueKey;
    row.getCell(3).value = r.issueSummary;
    // Hari kosong (weekend/libur/belum diisi) tampil "-" di kolom Hours juga,
    // bukan 0 -- persis mapper.js lama (hours: '-' untuk placeholder row).
    row.getCell(4).value = r.isEmpty ? "-" : r.hours;
    row.getCell(5).value = r.isEmpty ? "-" : { formula: `D${rowNumber}/8` };
    row.getCell(6).value = r.entry_date;
    row.getCell(7).value = r.username || input.talentDisplayName;
    row.getCell(8).value = r.fullName || input.talentDisplayName;
    row.getCell(9).value = r.period;
    row.getCell(10).value = r.projectName || input.clientName;
    row.getCell(11).value = r.activityType;

    for (let col = 1; col <= 11; col++) {
      const cell = row.getCell(col);
      const baseStyle = styleByCol.get(col);
      if (baseStyle?.font) cell.font = { ...baseStyle.font };
      if (baseStyle?.border) cell.border = { ...baseStyle.border };
      if (baseStyle?.fill) cell.fill = baseStyle.fill as ExcelJS.Fill;
      // Selalu di-set eksplisit (bukan cuma kalau truthy) -- kalau row 8 templat
      // kolom ini nggak punya numFmt eksplisit (mis. kolom Hours), cell target
      // (row 9, 10, dst) bisa masih bawa numFmt sisa dari template asli (mis.
      // format tanggal), bikin angka jam malah tampil sebagai tanggal.
      cell.numFmt = baseStyle?.numFmt ?? "General";
    }

    if (r.isEmpty) {
      for (let col = 1; col <= 11; col++) {
        const cell = row.getCell(col);
        cell.font = { ...(cell.font ?? {}), color: { argb: "FFCC0000" } };
      }
    }
  });

  // Merge baris-baris dengan group number sama di kolom [1,6,7,8,9].
  let groupStartIdx = 0;
  for (let idx = 1; idx <= input.rows.length; idx++) {
    const isBoundary = idx === input.rows.length || groupNumbers[idx] !== groupNumbers[groupStartIdx];
    if (isBoundary) {
      const startRow = DATA_START_ROW + groupStartIdx;
      const endRow = DATA_START_ROW + idx - 1;
      if (endRow > startRow) {
        for (const col of [1, 6, 7, 8, 9]) {
          sheet.mergeCells(startRow, col, endRow, col);
          const cell = sheet.getCell(startRow, col);
          cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        }
      }
      groupStartIdx = idx;
    }
  }

  // Total row.
  const totalRowNumber = lastDataRow + 1;
  const totalRow = sheet.getRow(totalRowNumber);
  totalRow.getCell(3).value = "Total";
  totalRow.getCell(4).value = { formula: `SUM(D${DATA_START_ROW}:D${lastDataRow})` };
  totalRow.getCell(5).value = { formula: `SUM(E${DATA_START_ROW}:E${lastDataRow})` };

  // Header meta.
  sheet.getCell("H3").value = input.talentDisplayName;
  sheet.getCell("D3").value = { formula: `F${DATA_START_ROW}` };
  sheet.getCell("D4").value = { formula: `F${lastDataRow}` };

  // Bersihkan sisa baris sample template.
  for (let row = lastDataRow + 2; row <= lastDataRow + 2 + 25; row++) {
    for (let col = 1; col <= 12; col++) {
      sheet.getCell(row, col).value = null;
    }
  }

  // Signature footer.
  const footerLabelRow = lastDataRow + 5;
  const footerSignRow = footerLabelRow + 3;
  const footerDateRow = footerLabelRow + 4;

  FOOTER_COLUMNS.forEach((col, i) => {
    sheet.mergeCells(footerLabelRow, col, footerLabelRow, col + 1);
    const labelCell = sheet.getCell(footerLabelRow, col);
    labelCell.value = FOOTER_LABELS[i];
    labelCell.font = { bold: true };
    labelCell.alignment = { vertical: "middle", horizontal: "center" };
    labelCell.border = {
      top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" },
    };

    const signCell = sheet.getCell(footerSignRow, col);
    signCell.value = "(_____________________)";
    signCell.alignment = { horizontal: "center" };

    const dateCell = sheet.getCell(footerDateRow, col);
    dateCell.value = "Date:";
  });

  // Hapus semua sheet lain selain Sheet1.
  for (const ws of [...workbook.worksheets]) {
    if (ws.name !== "Sheet1") workbook.removeWorksheet(ws.id);
  }

  const out = await workbook.xlsx.writeBuffer();
  return Buffer.from(out);
}
