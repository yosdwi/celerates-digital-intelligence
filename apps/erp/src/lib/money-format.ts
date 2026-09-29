/**
 * Utility format nominal Rupiah pakai titik sebagai pemisah ribuan
 * (mis. "1.000.000"), dipakai di semua input uang di seluruh modul supaya
 * konsisten -- yang disimpan/dikirim ke server tetap angka mentah tanpa
 * titik, titik cuma buat tampilan saat mengetik.
 */
export function formatThousands(digits: string | number | null | undefined): string {
  const clean = String(digits ?? "").replace(/[^\d]/g, "");
  if (!clean) return "";
  return clean.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function stripThousands(value: string | number | null | undefined): string {
  return String(value ?? "").replace(/[^\d]/g, "");
}
