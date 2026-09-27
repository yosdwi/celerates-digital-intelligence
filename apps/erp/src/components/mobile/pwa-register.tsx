"use client";
// Registers the minimal service worker (public/sw.js): offline fallback for failed navigations only.
// It never caches authenticated responses (doc 18 §3 F5).
import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  }, []);
  return null;
}
