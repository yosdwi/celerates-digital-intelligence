/**
 * Daftar placeholder yang didukung saat generate Kontrak/Offering dari
 * template .docx. docxtemplater pakai tag kurung kurawal tunggal, mis. {nama}.
 * Ditampilkan di UI Document Generator supaya user tahu tag apa yang valid
 * dipakai saat menyiapkan template Word-nya sendiri. Daftar ini harus tetap
 * sinkron dengan key yang di-return oleh buildMergeData() di document-merge.ts.
 */
export const DOCUMENT_PLACEHOLDERS = [
  { tag: "nama", label: "Nama Lengkap" },
  { tag: "email", label: "Email Personal" },
  { tag: "no_tlp", label: "No. Telepon" },
  { tag: "alamat", label: "Alamat (sesuai KTP)" },
  { tag: "alamat_domisili", label: "Alamat Domisili Saat Ini" },
  { tag: "nik", label: "NIK / No. KTP" },
  { tag: "npwp", label: "NPWP" },
  { tag: "tempat_lahir", label: "Tempat Lahir" },
  { tag: "tanggal_lahir", label: "Tanggal Lahir" },
  { tag: "umur", label: "Umur (dihitung otomatis)" },
  { tag: "jenis_kelamin", label: "Jenis Kelamin" },

  { tag: "id_pegawai", label: "ID Pegawai (baru ada setelah promote ke Employee)" },
  { tag: "no_induk_karyawan", label: "No. Induk Karyawan (sama dengan ID Pegawai)" },
  { tag: "jabatan", label: "Tugas Pokok / Jabatan" },
  { tag: "business_unit", label: "Business Unit" },

  { tag: "tanggal_ttd", label: "Tanggal TTD Kontrak (hari ini)" },
  { tag: "tanggal_dokumen", label: "Tanggal Dokumen Dibuat (hari ini)" },
  { tag: "tanggal_mulai", label: "Tanggal Mulai (format lengkap)" },
  { tag: "tanggal_mulai_hari", label: "Tanggal Mulai - Tanggal" },
  { tag: "tanggal_mulai_bulan", label: "Tanggal Mulai - Nama Bulan" },
  { tag: "tanggal_mulai_tahun", label: "Tanggal Mulai - Tahun" },
  { tag: "tanggal_mulai_slash", label: "Tanggal Mulai (dd/mm/yyyy)" },
  { tag: "tanggal_selesai", label: "Tanggal Selesai (format lengkap)" },
  { tag: "tanggal_selesai_hari", label: "Tanggal Selesai - Tanggal" },
  { tag: "tanggal_selesai_bulan", label: "Tanggal Selesai - Nama Bulan" },
  { tag: "tanggal_selesai_tahun", label: "Tanggal Selesai - Tahun" },
  { tag: "tanggal_selesai_slash", label: "Tanggal Selesai (dd/mm/yyyy)" },
  { tag: "durasi_bulan", label: "Durasi Kontrak (angka, bulan)" },
  { tag: "durasi_terbilang", label: "Durasi Kontrak (terbilang)" },

  { tag: "gaji", label: "Salary Deal / Offering (Rp)" },
  { tag: "gaji_pokok", label: "Gaji Pokok (Rp)" },
  { tag: "tunjangan_transportasi", label: "Tunjangan Transportasi (Rp)" },
  { tag: "tunjangan_penugasan_proyek", label: "Tunjangan Penugasan Proyek (Rp)" },
  { tag: "tunjangan_akomodasi", label: "Tunjangan Akomodasi (Rp)" },
  { tag: "total_gross_gaji", label: "Total Gross Gaji (Rp)" },
  { tag: "nama_bank", label: "Nama Bank" },
  { tag: "no_rekening", label: "No. Rekening" },
  { tag: "nama_pemilik_rekening", label: "Nama Pemilik Rekening" },
] as const;
