"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, RefreshCw } from "lucide-react";

export function SelfieCapture({ onCapture }: { onCapture: (file: File | null) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function startCamera() {
    setError(null);
    setStarting(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Kamera tidak didukung di browser ini.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = stream;
      setCameraOn(true);
    } catch {
      setError("Tidak bisa mengakses kamera. Izinkan akses kamera untuk melanjutkan check-in/out.");
    } finally {
      setStarting(false);
    }
  }

  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraOn]);

  function takePhoto() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], "selfie.jpg", { type: "image/jpeg" });
      setPreviewUrl(URL.createObjectURL(blob));
      onCapture(file);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setCameraOn(false);
    }, "image/jpeg", 0.85);
  }

  function retake() {
    setPreviewUrl(null);
    onCapture(null);
    startCamera();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-600">
        <Camera className="h-3.5 w-3.5" /> Selfie wajib untuk check-in/out
      </p>

      {previewUrl ? (
        <div className="space-y-2">
          <img src={previewUrl} alt="Selfie preview" className="w-full rounded-lg aspect-square object-cover" />
          <button
            type="button"
            onClick={retake}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Ambil ulang
          </button>
        </div>
      ) : cameraOn ? (
        <div className="space-y-2">
          <video ref={videoRef} muted playsInline className="w-full rounded-lg aspect-square object-cover bg-black" />
          <button
            type="button"
            onClick={takePhoto}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700"
          >
            <Camera className="h-3.5 w-3.5" /> Ambil Foto
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={startCamera}
          disabled={starting}
          className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
        >
          <Camera className="h-3.5 w-3.5" /> {starting ? "Membuka kamera..." : "Buka Kamera"}
        </button>
      )}

      {error && <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>}
    </div>
  );
}
