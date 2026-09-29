import type { MetadataRoute } from "next";

// PWA installability (doc 18 §3 F5, §14). Jernih theme; icons derived from the Celerates logo.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Celerates",
    short_name: "Celerates",
    description: "Celerates ERP — modul operasional, Tinjau, dan Agent dalam satu aplikasi.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f6fa",
    theme_color: "#f4f6fa",
    lang: "id",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
