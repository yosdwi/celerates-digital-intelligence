import { Pill } from "./pill";

const NEW_WINDOW_MS = 48 * 60 * 60 * 1000; // 48 jam

/**
 * Badge "Baru" buat record yang dibuat dalam 48 jam terakhir -- dipakai di
 * SEMUA tabel & grid card di seluruh modul (lihat item 29). Cuma berdasarkan
 * `created_at` (belum ada `updated_at` generik di tabel manapun di skema ini,
 * jadi record yang cuma di-edit BELUM ikut ditandai -- keputusan sadar, bukan
 * kelupaan, biar nggak perlu migrasi ke ~13 tabel dulu).
 */
export function isRecentlyCreated(createdAt: Date | string | null | undefined): boolean {
  if (!createdAt) return false;
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= NEW_WINDOW_MS;
}

export function NewBadge({ createdAt }: { createdAt: Date | string | null | undefined }) {
  if (!isRecentlyCreated(createdAt)) return null;
  return <Pill variant="new">Baru</Pill>;
}
