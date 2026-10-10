"use client";
// M6.x: what is attached to the conversation, and the explicit way to keep it. An Agent attachment is working context
// (yours, for this conversation, purged after its retention). "Simpan ke Company Files" makes a governed copy after
// you choose kind, class and owning division; the attachment itself does not change.
import { useState } from "react";
import Link from "next/link";
import { FolderInput, Loader2, X } from "lucide-react";
import { ClassFields, useKinds } from "@/components/files/class-fields";

export type Attachment =
  | { kind: "dataset"; id: string; name: string } // a document: questions also search it
  | { kind: "table"; id: string; name: string } // a table: imported, not searched by questions
  | { kind: "file"; id: string; name: string } // a Company File attached from search
  | { kind: "local"; name: string; file: File; reason: string }; // could not be read here (e.g. a scan)

const KIND_HINT: Record<string, string> = { ".xlsx": "manpower", ".csv": "manpower", ".pdf": "other", ".docx": "other" };

export function AttachmentBar({ attachment, onDetach }: { attachment: Attachment; onDetach: () => void }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ id: string; already: boolean } | null>(null);
  const savable = attachment.kind !== "file";
  const label =
    attachment.kind === "file" ? "Company File terlampir" : attachment.kind === "table" ? "Tabel terlampir" : attachment.kind === "local" ? "Belum terbaca" : "Berkas terlampir";
  const note =
    attachment.kind === "local" ? attachment.reason : attachment.kind === "table" ? "diimpor lewat usulan; tidak dicari oleh pertanyaan" : "pertanyaan juga mencari di berkas ini";
  return (
    <div className="mx-3 mt-2 rounded-lg bg-sky-50 px-2.5 py-1.5 text-xs text-sky-900" data-agent-attachment={attachment.kind}>
      <p className="flex items-center justify-between gap-2">
        <span className="truncate">
          {label}: {attachment.name} — {note}
        </span>
        <span className="flex shrink-0 gap-3">
          {savable && !saved && (
            <button type="button" onClick={() => setSaving(!saving)} className="inline-flex items-center gap-1 font-semibold hover:underline" data-attachment-save>
              <FolderInput className="h-3.5 w-3.5" /> Simpan ke Company Files
            </button>
          )}
          <button type="button" onClick={onDetach} aria-label="Lepas berkas" className="font-semibold hover:underline">
            Lepas
          </button>
        </span>
      </p>
      {saved && (
        <p role="status" className="mt-1 text-emerald-800" data-attachment-saved={saved.id}>
          {saved.already ? "Berkas yang sama sudah ada di Company Files." : "Tersimpan di Company Files."}{" "}
          <Link href={`/files?file=${saved.id}`} className="font-semibold underline">
            Buka
          </Link>
        </p>
      )}
      {saving && !saved && <SaveForm attachment={attachment} onClose={() => setSaving(false)} onSaved={(id, already) => { setSaved({ id, already }); setSaving(false); }} />}
    </div>
  );
}

function SaveForm({ attachment, onClose, onSaved }: { attachment: Attachment; onClose: () => void; onSaved: (id: string, already: boolean) => void }) {
  const kinds = useKinds();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const suffix = attachment.name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
  if (!kinds) return <p className="mt-2 text-slate-600">Memuat pilihan…</p>;
  return (
    <form
      className="mt-2 space-y-2 rounded-lg border border-sky-100 bg-white p-2.5 text-slate-800"
      data-attachment-save-form
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError("");
        const form = new FormData(e.currentTarget);
        try {
          let response: Response;
          if (attachment.kind === "local") {
            form.set("file", attachment.file, attachment.file.name);
            response = await fetch("/api/files", { method: "POST", body: form });
          } else {
            response = await fetch("/api/files/from-attachment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ dataset_id: attachment.kind !== "file" ? attachment.id : "", ...Object.fromEntries(form.entries()) }),
            });
          }
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(body.error ?? "Belum dapat disimpan.");
          onSaved(body.id, body.already_saved === true);
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="flex items-center justify-between">
        <strong className="text-xs">Simpan sebagai Company File</strong>
        <button type="button" aria-label="Batal simpan" onClick={onClose}><X className="h-3.5 w-3.5" /></button>
      </div>
      <label className="block text-xs text-slate-600">
        Judul
        <input name="title" maxLength={200} defaultValue={attachment.name.replace(/\.[a-z0-9]+$/i, "")} className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <ClassFields kinds={kinds} initialKind={KIND_HINT[suffix]} />
      </div>
      <p className="text-[0.6875rem] text-slate-500">Lampiran di percakapan ini tetap milik Anda dan dihapus sesuai retensinya. Company File adalah salinan yang dikelola: kelas aksesnya berlaku untuk semua pembaca.</p>
      {error && <p role="alert" className="text-xs text-amber-900">{error}</p>}
      <button disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
        {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Simpan
      </button>
    </form>
  );
}
