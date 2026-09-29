const SIGNED_URL_MARKER = "/storage/v1/object/sign/candidate-documents/";

/**
 * Beberapa record lama nyimpen link Supabase Storage yang sudah pernah
 * digenerate (bukan path mentah) di field seperti cv_asli_url -- entah karena
 * link "Preview" di-copy manual, atau hasil sinkronisasi lama. Link begini
 * punya token yang cuma valid 1 jam; kalau dipakai apa adanya setelah lewat
 * 1 jam, Supabase Storage nolak dengan error InvalidJWT/exp claim.
 * Fungsi ini mendeteksi pola itu dan balikin path aslinya, supaya bisa
 * digenerate ulang jadi signed URL yang fresh.
 */
export function extractStoragePathFromSignedUrl(value: string): string | null {
  const idx = value.indexOf(SIGNED_URL_MARKER);
  if (idx === -1) return null;
  const rest = value.slice(idx + SIGNED_URL_MARKER.length);
  try {
    return decodeURIComponent(rest.split("?")[0]);
  } catch {
    return rest.split("?")[0];
  }
}
