"use client";
// Last-resort boundary: an error in the root layout itself (sidebar, header, Agent) replaces the whole document, so
// this renders its own <html>. Without it the browser shows Next's bare "Application error" line.
import { useEffect } from "react";
import { isStaleBuild, reloadOnce } from "@/lib/stale-build";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    if (isStaleBuild(error) && reloadOnce()) return;
    console.error(error);
  }, [error]);

  return (
    <html lang="id">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f8fafc", color: "#0f172a" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ maxWidth: 420, width: "100%", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 32, textAlign: "center" }}>
            <h1 style={{ fontSize: 18, margin: 0 }}>Halaman perlu dimuat ulang</h1>
            <p style={{ fontSize: 14, color: "#64748b", marginTop: 8 }}>
              Aplikasi mungkin baru diperbarui atau koneksi sempat terputus. Data yang belum disimpan mungkin perlu diisi ulang.
            </p>
            {error.digest && <p style={{ fontSize: 12, color: "#94a3b8" }}>Kode error: {error.digest}</p>}
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{ marginTop: 16, background: "#194667", color: "#fff", border: 0, borderRadius: 8, padding: "10px 20px", fontSize: 14, cursor: "pointer" }}
            >
              Muat ulang
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
