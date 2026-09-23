"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { getDocumentSignedUrl } from "@/lib/document-actions";
import { extractStoragePathFromSignedUrl } from "@/lib/storage-url";

function toPreviewUrl(url: string): string {
  const driveMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (driveMatch && url.includes("drive.google.com")) {
    return `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
  }
  return url;
}

// Link folder Google Drive (bukan file) selalu menolak di-iframe (X-Frame-Options),
// jadi preview-nya pasti gagal/blank -- jangan tawarkan tombol Preview buat ini,
// cuma "Buka" di tab baru.
function isDriveFolderLink(url: string): boolean {
  return url.includes("drive.google.com") && /\/drive\/(u\/\d+\/)?folders\//.test(url);
}

export function SmartFileLink({ value, label = "Lihat" }: { value: string | null; label?: string }) {
  const [isPending, startTransition] = useTransition();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  if (!value) return <span className="text-xs text-slate-300">-</span>;

  function openPreview(url: string) {
    setPreviewUrl(toPreviewUrl(url));
  }

  // Link Supabase Storage yang udah pernah digenerate (token 1 jam) harus
  // diperlakukan seperti path internal -- bukan link eksternal permanen --
  // supaya digenerate ulang jadi fresh, bukan dipakai sampai expired.
  if (value.startsWith("http") && !extractStoragePathFromSignedUrl(value)) {
    const isFolder = isDriveFolderLink(value);
    return (
      <>
        <div className="flex items-center gap-1.5">
          {!isFolder && (
            <>
              <button onClick={() => openPreview(value)} className="text-brand-600 underline text-xs">
                Preview
              </button>
              <span className="text-slate-300">|</span>
            </>
          )}
          <Link href={value} target="_blank" className="text-slate-500 underline text-xs">
            {label}
          </Link>
        </div>
        {previewUrl && <PreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />}
      </>
    );
  }

  function handlePreviewInternal() {
    startTransition(async () => {
      const url = await getDocumentSignedUrl(value!);
      if (url) openPreview(url);
    });
  }

  function handleOpenInternal() {
    startTransition(async () => {
      const url = await getDocumentSignedUrl(value!);
      if (url) window.open(url, "_blank");
    });
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        <button onClick={handlePreviewInternal} disabled={isPending} className="text-brand-600 underline text-xs disabled:opacity-50">
          {isPending ? "..." : "Preview"}
        </button>
        <span className="text-slate-300">|</span>
        <button onClick={handleOpenInternal} disabled={isPending} className="text-slate-500 underline text-xs disabled:opacity-50">
          {label}
        </button>
      </div>
      {previewUrl && <PreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />}
    </>
  );
}

function PreviewModal({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl shadow-xl w-full max-w-3xl h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <p className="text-sm font-medium text-slate-700">Preview Dokumen</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-sm">Tutup ✕</button>
        </div>
        <iframe src={url} className="flex-1 w-full" title="Preview Dokumen" />
      </div>
    </div>
  );
}