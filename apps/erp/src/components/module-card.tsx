"use client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useToast } from "./toast-provider";

export function ModuleCard({
  href,
  label,
  description,
  icon,
  color,
  hasAccess,
}: {
  href: string;
  label: string;
  description?: string;
  // Elemen ikon yang sudah dirender (bukan komponen mentah) -- Server Component
  // nggak bisa ngirim function/component reference sebagai prop ke Client
  // Component, cuma elemen React (JSX) yang udah jadi/serializable.
  icon: React.ReactNode;
  color: string;
  /** Modul yang divisinya dipunya user (atau Owner/modul terbuka-untuk-semua) -- dapat highlight biru saat hover. Yang tidak, klik-nya diblokir dengan pesan. */
  hasAccess: boolean;
}) {
  const { showToast } = useToast();
  const t = useTranslations("home");

  function handleClick(e: React.MouseEvent) {
    if (hasAccess) return;
    e.preventDefault();
    showToast(t("noAccessToast", { label }), "error");
  }

  return (
    <Link
      href={href}
      onClick={handleClick}
      title={hasAccess ? label : t("noAccessTitle", { label })}
      className={`group rounded-2xl border bg-white p-6 flex items-center gap-4 transition-all duration-200 ${
        hasAccess
          ? "border-slate-200 hover:shadow-lg hover:shadow-sky-500/10 hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50/50"
          : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <div className={`h-12 w-12 rounded-xl ${color} flex items-center justify-center flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform duration-200`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        {description && <p className="text-xs text-slate-400 mt-0.5 truncate">{description}</p>}
      </div>
      <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-sky-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
    </Link>
  );
}
