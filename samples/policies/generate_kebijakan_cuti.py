"""Generate the synthetic leave-policy PDF used by the Agent knowledge POC (doc 22 §2.7, P4).

The content is invented for testing Company Files retrieval and cited Agent answers. It is NOT a Celerates policy.
Run with any Python that has reportlab:  python3 samples/policies/generate_kebijakan_cuti.py
"""

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

OUT = Path(__file__).with_name("kebijakan-cuti-karyawan-contoh.pdf")
MARK = "CONTOH / POC — bukan kebijakan resmi"

styles = getSampleStyleSheet()
H1 = ParagraphStyle("h1", parent=styles["Heading1"], fontSize=15, alignment=TA_CENTER, spaceAfter=4)
SUB = ParagraphStyle("sub", parent=styles["Normal"], fontSize=9, alignment=TA_CENTER, textColor=colors.grey)
H2 = ParagraphStyle("h2", parent=styles["Heading2"], fontSize=11.5, spaceBefore=10, spaceAfter=4)
P = ParagraphStyle("p", parent=styles["Normal"], fontSize=9.5, leading=13.5, spaceAfter=5)
CELL = ParagraphStyle("cell", parent=P, fontSize=8.8, leading=11.5, spaceAfter=0)


def page_frame(canvas, doc):
    canvas.saveState()
    width, height = A4
    canvas.setFont("Helvetica-Bold", 8.5)
    canvas.setFillColor(colors.HexColor("#b42318"))
    canvas.drawString(2 * cm, height - 1.3 * cm, MARK)
    canvas.setFillColor(colors.grey)
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(width - 2 * cm, height - 1.3 * cm, "Kebijakan Cuti Karyawan · POC/HR/CUTI/2026-01")
    canvas.drawString(2 * cm, 1.2 * cm, f"{MARK} · dokumen sintetis untuk uji Celerates Agent")
    canvas.drawRightString(width - 2 * cm, 1.2 * cm, f"Halaman {doc.page}")
    canvas.restoreState()


def table(rows, widths):
    t = Table([[Paragraph(c, CELL) for c in r] for r in rows], colWidths=widths, repeatRows=1)
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef2f6")),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#c5ccd6")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    return t


def build():
    s = []
    s.append(Paragraph("KEBIJAKAN CUTI KARYAWAN (CONTOH)", H1))
    s.append(Paragraph(f"Nomor POC/HR/CUTI/2026-01 · Berlaku 1 Januari 2026 · {MARK}", SUB))
    s.append(Spacer(1, 8))

    s.append(Paragraph("1. Tujuan dan Ruang Lingkup", H2))
    s.append(
        Paragraph(
            "Kebijakan ini mengatur jenis cuti, jatah, cara pengajuan dan persetujuan cuti bagi karyawan tetap "
            "(PKWTT) dan karyawan kontrak (PKWT), termasuk Talent yang ditempatkan di lokasi klien. Seluruh "
            "pengajuan cuti dicatat melalui modul <b>Time Off</b> di ERP. Hal yang tidak diatur di sini mengikuti "
            "peraturan perundang-undangan ketenagakerjaan yang berlaku.",
            P,
        )
    )

    s.append(Paragraph("2. Jenis Cuti", H2))
    s.append(
        table(
            [
                ["Jenis cuti", "Jatah", "Dokumen pendukung"],
                ["Cuti tahunan", "12 hari kerja per tahun kalender", "—"],
                ["Cuti sakit", "Sesuai surat dokter; tidak memotong cuti tahunan", "Surat keterangan dokter"],
                ["Cuti melahirkan", "3 bulan (1,5 bulan sebelum dan 1,5 bulan sesudah melahirkan)", "Surat dokter/bidan"],
                ["Cuti keguguran", "1,5 bulan", "Surat dokter/bidan"],
                ["Cuti ayah", "3 hari kerja", "Akta/surat kelahiran"],
                ["Cuti besar", "20 hari kerja setiap 6 tahun masa kerja", "—"],
                ["Cuti alasan penting", "1–3 hari kerja (lihat Bagian 7)", "Bukti peristiwa"],
                ["Cuti tidak dibayar", "Paling lama 30 hari kalender per tahun", "Persetujuan Direktur"],
            ],
            [4 * cm, 7.2 * cm, 5.3 * cm],
        )
    )

    s.append(Paragraph("3. Cuti Tahunan", H2))
    s.append(
        Paragraph(
            "3.1 Jatah cuti tahunan adalah <b>12 (dua belas) hari kerja</b> per tahun kalender bagi karyawan yang "
            "telah bekerja 12 bulan berturut-turut.",
            P,
        )
    )
    s.append(
        Paragraph(
            "3.2 Aturan pro-rata: karyawan yang bergabung di tengah tahun memperoleh <b>1 hari cuti untuk setiap "
            "bulan kerja penuh</b> pada tahun berjalan, dibulatkan ke bawah. Contoh: karyawan yang mulai bekerja "
            "1 April 2026 memperoleh 9 hari cuti tahunan untuk tahun 2026.",
            P,
        )
    )
    s.append(
        Paragraph(
            "3.3 Cuti tahunan pro-rata baru dapat digunakan setelah karyawan melewati masa percobaan 3 bulan. "
            "Cuti tahunan diambil paling sedikit setengah hari dan paling banyak 10 hari kerja berturut-turut "
            "dalam satu pengajuan.",
            P,
        )
    )

    s.append(Paragraph("4. Cuti Sakit", H2))
    s.append(
        Paragraph(
            "4.1 Sakit lebih dari 1 hari wajib disertai <b>surat keterangan dokter</b> yang diunggah ke ERP Time "
            "Off paling lambat 2 hari kerja setelah karyawan kembali bekerja.",
            P,
        )
    )
    s.append(
        Paragraph(
            "4.2 Sakit 1 hari tanpa surat dokter diperbolehkan paling banyak 3 kali dalam satu tahun kalender. "
            "Ketidakhadiran karena sakit tanpa surat dokter di luar batas tersebut memotong cuti tahunan.",
            P,
        )
    )
    s.append(PageBreak())

    s.append(Paragraph("5. Cuti Melahirkan dan Cuti Ayah", H2))
    s.append(
        Paragraph(
            "5.1 Karyawan perempuan berhak atas cuti melahirkan selama <b>3 bulan</b>, yaitu 1,5 bulan sebelum dan "
            "1,5 bulan sesudah melahirkan, dengan upah penuh. Pembagian waktu dapat diubah atas saran dokter atau "
            "bidan. Karyawan yang mengalami keguguran berhak atas cuti 1,5 bulan.",
            P,
        )
    )
    s.append(
        Paragraph(
            "5.2 Karyawan laki-laki berhak atas <b>cuti ayah 3 hari kerja</b> saat istri melahirkan atau keguguran. "
            "Cuti ayah diambil dalam 30 hari kalender sejak tanggal kelahiran dan tidak memotong cuti tahunan.",
            P,
        )
    )

    s.append(Paragraph("6. Cuti Besar", H2))
    s.append(
        Paragraph(
            "6.1 Karyawan tetap yang telah bekerja <b>6 tahun berturut-turut</b> berhak atas cuti besar "
            "<b>20 hari kerja</b>, dan berulang setiap kelipatan 6 tahun masa kerja.",
            P,
        )
    )
    s.append(
        Paragraph(
            "6.2 Cuti besar harus diambil dalam 12 bulan sejak hak timbul, dapat dibagi paling banyak 2 kali, dan "
            "diajukan paling lambat 30 hari kalender sebelum tanggal mulai. Cuti besar yang tidak diambil dalam "
            "12 bulan dinyatakan hangus.",
            P,
        )
    )

    s.append(Paragraph("7. Cuti Alasan Penting", H2))
    s.append(
        table(
            [
                ["Peristiwa", "Lama cuti"],
                ["Karyawan menikah", "3 hari kerja"],
                ["Menikahkan anak", "2 hari kerja"],
                ["Mengkhitankan atau membaptiskan anak", "2 hari kerja"],
                ["Suami/istri, orang tua/mertua, atau anak meninggal dunia", "2 hari kerja"],
                ["Anggota keluarga dalam satu rumah meninggal dunia", "1 hari kerja"],
            ],
            [10.5 * cm, 6 * cm],
        )
    )

    s.append(Paragraph("8. Pengajuan dan Persetujuan melalui ERP Time Off", H2))
    s.append(
        Paragraph(
            "8.1 Semua cuti diajukan melalui menu <b>ERP → Time Off → Ajukan Cuti</b>. Cuti tahunan 3 hari kerja "
            "atau lebih diajukan paling lambat <b>7 hari kalender</b> sebelum tanggal mulai; cuti kurang dari 3 "
            "hari kerja diajukan paling lambat 3 hari kerja sebelumnya.",
            P,
        )
    )
    s.append(
        Paragraph(
            "8.2 Atasan langsung memberi keputusan dalam <b>2 hari kerja</b>. Cuti lebih dari 5 hari kerja "
            "berturut-turut juga memerlukan persetujuan HR. Pengajuan yang belum diputuskan dalam 2 hari kerja "
            "dieskalasi otomatis ke atasan berikutnya.",
            P,
        )
    )
    s.append(
        Paragraph(
            "8.3 Untuk Talent yang ditempatkan di klien, PMO meneruskan jadwal cuti yang disetujui kepada PIC klien "
            "paling lambat 5 hari kerja sebelum tanggal mulai. Cuti sakit dicatat di Time Off paling lambat pada "
            "hari pertama kembali bekerja.",
            P,
        )
    )
    s.append(PageBreak())

    s.append(Paragraph("9. Sisa Cuti dan Carry-over", H2))
    s.append(
        Paragraph(
            "9.1 Sisa cuti tahunan yang belum digunakan sampai 31 Desember <b>dapat dibawa ke tahun berikutnya "
            "paling banyak 5 hari kerja</b>. Sisa cuti yang dibawa (carry-over) wajib digunakan paling lambat "
            "<b>31 Maret</b> tahun berikutnya; setelah tanggal tersebut sisa cuti hangus.",
            P,
        )
    )
    s.append(
        Paragraph(
            "9.2 Sisa cuti di atas 5 hari kerja hangus pada 31 Desember, kecuali penundaan cuti diminta secara "
            "tertulis oleh atasan karena kebutuhan proyek; dalam hal itu paling banyak 10 hari kerja dapat dibawa "
            "dengan persetujuan HR.",
            P,
        )
    )
    s.append(
        Paragraph(
            "9.3 Sisa cuti tidak dapat diuangkan, kecuali pada saat hubungan kerja berakhir: sisa cuti tahunan "
            "tahun berjalan dibayarkan secara pro-rata bersama penyelesaian hak karyawan.",
            P,
        )
    )

    s.append(Paragraph("10. Cuti Bersama", H2))
    s.append(
        Paragraph(
            "10.1 Cuti bersama mengikuti keputusan bersama pemerintah untuk tahun berjalan dan <b>memotong jatah "
            "cuti tahunan</b>. Karyawan yang jatah cutinya sudah habis tetap libur pada cuti bersama dan hari "
            "tersebut dicatat sebagai cuti tidak dibayar paling banyak 2 hari.",
            P,
        )
    )
    s.append(
        Paragraph(
            "10.2 Talent yang ditempatkan di klien mengikuti kalender kerja klien. Talent yang tetap bekerja pada "
            "hari cuti bersama atas permintaan klien tidak dipotong cuti tahunannya; PMO mencatatnya di Time Off.",
            P,
        )
    )

    s.append(Paragraph("11. Ketentuan Lain", H2))
    s.append(
        Paragraph(
            "11.1 Cuti tidak dibayar paling lama 30 hari kalender per tahun dan memerlukan persetujuan Direktur. "
            "11.2 Pelanggaran prosedur pengajuan dapat menyebabkan ketidakhadiran dicatat sebagai mangkir. "
            "11.3 Kebijakan ini ditinjau setiap tahun oleh HR.",
            P,
        )
    )
    s.append(Spacer(1, 10))
    s.append(Paragraph(f"<i>{MARK}. Seluruh angka dan ketentuan di dokumen ini adalah contoh sintetis.</i>", SUB))
    return s


def main():
    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
        title="Kebijakan Cuti Karyawan (Contoh)",
        author="Celerates Agent POC",
        subject=MARK,
    )
    doc.build(build(), onFirstPage=page_frame, onLaterPages=page_frame)
    print(OUT)


if __name__ == "__main__":
    main()
