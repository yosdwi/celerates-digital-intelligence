"use client";

import { useEffect, useRef, useState } from "react";
import { ClipboardPaste, ImagePlus, Trash2, UploadCloud } from "lucide-react";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

function fileError(file: File) {
  if (!ALLOWED.has(file.type)) return "Gunakan foto JPG, PNG, atau WebP.";
  if (file.size > MAX_BYTES) return "Ukuran foto maksimal 5 MB.";
  return null;
}

function fileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function clipboardFile(items: DataTransferItemList | ClipboardItem[]) {
  if ("length" in items && typeof items.length === "number") {
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index] as DataTransferItem;
      if (item?.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) return file;
      }
    }
  }
  return null;
}

export function EvidenceDropzone({
  file,
  onFileChange,
  label = "Bukti pendukung",
  disabled = false,
}: {
  file: File | null;
  onFileChange: (file: File | null) => void;
  label?: string;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [clipboardRead, setClipboardRead] = useState(false);

  useEffect(() => {
    setClipboardRead(typeof navigator !== "undefined" && Boolean(navigator.clipboard && "read" in navigator.clipboard));
  }, []);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const choose = (candidate: File | null) => {
    if (!candidate || disabled) return;
    const validation = fileError(candidate);
    if (validation) {
      setError(validation);
      return;
    }
    setError(null);
    onFileChange(candidate);
  };

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (disabled || !event.clipboardData) return;
      const pasted = clipboardFile(event.clipboardData.items);
      if (!pasted) return;
      event.preventDefault();
      choose(pasted);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  const readClipboard = async () => {
    if (disabled || !navigator.clipboard || !("read" in navigator.clipboard)) return;
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((candidate) => candidate.startsWith("image/"));
        if (!type) continue;
        const blob = await item.getType(type);
        const extension = type === "image/jpeg" ? "jpg" : type.split("/")[1] || "png";
        choose(new File([blob], `clipboard-${Date.now()}.${extension}`, { type }));
        return;
      }
      setError("Clipboard tidak berisi gambar.");
    } catch {
      setError("Clipboard tidak dapat dibaca. Coba paste langsung atau pilih foto.");
    }
  };

  return (
    <div className="flex flex-col gap-1.5" data-evidence-dropzone>
      <span className="text-[13px] font-semibold">{label}</span>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        disabled={disabled}
        onChange={(event) => choose(event.target.files?.[0] ?? null)}
      />

      {file && preview ? (
        <div className="flex items-center gap-3 rounded-[14px] border border-j-line bg-[#f8fafc] p-2.5">
          <img src={preview} alt="Preview evidence" className="h-16 w-16 shrink-0 rounded-[10px] border border-j-line object-cover" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{file.name || "Evidence"}</p>
            <p className="mt-0.5 text-xs text-j-muted">{fileSize(file.size)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              disabled={disabled}
              onClick={() => input.current?.click()}
              className="rounded-lg px-2.5 py-2 text-xs font-bold text-j-accent hover:bg-j-accent-soft disabled:opacity-50"
            >
              Ganti
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                setError(null);
                onFileChange(null);
                if (input.current) input.current.value = "";
              }}
              aria-label="Hapus evidence"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-j-muted hover:bg-j-line-soft hover:text-[#a8261c] disabled:opacity-50"
            >
              <Trash2 aria-hidden className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled}
          onClick={() => !disabled && input.current?.click()}
          onKeyDown={(event) => {
            if (!disabled && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              input.current?.click();
            }
          }}
          onDragEnter={(event) => {
            event.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (event.currentTarget === event.target) setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            choose(event.dataTransfer.files?.[0] ?? null);
          }}
          className={`group flex min-h-[84px] cursor-pointer items-center gap-3 rounded-[14px] border border-dashed px-3.5 py-3 outline-none transition focus-visible:ring-2 focus-visible:ring-j-accent md:min-h-[132px] md:flex-col md:justify-center md:text-center ${
            dragging ? "border-j-accent bg-j-accent-soft" : "border-[#c9d4f2] bg-j-surface hover:border-[#94a9db] hover:bg-[#fbfcff]"
          } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-j-accent-soft text-j-accent md:h-11 md:w-11">
            <UploadCloud aria-hidden className="hidden h-5 w-5 md:block" />
            <ImagePlus aria-hidden className="h-5 w-5 md:hidden" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold md:hidden">Ambil atau pilih foto</span>
            <span className="hidden text-sm font-bold md:block">Tarik & lepas evidence di sini</span>
            <span className="mt-0.5 block text-xs text-j-muted md:hidden">JPG, PNG, WebP · maks. 5 MB</span>
            <span className="mt-1 hidden text-xs text-j-muted md:block">atau klik untuk memilih · Ctrl/Cmd+V untuk paste</span>
          </span>
        </div>
      )}

      {!file && clipboardRead && (
        <button
          type="button"
          disabled={disabled}
          onClick={readClipboard}
          className="mt-0.5 flex min-h-10 items-center justify-center gap-2 self-start rounded-xl px-3 text-xs font-bold text-j-accent hover:bg-j-accent-soft disabled:opacity-50 md:hidden"
        >
          <ClipboardPaste aria-hidden className="h-4 w-4" /> Tempel dari clipboard
        </button>
      )}
      {error && <p role="alert" className="text-xs font-semibold text-[#a8261c]">{error}</p>}
    </div>
  );
}
