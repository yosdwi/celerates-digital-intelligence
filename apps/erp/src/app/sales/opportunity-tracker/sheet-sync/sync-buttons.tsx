"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { syncPull, syncPush } from "./actions";
import { debugSync } from "./actions";

export function SyncButtons() {
  const t = useTranslations("sales.sheetSync");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [debugData, setDebugData] = useState<any>(null);

  function handleDebug() {
    startTransition(async () => {
      const result = await debugSync();
      setDebugData(result);
    });
  }

  function handlePull() {
    if (!confirm(t("pullConfirmTracker"))) return;
    startTransition(async () => {
      setMessage(null);
      const result = await syncPull();
      if (result.ok) {
        setMessage({ type: "ok", text: t("pullSuccess", { imported: result.imported, skipped: result.skipped }) });
      } else {
        setMessage({ type: "error", text: result.error });
      }
    });
  }

  function handlePush() {
    if (!confirm(t("pushConfirmTracker"))) return;
    startTransition(async () => {
      setMessage(null);
      const result = await syncPush();
      if (result.ok) {
        setMessage({ type: "ok", text: t("pushSuccess", { imported: result.imported }) });
      } else {
        setMessage({ type: "error", text: result.error });
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <button onClick={handlePull} disabled={isPending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          {isPending ? t("processing") : t("pullButton")}
        </button>
        <button onClick={handlePush} disabled={isPending} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          {isPending ? t("processing") : t("pushButton")}
        </button>
      </div>
      {message && (
        <p className={`text-sm ${message.type === "ok" ? "text-green-600" : "text-red-600"}`}>{message.text}</p>
      )}

      <button onClick={handleDebug} disabled={isPending} className="text-xs text-slate-500 underline">
        {t("debugViewMapping")}
      </button>
      {debugData && (
        <pre className="text-xs bg-slate-50 p-3 rounded-lg overflow-x-auto max-h-64">
          {JSON.stringify(debugData, null, 2)}
        </pre>
      )}
    </div>
  );
}
