/**
 * Terjemahkan error mentah dari Postgres (constraint violation) jadi pesan
 * yang bisa ditampilkan ke user, bukan JSON error driver yang bikin bingung.
 * Pakai di actions yang insert/update ke tabel dengan uniqueIndex/FK tanpa
 * pre-check manual sebelumnya.
 */
export function formatDbError(e: unknown, context?: { entityLabel?: string }): string {
  const err = e as { code?: string; message?: string; cause?: { code?: string; detail?: string } };
  // Drizzle (postgres.js driver) membungkus error Postgres asli di .cause,
  // bukan di properti langsung -- cek keduanya biar tetap kebaca di driver lain.
  const code = err?.code ?? err?.cause?.code;
  const label = context?.entityLabel ?? "Data ini";

  if (code === "23505") {
    return `${label} sudah ada (nomor/identitas duplikat). Coba lagi atau ubah nilainya.`;
  }
  if (code === "23503") {
    return `${label} terhubung ke record lain yang sudah tidak ada/tidak valid. Refresh halaman dan coba lagi.`;
  }
  if (code === "23502") {
    return `Ada field wajib yang belum diisi untuk ${label.toLowerCase()}.`;
  }
  return err?.message || "Terjadi kesalahan saat menyimpan data. Coba lagi.";
}
