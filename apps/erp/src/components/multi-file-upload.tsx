"use client";
import { useRef, useState } from "react";
import { Plus, X, FileText, Paperclip, Link as LinkIcon } from "lucide-react";

export type ExistingAttachment = { id: string; file_name: string; url: string | null; kind?: "file" | "link" };

const DEFAULT_MAX_SIZE_BYTES = 20 * 1024 * 1024; // samain sama DEFAULT_MAX_SIZE_BYTES di src/lib/storage.ts

function formatMb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}

/**
 * Upload banyak file DAN/ATAU tempel banyak link sekaligus, dengan tombol
 * "+ Tambah File" / "+ Tambah Link" untuk menambah lagi (bisa dipanggil berkali-kali,
 * yang sudah ditambahkan tetap tersimpan di list).
 * - File baru dikirim di FormData dengan nama field `name` -- ambil pakai `extractFiles(formData, name)`.
 * - Link baru dikirim di FormData dengan nama field `${name}_links` -- ambil pakai `extractLinks(formData, \`${name}_links\`)`.
 * Keduanya ada di `@/lib/attachments`.
 * File yang melebihi `maxSizeBytes` ditolak DI SINI (client-side) dengan pesan jelas,
 * supaya tidak baru ketahuan pas submit lewat pesan mentah dari server/framework.
 * Nilai ini harus disamakan dengan opsi `maxSizeBytes` yang dipakai action penerimanya
 * di `saveAttachmentsAndLinks`/`uploadDocument` (lihat src/lib/storage.ts) -- kalau
 * pemanggil upload video (300MB), kirim juga `maxSizeBytes={VIDEO_MAX_SIZE_BYTES}` di sini.
 */
export function MultiFileUpload({
  name,
  label,
  existingFiles,
  onDeleteExisting,
  maxSizeBytes = DEFAULT_MAX_SIZE_BYTES,
}: {
  name: string;
  label?: string;
  existingFiles?: ExistingAttachment[];
  onDeleteExisting?: (id: string) => void | Promise<void>;
  maxSizeBytes?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [links, setLinks] = useState<string[]>([]);
  const [linkDraft, setLinkDraft] = useState("");
  const [addingLink, setAddingLink] = useState(false);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  function syncInput(next: File[]) {
    setFiles(next);
    const dt = new DataTransfer();
    next.forEach((f) => dt.items.add(f));
    if (inputRef.current) inputRef.current.files = dt.files;
  }

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;

    const tooBig = picked.filter((f) => f.size > maxSizeBytes);
    const ok = picked.filter((f) => f.size <= maxSizeBytes);
    setError(tooBig.length > 0 ? `${tooBig.map((f) => f.name).join(", ")} melebihi batas ukuran ${formatMb(maxSizeBytes)}, tidak ditambahkan.` : null);
    if (ok.length > 0) syncInput([...files, ...ok]);
    e.target.value = "";
  }

  function removeFileAt(idx: number) {
    syncInput(files.filter((_, i) => i !== idx));
  }

  function commitLink() {
    const url = linkDraft.trim();
    if (url) setLinks((prev) => [...prev, url]);
    setLinkDraft("");
    setAddingLink(false);
  }

  function removeLinkAt(idx: number) {
    setLinks((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleDeleteExisting(id: string) {
    setDeletedIds((prev) => new Set(prev).add(id));
    onDeleteExisting?.(id);
  }

  const visibleExisting = (existingFiles ?? []).filter((f) => !deletedIds.has(f.id));

  return (
    <div className="block">
      {label && <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>}

      {/* Satu container spacing konsisten untuk ketiga bagian (list, input link, tombol) --
          supaya jaraknya tetap rapi baik saat list kosong maupun terisi, nggak numpuk. */}
      <div className="space-y-3">
        {(visibleExisting.length > 0 || files.length > 0 || links.length > 0) && (
          <ul className="space-y-1">
            {visibleExisting.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs">
                <a href={f.url ?? "#"} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-brand-600 hover:underline truncate">
                  {f.kind === "link" ? <LinkIcon className="h-3.5 w-3.5 shrink-0" /> : <FileText className="h-3.5 w-3.5 shrink-0" />} {f.file_name}
                </a>
                {onDeleteExisting && (
                  <button type="button" onClick={() => handleDeleteExisting(f.id)} className="text-slate-400 hover:text-red-600 shrink-0" title="Hapus">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
            {files.map((f, idx) => (
              <li key={`file-${idx}`} className="flex items-center justify-between gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs">
                <span className="flex items-center gap-1.5 text-slate-700 truncate">
                  <Paperclip className="h-3.5 w-3.5 shrink-0" /> {f.name}
                </span>
                <button type="button" onClick={() => removeFileAt(idx)} className="text-slate-400 hover:text-red-600 shrink-0" title="Batalkan">
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
            {links.map((url, idx) => (
              <li key={`link-${idx}`} className="flex items-center justify-between gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs">
                <span className="flex items-center gap-1.5 text-slate-700 truncate">
                  <LinkIcon className="h-3.5 w-3.5 shrink-0" /> {url}
                </span>
                <button type="button" onClick={() => removeLinkAt(idx)} className="text-slate-400 hover:text-red-600 shrink-0" title="Batalkan">
                  <X className="h-3.5 w-3.5" />
                </button>
                <input type="hidden" name={`${name}_links`} value={url} />
              </li>
            ))}
          </ul>
        )}

        {addingLink && (
          <div className="flex gap-1.5">
            <input
              autoFocus
              type="url"
              value={linkDraft}
              onChange={(e) => setLinkDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitLink(); } }}
              placeholder="https://..."
              className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
            />
            <button type="button" onClick={commitLink} className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700">
              Tambahkan
            </button>
            <button type="button" onClick={() => { setAddingLink(false); setLinkDraft(""); }} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
              Batal
            </button>
          </div>
        )}

        {error && <p className="text-xs font-medium text-rose-600">{error}</p>}

        <input ref={inputRef} type="file" name={name} multiple className="hidden" onChange={handlePick} />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-brand-400 hover:text-brand-600"
          >
            <Plus className="h-3.5 w-3.5" /> Tambah File
          </button>
          <button
            type="button"
            onClick={() => setAddingLink(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-teal-400 hover:text-teal-600"
          >
            <Plus className="h-3.5 w-3.5" /> Tambah Link
          </button>
        </div>
      </div>
    </div>
  );
}
