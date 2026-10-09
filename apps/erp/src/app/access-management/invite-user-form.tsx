"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { inviteUser, inviteUsersBulk, type InviteOutcome } from "./actions";

const field = "rounded-lg border border-slate-300 px-3 py-2 text-sm";

/** One person, or many at once (QA 2026-10-09). Either way each invited person gets the invitation email. */
export function InviteUserForm({ divisionOptions }: { divisionOptions: { id: string; name: string }[] }) {
  const t = useTranslations("accessManagement");
  const [bulk, setBulk] = useState(false);
  const [makeOwner, setMakeOwner] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [results, setResults] = useState<InviteOutcome[] | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    startTransition(async () => {
      const out = bulk ? await inviteUsersBulk(fd) : [await inviteUser(fd)];
      setResults(out);
      if (out.every((r) => r.ok)) { form.reset(); setMakeOwner(false); }
    });
  }

  const levels = (
    <select name="level" className={field} defaultValue={bulk ? "editor" : ""}>
      {!bulk && <option value="">{t("selectLevelPlaceholder")}</option>}
      <option value="viewer">{t("levelViewer")}</option>
      <option value="editor">{t("levelEditor")}</option>
      <option value="full">{t("levelFull")}</option>
    </select>
  );

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="sm:col-span-2 inline-flex w-fit rounded-lg border border-slate-200 p-0.5 text-sm">
        {[false, true].map((b) => (
          <button key={String(b)} type="button" onClick={() => { setBulk(b); setResults(null); }}
            className={`rounded-md px-3 py-1 ${bulk === b ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
            {b ? "Banyak sekaligus" : "Satu orang"}
          </button>
        ))}
      </div>

      {bulk ? (
        <>
          <select name="division_id" required className={field}>
            <option value="">{t("selectDivisionPlaceholder")}</option>
            {divisionOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          {levels}
          <textarea name="lines" required rows={6} className={`${field} sm:col-span-2 font-mono`}
            placeholder={"tyas@celerates.co.id, Tyas Pratiwi\nbudi@celerates.co.id, Budi Santoso, viewer"} />
          <p className="sm:col-span-2 -mt-1 text-xs text-slate-500">
            Satu orang per baris: <b>email, nama</b> atau <b>email, nama, level</b>. Level di baris mengalahkan level di atas. Maksimal 50 baris.
          </p>
        </>
      ) : (
        <>
          <input name="email" type="email" placeholder={t("emailPlaceholder")} required className={field} />
          <input name="full_name" placeholder={t("fullNamePlaceholder")} required className={field} />
          {!makeOwner && (
            <>
              <select name="division_id" className={field}>
                <option value="">{t("selectDivisionPlaceholder")}</option>
                {divisionOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              {levels}
            </>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
            <input type="checkbox" name="make_owner" checked={makeOwner} onChange={(e) => setMakeOwner(e.target.checked)} className="rounded" />
            {t("makeOwnerLabel")}
          </label>
        </>
      )}

      {results && (
        <ul className="sm:col-span-2 space-y-1 text-sm">
          {results.map((r, i) => (
            <li key={i} className={r.ok ? (r.mailed ? "text-green-700" : "text-amber-700") : "text-red-600"}>
              {r.email ? <b>{r.email}</b> : null}{r.email ? ": " : ""}
              {r.ok ? (r.mailed ? "diundang, email undangan terkirim." : "akun dibuat, tapi email undangan gagal terkirim. Pakai Kirim ulang undangan di daftar user.") : r.error}
            </li>
          ))}
        </ul>
      )}

      <div className="sm:col-span-2">
        <button type="submit" disabled={isPending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          {isPending ? t("inviting") : bulk ? "Undang semua & kirim email" : t("inviteUser")}
        </button>
      </div>
    </form>
  );
}
