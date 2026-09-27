"use client";
// Kind, access class and owning division for a file going into Company Files (ADR-018). The kind's default class is
// the minimum; a looser class is offered only to Owners. Shared by the explorer upload and the Agent's "save" flow.
import { useEffect, useState } from "react";

export type Cls = "general" | "division" | "commercial" | "personal";
export type Kinds = { kinds: { kind: string; label: string; access_class: Cls }[]; access: { owner: boolean; divisions: string[]; commercial: string[]; personal: string[] } };
export const CLASS: Record<Cls, { label: string; tone: string; note: string }> = {
  general: { label: "Umum", tone: "bg-emerald-50 text-emerald-800", note: "Semua pengguna ERP" },
  division: { label: "Divisi", tone: "bg-sky-50 text-sky-800", note: "Pembaca divisi pemilik" },
  commercial: { label: "Komersial", tone: "bg-amber-50 text-amber-900", note: "Pemegang akses komersial divisi, dan pembaca record tertaut; isi tidak dibagikan ke model" },
  personal: { label: "Personal", tone: "bg-rose-50 text-rose-800", note: "Pemegang akses personal divisi, dan pembaca record tertaut; isi tidak dibagikan ke model" },
};
const RANK: Record<Cls, number> = { general: 0, division: 1, commercial: 2, personal: 3 };
const DIVISIONS = ["marketing", "sales", "ta", "hr", "tm", "pmo", "finance"];
const field = "mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm";

export function useKinds() {
  const [kinds, setKinds] = useState<Kinds | null>(null);
  useEffect(() => {
    fetch("/api/files/kinds", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((k) => k && setKinds(k))
      .catch(() => undefined);
  }, []);
  return kinds;
}

/** Controlled-by-DOM fields named `kind`, `access_class`, `owner_division` (read them from the enclosing form). */
export function ClassFields({ kinds, initialKind }: { kinds: Kinds; initialKind?: string }) {
  const [kind, setKind] = useState(initialKind && kinds.kinds.some((k) => k.kind === initialKind) ? initialKind : kinds.kinds[0]?.kind ?? "other");
  const spec = kinds.kinds.find((k) => k.kind === kind);
  const [cls, setCls] = useState<Cls>(spec?.access_class ?? "general");
  useEffect(() => setCls(spec?.access_class ?? "general"), [spec?.access_class]);
  const allowed = (Object.keys(CLASS) as Cls[]).filter((c) => kinds.access.owner || RANK[c] >= RANK[spec?.access_class ?? "general"]);
  const divisions = cls === "general" ? [] : kinds.access.owner ? DIVISIONS : cls === "division" ? kinds.access.divisions : kinds.access[cls];
  return (
    <>
      <label className="text-xs text-slate-600">Jenis<select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={field}>{kinds.kinds.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}</select></label>
      <label className="text-xs text-slate-600">Kelas akses<select name="access_class" value={cls} onChange={(e) => setCls(e.target.value as Cls)} className={field}>{allowed.map((c) => <option key={c} value={c}>{CLASS[c].label} — {CLASS[c].note}</option>)}</select></label>
      {cls !== "general" && (
        <label className="text-xs text-slate-600">Divisi pemilik<select name="owner_division" required className={field}>{divisions.map((d) => <option key={d} value={d}>{d.toUpperCase()}</option>)}</select></label>
      )}
    </>
  );
}
