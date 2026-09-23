"use client";
import { useState, useRef, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import Link from "next/link";

export function UserMenu() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const t = useTranslations("userMenu");

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!session?.user) return null;

  const name = (session.user as any).fullName ?? session.user.name ?? session.user.email ?? "?";
  const initial = name.charAt(0).toUpperCase();
  const isOwner = (session.user as any).isOwner;

  return (
    <div ref={ref} className="fixed top-4 right-6 z-40">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white text-sm font-medium shadow-[0_4px_10px_rgba(25,70,103,0.35)] hover:shadow-[0_6px_14px_rgba(25,70,103,0.45)] hover:-translate-y-0.5 transition-all duration-200"
      >
        {initial}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-lg border border-slate-200 bg-white shadow-lg py-1">
          <div className="px-4 py-2 border-b border-slate-100">
            <p className="text-sm font-medium text-slate-900 truncate">{name}</p>
            <p className="text-xs text-slate-500 truncate">{session.user.email}</p>
            {isOwner && <span className="inline-block mt-1 text-[10px] uppercase tracking-wide text-brand-600 font-medium">{t("owner")}</span>}
          </div>
          <Link href="/profile" className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={() => setOpen(false)}>
            {t("editProfile")}
          </Link>
          {isOwner && (
            <Link href="/access-management" className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={() => setOpen(false)}>
              {t("accessManagement")}
            </Link>
          )}
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            {t("logout")}
          </button>
        </div>
      )}
    </div>
  );
}