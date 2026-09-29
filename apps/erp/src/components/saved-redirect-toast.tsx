"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useToast } from "./toast-provider";

const COOKIE_NAME = "just_saved";

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function clearCookie(name: string) {
  document.cookie = `${name}=; Max-Age=0; path=/`;
}

/**
 * Banyak halaman Edit di app ini pakai <form action={serverAction}> murni
 * (bukan client component), dan server action-nya redirect() balik ke daftar
 * setelah berhasil simpan -- nggak ada "momen client" buat langsung nampilin
 * toast di situ.
 *
 * Sempat dicoba pakai query string "?saved=1" + useSearchParams(), tapi
 * ternyata nggak selalu ke-detect (searchParams reactivity setelah redirect()
 * dari Server Action nggak konsisten). Sekarang pakai cookie biasa: Set-Cookie
 * dijamin ke-apply browser di response manapun termasuk redirect, jadi
 * komponen ini tinggal cek document.cookie tiap kali pathname berubah.
 */
export function SavedRedirectToast() {
  const pathname = usePathname();
  const { showToast } = useToast();

  useEffect(() => {
    const raw = readCookie(COOKIE_NAME);
    if (!raw) return;
    clearCookie(COOKIE_NAME);
    showToast(decodeURIComponent(raw));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
