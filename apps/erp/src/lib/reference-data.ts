import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { pics } from "@/db/schema";

/**
 * Daftar nama PIC -- di-query ulang dari DB di hampir setiap halaman (Sales,
 * Marketing, TA, dst) padahal datanya jarang berubah. Di-cache 5 menit +
 * di-invalidate langsung lewat tag "pics" begitu ada PIC baru ditambah
 * (lihat `createPic` di pic-actions.ts), jadi tetap akurat tapi tidak
 * query berulang-ulang di setiap render.
 */
export const getPicNames = unstable_cache(
  async () => {
    const rows = await db.select({ name: pics.name }).from(pics);
    return rows.map((r) => r.name);
  },
  ["pic-names"],
  { tags: ["pics"], revalidate: 300 },
);
