"use client";
// The Home's "Tanya apa saja" box (QA doc page 18, Attio's Home): a question goes to the Agent, which answers with the
// person's own access. Suggestions follow what the person works on.
import { useState } from "react";
import { ArrowUp, Sparkles } from "lucide-react";
import { openAgent } from "@/components/mobile/events";

export function HomeAsk({ suggestions }: { suggestions: string[] }) {
  const [text, setText] = useState("");
  const ask = (q: string) => { if (q.trim()) { openAgent({ ask: q.trim() }); setText(""); } };
  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); ask(text); }} className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] focus-within:border-slate-300">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(text); } }}
          rows={3}
          placeholder="Tanya apa saja…"
          aria-label="Tanya Agent"
          className="block w-full resize-none rounded-t-xl bg-transparent px-4 pt-3 text-[14px] text-slate-900 outline-none placeholder:text-slate-400"
        />
        <div className="flex items-center justify-end gap-2 px-3 pb-3">
          <span className="text-[12px] text-slate-400">Agent memakai akses Anda sendiri</span>
          <button type="submit" disabled={!text.trim()} aria-label="Kirim" className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#194667] text-white disabled:opacity-40">
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </form>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {suggestions.map((s) => (
          <button key={s} type="button" onClick={() => ask(s)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[12.5px] text-slate-700 hover:bg-slate-50">
            <Sparkles className="h-3.5 w-3.5 text-[#194667]" /> {s}
          </button>
        ))}
      </div>
    </div>
  );
}
