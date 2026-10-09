"""Stress-test workbooks for Sales Google Sheet Sync (docs/design/SALES-SHEET-SYNC-STRESS-TEST.md).

Two workbooks shaped like a sales team's own spreadsheets: messy headers, mixed value formats, typed cells
(real numbers, dates, currency formats, formulas), blanks, duplicates and rows that must be refused. Every
client name starts with "UJI " so imported rows can be found and removed. Synthetic data only.

Run: python generate_sheets.py <out_dir>   (needs openpyxl)
"""
import datetime as dt
import sys
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill

D = dt.date
HEAD = Font(bold=True, color="FFFFFF")
FILL = PatternFill("solid", fgColor="194667")
RP = '"Rp"#,##0'


def sheet(wb, title, headers, rows, formats=None, first=False):
    ws = wb.active if first else wb.create_sheet()
    ws.title = title
    ws.append(headers)
    for c in ws[1]:
        c.font, c.fill = HEAD, FILL
    for r in rows:
        ws.append(r)
    for col, fmt in (formats or {}).items():
        for cell in ws[col][1:]:
            if isinstance(cell.value, (int, float, dt.date)):
                cell.number_format = fmt
    for i, h in enumerate(headers, 1):
        ws.column_dimensions[ws.cell(1, i).column_letter].width = max(12, min(40, len(str(h)) + 6))
    ws.freeze_panes = "A2"
    return ws


def notes(wb, rows):
    ws = wb.create_sheet("Catatan Uji")
    ws.append(["#", "Tab", "Baris", "Kasus", "Yang diharapkan sistem yang matang"])
    for c in ws[1]:
        c.font, c.fill = HEAD, FILL
    for i, r in enumerate(rows, 1):
        ws.append([i, *r])
    for col, w in zip("ABCDE", (5, 14, 8, 60, 70)):
        ws.column_dimensions[col].width = w


# ── Opportunity Tracker ────────────────────────────────────────────────────────────────────────────────────
OT_MESSY = ["No. Opty", "Qualified?", "Nama Klien ", "Jenis Layanan", "Kebutuhan", "Status", "Update Terakhir",
            "Est. Nilai Deal", "Detail", "Tipe Klien", "PIC Sales", "Tgl Komunikasi Terakhir", "BANT", "Alasan Drop",
            "Posisi", "Level", "Jumlah Orang", "Rate / bulan", "Sumber Lead", "Region", "Catatan Internal"]
LONG = "Kebutuhan tim data untuk migrasi warehouse; " * 120
OT_ROWS = [
    # clean, matches the ERP's own labels and codes
    ["", "Yes", "UJI PT Maju Jaya Tbk", "Outsourcing", "2 Backend Java", "Proposal Sent", "Kirim proposal 1 Okt", 360000000, "Spring Boot, 3th exp", "Existing", "Yoses Dwi Maheswara", D(2026, 10, 1), 4, "", "Backend Engineer", "Senior", 2, 15000000, "Referral", "Jakarta", ""],
    # status / service / client type spelled differently
    ["", "TRUE", "UJI PT Sinar Abadi", "Manage Service", "Helpdesk L1", "proposal sent ", "", "", "", "NEW", "SALES (test)", "2026-09-28", "3", "", "IT Support", "Junior", "5", "8500000", "Website", "Bandung", ""],
    ["", "Ya", "UJI CV Kreasi Digital", "Managed Services", "Squad mobile", "WIN", "PO masuk", "Rp 540.000.000", "", "Lama", "Yoses Dwi Maheswara", "01/10/2026", "5", "", "Flutter Developer", "Mid", "3 orang", "Rp 18.000.000", "Event", "Surabaya", ""],
    ["", "✓", "UJI PT Nusantara Logistik", "Headhunt", "CTO", "Won", "", "15jt", "", "Baru", "tyas ", "1 Okt 2026", "High", "", "CTO", "C-Level", "1", "15jt", "LinkedIn", "Jakarta", "Klien minta NDA"],
    ["", "x", "UJI PT Mega Retail", "RPO", "Rekrutmen 20 SPG", "Closed Lost", "", "", "", "Existing", "Budi S.", "Oct 1, 2026", "2", "Budget dipotong", "Sales Promotion", "Entry", "20", "4.500.000", "Cold call", "Medan", ""],
    ["", "No", "UJI PT Garuda Teknologi", "Project-based", "Website revamp", "Drop", "", "", "", "existing", "Yoses Dwi Maheswara", "10/01/2026", "1", "Pilih vendor lain", "", "", "", "USD 2,000", "Referral", "Jakarta", ""],
    ["", "", "UJI PT Cahaya Farma", "IT Consulting", "Assessment keamanan", "On Hold", "Tunggu budget Q1", "", "", "New", "Yoses Dwi Maheswara", "kemarin", "80%", "", "Security Analyst", "Sr.", "2-3", "TBD", "Website", "Jakarta", ""],
    ["", "FALSE", "UJI PT Bumi Konstruksi", "Training", "Pelatihan K3", "CV Submitted", "", "", "", "New", "SALES (test)", D(2026, 9, 30), 3, "", "Trainer", "Lead", 1.0, 12500000.5, "Event", "Balikpapan", ""],
    ["", "Yes", "UJI PT Samudra Pangan", "Outsourcing", "Admin gudang", "Need Action", "Klien belum balas 2 minggu", "", "", "Existing", "Yoses Dwi Maheswara", "", "4/5", "", "Admin", "Junior/Mid", "4", "6000000", "", "Semarang", ""],
    ["", "Yes", "UJI PT Solusi Prima", "Solutioning", "Data platform", "Solutioning", "", "", LONG, "New", "Yoses Dwi Maheswara", "2026-10-05", "4", "", "Data Engineer", "Senior", "2", "22000000", "Partner", "Jakarta", ""],
    # rows a careful import must refuse or warn about
    ["", "Yes", "", "Outsourcing", "Tanpa nama klien", "Proposal Sent", "", "", "", "New", "Yoses Dwi Maheswara", "2026-10-02", "3", "", "QA Engineer", "Mid", "1", "9000000", "", "", "Baris tanpa klien"],
    ["", "Yes", "UJI PT Tanpa PIC", "Outsourcing", "Tanpa PIC", "Proposal Sent", "", "", "", "New", "", "2026-10-02", "3", "", "QA Engineer", "Mid", "1", "9000000", "", "", "Baris tanpa PIC"],
    ["Q4 2026 ▼", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "Baris judul seksi"],
    # identity: same Opty No twice, an Opty No that already exists in the ERP, injection-looking text
    ["UJI-OPTY-001", "Yes", "UJI PT Duplikat Satu", "Outsourcing", "Versi A", "Proposal Sent", "", "", "", "New", "Yoses Dwi Maheswara", "2026-10-03", "3", "", "DevOps", "Senior", "1", "20000000", "", "", "Opty No sama dengan baris berikut"],
    ["UJI-OPTY-001", "Yes", "UJI PT Duplikat Dua", "Outsourcing", "Versi B", "Win", "", "", "", "New", "Yoses Dwi Maheswara", "2026-10-04", "4", "", "DevOps", "Senior", "1", "21000000", "", "", "Opty No sama dengan baris sebelumnya"],
    ["OPTY2026-S058", "Yes", "UJI PT Menimpa Seed", "Outsourcing", "Opty No milik data lain", "Win", "", "", "", "Existing", "Yoses Dwi Maheswara", "2026-10-06", "5", "", "Backend Engineer", "Senior", "1", "25000000", "", "", "Opty No ini sudah ada di ERP (data seed)"],
    ["", "Yes", "UJI PT <script>alert(1)</script>", "Outsourcing", "=HYPERLINK(\"http://example.com\",\"klik\")", "Proposal Sent", "Baris 1\nBaris 2\n🚀 emoji", "", "", "New", "Yoses Dwi Maheswara", "2026-10-07", "3", "", "Frontend", "Mid", "1", "'15000000", "", "", "Teks mirip skrip dan formula"],
]
# a formula cell: the API returns its formatted result, not the formula
OT_ROWS[0][7] = "=R2*12*Q2"

OT_CLEAN = ["Opty No", "Sales Qualified", "Client Name", "Service Type", "Requirement Summary", "Opty Status", "Progress Notes",
            "Estimated Deal", "Detail Requirement", "Client Type", "Sales PIC", "Last Communication", "BANTE Score",
            "Dropped Reason", "Positions", "Level", "Headcount", "Price"]
OT_CLEAN_ROWS = [
    ["", "Yes", "UJI PT Rapi Satu", "outsourcing", "1 Backend", "proposal_sent", "", "180000000", "", "new", "Yoses Dwi Maheswara", "2026-10-01", "4", "", "Backend Engineer", "senior", "1", "15000000"],
    ["", "No", "UJI PT Rapi Dua", "headhunting", "HR Manager", "cv_submission", "", "", "", "existing", "SALES (test)", "2026-09-20", "3", "", "HR Manager", "manager", "1", "30000000"],
    ["", "Yes", "UJI PT Rapi Tiga", "managed_service", "Helpdesk", "win", "", "300000000", "", "existing", "Yoses Dwi Maheswara", "2026-09-15", "5", "", "IT Support", "junior", "5", "5000000"],
]

OT_WIDE = [f"Kolom Tambahan {i}" for i in range(1, 25)] + ["Nama Klien", "PIC Sales", "Rate / bulan", "Status"]
OT_WIDE_ROWS = [[f"x{i}" for i in range(1, 25)] + ["UJI PT Kolom Jauh", "Yoses Dwi Maheswara", "17000000", "Proposal Sent"]]

OT_NOTES = [
    ("Pipeline", "1", "Header beda dari label ERP (\"Nama Klien \" dengan spasi di akhir, \"PIC Sales\", \"Rate / bulan\") + 3 kolom ekstra", "Auto-match kolom berdasarkan nama mirip; kolom ekstra bisa diabaikan atau disimpan ke catatan"),
    ("Pipeline", "2", "Est. Nilai Deal berupa formula (=R2*12*Q2) dan sel angka berformat Rupiah", "Membaca nilai angka, bukan teks \"Rp360.000.000\""),
    ("Pipeline", "3-4", "Status \"proposal sent \", \"WIN\"; layanan \"Manage Service\" vs \"Managed Services\"; tipe klien \"NEW\"/\"Lama\"", "Pemetaan nilai: tiap nilai unik di sheet dipilih padanannya di ERP sekali, disimpan untuk sync berikutnya"),
    ("Pipeline", "4-6", "Uang: \"Rp 540.000.000\", \"15jt\", \"4.500.000\", \"USD 2,000\", \"TBD\"", "Parser Rupiah (titik ribuan, jt/juta); mata uang lain atau teks ditandai sebagai error baris, bukan kosong diam-diam"),
    ("Pipeline", "4-8", "Tanggal: \"01/10/2026\", \"10/01/2026\" (ambigu), \"1 Okt 2026\", \"Oct 1, 2026\", \"kemarin\", sel tanggal asli", "Pilih format tanggal per kolom (DD/MM vs MM/DD); nilai tak terbaca jadi error baris, bukan menghentikan seluruh sync"),
    ("Pipeline", "5,7", "Status \"Closed Lost\", \"On Hold\"; layanan \"IT Consulting\"; level \"C-Level\" — tidak ada di ERP", "Ditolak / minta dipetakan; jangan disimpan sebagai kode baru (deal bisa hilang dari Kanban)"),
    ("Pipeline", "4-9", "Headcount \"3 orang\", \"2-3\", 1.0; BANT \"High\", \"80%\", \"4/5\"", "Ambil angka yang jelas; yang ambigu ditandai"),
    ("Pipeline", "5,7", "PIC \"tyas \", \"Budi S.\" bukan akun Sales", "Cocokkan ke akun Sales; yang tidak cocok ditandai \"nama lama\" atau minta dipetakan"),
    ("Pipeline", "12-14", "Baris tanpa klien, tanpa PIC, dan baris judul seksi", "Dilewati dengan alasan per baris di laporan"),
    ("Pipeline", "15-16", "Opty No sama di dua baris", "Konflik dilaporkan; jangan baris kedua menimpa yang pertama diam-diam"),
    ("Pipeline", "17", "Opty No sudah ada di ERP (data seed)", "Preview menunjukkan \"akan mengubah record yang ada\" dan apa saja yang berubah"),
    ("Pipeline", "18", "Teks mirip <script> dan formula =HYPERLINK; catatan multi-baris dan emoji; harga dengan apostrof", "Disimpan sebagai teks biasa; tidak dieksekusi di ERP; Push tidak mengubahnya jadi formula"),
    ("Pipeline", "2-11", "Baris tanpa Opty No", "Pull kedua kali tidak boleh membuat duplikat"),
    ("Pipeline", "11", "Detail Requirement ~5.000 karakter", "Diterima atau dipotong dengan peringatan"),
    ("Rapi", "2-4", "Header dan kode persis seperti ERP", "Baseline: harus lolos 100% tanpa penyesuaian"),
    ("Lebar", "2", "Kolom yang dibutuhkan ada di kolom Y-AB (setelah 24 kolom tambahan)", "Semua kolom terbaca, tidak dibatasi A-Z"),
    ("Semua", "-", "Push", "Push hanya mengubah baris/kolom yang dipetakan; tidak menghapus kolom ekstra, format, atau tab lain"),
]

# ── PQ Tracker ─────────────────────────────────────────────────────────────────────────────────────────────
PQ_MESSY = ["ID Opty", "No PQ", "Stage", "Status Opty", "Klien", "Tipe", "Nama Project", "Posisi", "Layanan", "BU", "Level",
            "HC", "Prioritas", "BANT", "Harga", "Tgl Request", "Tgl Approval", "Link PO", "Sales", "Keterangan", "No PO", "Termin"]
PQ_ROWS = [
    ["", "", "On Going", "Win", "UJI PT Maju Jaya Tbk", "Existing", "Core Banking Squad", "Backend Engineer", "Outsourcing", "IT Services", "Senior", 2, "High", 4, 15000000, D(2026, 9, 25), D(2026, 10, 1), "https://example.com/po/123", "Yoses Dwi Maheswara", "PO via email", "PO/2026/123", "Bulanan"],
    ["", "", "on going", "win", "UJI CV Kreasi Digital", "Lama", "Mobile Apps", "Flutter Developer", "Manage Service", "Digital", "Mid", "3 orang", "P1", "5", "Rp 18.000.000", "01/10/2026", "1 Okt 2026", "", "SALES (test)", "", "", ""],
    ["", "", "Hold", "Proposal Sent", "UJI PT Sinar Abadi", "NEW", "Helpdesk", "IT Support", "Managed Services", "", "Junior", "5", "Tinggi", "", "8.500.000", "2026-09-28", "", "", "Yoses Dwi Maheswara", "", "", ""],
    ["", "", "On Going", "Win", "UJI PT Tanpa Project", "Existing", "", "QA", "Outsourcing", "IT Services", "Mid", "1", "Medium", "3", "9000000", "2026-10-02", "", "", "Yoses Dwi Maheswara", "Project kosong", "", ""],
    ["", "", "On Going", "Win", "UJI PT Tanpa Layanan", "Existing", "ERP Support", "Consultant", "", "IT Services", "Senior", "1", "Low", "3", "30000000", "2026-10-02", "", "", "Yoses Dwi Maheswara", "Layanan kosong", "", ""],
    ["UJI-OPTY-001", "", "Done", "Win", "UJI PT Duplikat Satu", "New", "Platform", "DevOps", "Outsourcing", "IT Services", "Senior", "1", "High", "4", "21000000", "2026-10-04", "10/01/2026", "", "Yoses Dwi Maheswara", "Terhubung ke Opty di sheet Opportunity", "", ""],
    ["OPTY2026-S069", "", "On Going", "Win", "UJI PT Menimpa Seed PQ", "Existing", "Seed overwrite", "Analyst", "Outsourcing", "IT Services", "Junior", "1", "Low", "2", "7000000", "2026-10-05", "", "", "Yoses Dwi Maheswara", "ID Opty sudah ada di ERP", "", ""],
    ["", "PQ-MANUAL-01", "On Going", "Win", "UJI PT No PQ Manual", "New", "Data Platform", "Data Engineer", "Project-based", "Data & AI", "Lead", "2-3", "", "80%", "USD 3,000", "kemarin", "TBD", "not a link", "Budi S.", "", "", ""],
]
PQ_CLEAN = ["ID Opty", "PQ Number", "Pipeline Stage", "Opty Status", "Client Name", "Client Type", "Project Name", "Positions",
            "Service Type", "Business Unit", "Level", "Headcount", "Priority", "BANTE Score", "Price", "Opty Request Date",
            "Approval Date", "PO Doc (Link)", "Sales PIC", "Details"]
PQ_CLEAN_ROWS = [
    ["", "", "on_going", "win", "UJI PT Rapi PQ", "new", "Rapi Project", "Backend Engineer", "outsourcing", "", "senior", "1", "high", "4", "15000000", "2026-10-01", "2026-10-02", "", "Yoses Dwi Maheswara", ""],
]
PQ_NOTES = [
    ("PQ", "2", "Sel angka, sel tanggal asli, dan harga berformat Rupiah", "Membaca nilai, bukan teks berformat"),
    ("PQ", "3", "\"on going\", \"P1\", BU \"Digital\", \"Manage Service\", \"3 orang\", \"Rp 18.000.000\", tanggal \"1 Okt 2026\"", "Pemetaan nilai dan parser angka/tanggal; error per baris"),
    ("PQ", "4", "Stage \"Hold\", prioritas \"Tinggi\", \"Managed Services\"", "Dipetakan ke kode ERP atau ditolak"),
    ("PQ", "5-6", "Project kosong, Layanan kosong (wajib)", "Dilewati dengan alasan"),
    ("PQ", "7", "ID Opty sama dengan sheet Opportunity", "Terhubung ke opportunity yang sama, bukan record lepas"),
    ("PQ", "8", "ID Opty milik data seed", "Preview: akan mengubah record yang ada"),
    ("PQ", "9", "No PQ manual, harga USD, tanggal \"kemarin\"/\"TBD\", link PO bukan URL, PIC bukan akun", "Error per baris; link divalidasi"),
    ("PQ", "-", "Kolom \"No PO\" dan \"Termin\" tidak ada di target V1", "Ditawarkan untuk diabaikan atau dipetakan ke field lain"),
    ("Rapi", "2", "Header dan kode persis seperti ERP", "Baseline: lolos tanpa penyesuaian"),
]


def main(out):
    wb = Workbook()
    sheet(wb, "Pipeline", OT_MESSY, OT_ROWS, {"H": RP, "R": RP, "L": "DD/MM/YYYY"}, first=True)
    sheet(wb, "Rapi", OT_CLEAN, OT_CLEAN_ROWS)
    sheet(wb, "Lebar", OT_WIDE, OT_WIDE_ROWS)
    notes(wb, OT_NOTES)
    wb.save(f"{out}/uji-sheet-sync-opportunity.xlsx")

    wb = Workbook()
    sheet(wb, "PQ", PQ_MESSY, PQ_ROWS, {"O": RP, "P": "DD/MM/YYYY", "Q": "DD/MM/YYYY"}, first=True)
    sheet(wb, "Rapi", PQ_CLEAN, PQ_CLEAN_ROWS)
    notes(wb, PQ_NOTES)
    wb.save(f"{out}/uji-sheet-sync-pq.xlsx")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ".")
