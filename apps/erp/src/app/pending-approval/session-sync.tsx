"use client";
import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

/**
 * Session JWT di-cache saat login dan tidak otomatis ikut update saat status
 * user berubah di DB (misal owner approve akses). Komponen ini memaksa
 * next-auth refresh token (yang menjalankan ulang jwt callback -> ambil status
 * terbaru dari DB) begitu halaman ini dirender dengan status sudah bukan pending,
 * lalu redirect -- supaya user tidak perlu logout/login manual.
 */
export function SessionSync({ redirectTo }: { redirectTo: string }) {
  const t = useTranslations("pendingApproval");
  const { update } = useSession();
  const router = useRouter();

  useEffect(() => {
    (async () => {
      await update();
      router.replace(redirectTo);
    })();
  }, [update, router, redirectTo]);

  return <p className="text-sm text-slate-500 mt-2">{t("redirecting")}</p>;
}
