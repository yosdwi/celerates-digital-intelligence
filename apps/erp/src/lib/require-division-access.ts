import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export type DivisionActor = { userId?: string; userName: string; isOwner: boolean };
export type AccessLevel = "viewer" | "editor" | "full";

const LEVEL_RANK: Record<AccessLevel, number> = { viewer: 0, editor: 1, full: 2 };

/**
 * Cek server-side bahwa user sedang login DAN punya akses ke divisi ini
 * DENGAN LEVEL YANG CUKUP -- viewer cuma boleh lihat (nggak lolos requireDivisionAccess
 * sama sekali, karena tiap Server Action di sini berarti nulis data), editor
 * boleh create/update tapi bukan hapus, full boleh semuanya termasuk delete.
 * Default minLevel "editor" karena mayoritas pemanggil di sini emang buat
 * create/update -- pemanggil delete WAJIB kirim eksplisit minLevel="full".
 * Owner selalu lolos apa pun levelnya.
 *
 * Ini bukan pengganti middleware (yang sudah gate halaman) -- ini defense-in-depth
 * di level Server Action itu sendiri, supaya action tidak bisa dipanggil oleh
 * siapa pun yang kebetulan bisa memicu referensinya tanpa hak akses.
 */
export async function requireDivisionAccess(divisionKey: string, minLevel: AccessLevel = "editor"): Promise<DivisionActor> {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  const userName = ((session?.user as any)?.fullName ?? session?.user?.name ?? session?.user?.email ?? "Seseorang") as string;
  const isOwner = Boolean((session?.user as any)?.isOwner);

  if (!userId) throw new Error("Sesi tidak valid, silakan login ulang");
  if (isOwner) return { userId, userName, isOwner };

  const access = ((session?.user as any)?.access ?? []) as { divisionKey: string; level: string }[];
  const entry = access.find((a) => a.divisionKey === divisionKey);
  if (!entry) throw new Error("Anda tidak punya akses ke divisi ini");

  const rank = LEVEL_RANK[entry.level as AccessLevel] ?? -1;
  if (rank < LEVEL_RANK[minLevel]) {
    throw new Error(
      minLevel === "full"
        ? "Aksi ini (hapus) cuma bisa dilakukan oleh akses Full di divisi ini"
        : "Akses Anda di divisi ini cuma Viewer (lihat saja), tidak bisa mengubah data"
    );
  }

  return { userId, userName, isOwner };
}
