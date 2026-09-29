import { cookies } from "next/headers";

const COOKIE_NAME = "just_saved";

/**
 * Dipanggil dari Server Action tepat sebelum redirect() balik ke halaman
 * daftar setelah simpan berhasil. Cookie ini yang dibaca oleh SavedFlagToast
 * (client component) buat nampilin toast -- lebih robust daripada nempelin
 * "?saved=1" ke query string, karena Set-Cookie dijamin ke-apply browser di
 * response manapun (termasuk redirect), sementara re-render/reactivity
 * useSearchParams() setelah redirect() dari Server Action ternyata nggak
 * selalu konsisten kepicu.
 */
export async function markSaved(message?: string) {
  const store = await cookies();
  // httpOnly:false sengaja -- perlu dibaca & dibersihkan langsung dari client JS,
  // isinya cuma pesan singkat, bukan data sensitif.
  store.set(COOKIE_NAME, encodeURIComponent(message ?? "Berhasil disimpan"), { maxAge: 10, path: "/", httpOnly: false });
}
