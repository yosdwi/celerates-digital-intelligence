"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin, LogIn, LogOut, Loader2 } from "lucide-react";
import { checkIn, checkOut } from "./actions";
import { SelfieCapture } from "./selfie-capture";

function getPosition(): Promise<{ lat: number | null; lng: number | null }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ lat: null, lng: null });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve({ lat: null, lng: null }),
      { timeout: 8000 }
    );
  });
}

export function CheckInOutButton({ mode }: { mode: "in" | "out" }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [selfie, setSelfie] = useState<File | null>(null);

  function handleClick() {
    if (!selfie) {
      setError("Ambil selfie dulu sebelum " + (mode === "in" ? "check-in" : "check-out") + ".");
      return;
    }
    setError(null);
    setLocating(true);
    getPosition().then(({ lat, lng }) => {
      setLocating(false);
      startTransition(async () => {
        const result = mode === "in" ? await checkIn(lat, lng, selfie) : await checkOut(lat, lng, selfie);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.refresh();
      });
    });
  }

  const busy = locating || isPending;

  return (
    <div className="space-y-3">
      <SelfieCapture onCapture={setSelfie} />

      <button
        type="button"
        onClick={handleClick}
        disabled={busy || !selfie}
        className={`w-full flex items-center justify-center gap-2 rounded-xl px-6 py-4 text-base font-semibold text-white shadow-sm transition-colors disabled:opacity-60 ${
          mode === "in" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"
        }`}
      >
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : mode === "in" ? (
          <LogIn className="h-5 w-5" />
        ) : (
          <LogOut className="h-5 w-5" />
        )}
        {busy ? (locating ? "Mengambil lokasi..." : "Memproses...") : mode === "in" ? "Check In" : "Check Out"}
      </button>
      <p className="flex items-center justify-center gap-1 text-xs text-slate-400">
        <MapPin className="h-3.5 w-3.5" />
        Lokasi akan dicatat kalau Anda izinkan -- kalau ditolak, tetap bisa lanjut tanpa lokasi.
      </p>
      {error && <p className="text-center text-xs font-medium text-rose-600">{error}</p>}
    </div>
  );
}
