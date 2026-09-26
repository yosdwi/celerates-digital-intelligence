"use client";
// `Tanya` thread (spike S1): assistant-ui primitives over our own run store via ExternalStoreRuntime.
// assistant-ui renders messages/composer only. Run state, transport (AG-UI via ERP BFF) and authority stay ours.
// Loaded lazily by the Agent panel so pages that never open this tab pay nothing for it.
import type { ReactNode } from "react";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { SendHorizontal, Sparkles } from "lucide-react";
import { toThreadMessages, type AgentRun, type Evidence } from "@/lib/agent/run-state";
import { EvidenceCard, ProposalCard, RunError, RunProgress, ToolTrace } from "./evidence";

export type Suggestion = { label: string; run: () => void };

function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 px-3 py-2 text-sm text-white">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="space-y-2" data-agent-message>
      <MessagePrimitive.Parts
        components={{
          Text: ({ text }) => <p className="whitespace-pre-line text-sm leading-relaxed text-slate-800">{text}</p>,
          data: {
            by_name: {
              progress: ({ data }) => <RunProgress steps={data.steps} running={data.running} />,
              evidence: ({ data }) => <EvidenceCard item={data as Evidence} />,
              error: ({ data }) => <RunError message={String(data.message)} />,
              proposal: ({ data }) => <ProposalCard args={data as Record<string, unknown>} />,
            },
          },
          tools: {
            Fallback: ({ toolName, result }) => <ToolTrace toolName={toolName} result={result} />,
          },
          ToolGroup: ({ children }: { children?: ReactNode }) => (
            <details className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              <summary className="cursor-pointer">Jejak alat Agent</summary>
              <ul className="mt-2 space-y-1">{children}</ul>
            </details>
          ),
        }}
      />
    </MessagePrimitive.Root>
  );
}

export default function AgentThread({
  runs,
  running,
  enabled,
  suggestions,
  onSearch,
}: {
  runs: AgentRun[];
  running: boolean;
  enabled: boolean;
  suggestions: Suggestion[];
  onSearch: (text: string) => void;
}) {
  const runtime = useExternalStoreRuntime<ThreadMessageLike>({
    messages: toThreadMessages(runs) as ThreadMessageLike[],
    isRunning: running,
    isDisabled: !enabled,
    convertMessage: (message) => message,
    onNew: async (message: AppendMessage) => {
      const text = message.content.map((part) => (part.type === "text" ? part.text : "")).join(" ").trim();
      if (text) onSearch(text);
    },
  });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="flex h-full flex-col">
        <ThreadPrimitive.Viewport className="flex-1 space-y-4 overflow-y-auto overscroll-contain p-5">
          <ThreadPrimitive.Empty>
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                {enabled
                  ? "Tanyakan kondisi halaman ini atau cari record. Jawaban disusun dari fakta ERP dan pengetahuan yang disetujui, dengan buktinya."
                  : "Agent belum dikonfigurasi di lingkungan ini. Perlu perhatian dan Masukan tetap dapat digunakan."}
              </p>
              {enabled && suggestions.length > 0 && (
                <div className="flex flex-col gap-2" aria-label="Saran">
                  {suggestions.map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      onClick={s.run}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs font-medium text-slate-700 hover:border-brand-300 hover:text-brand-700"
                    >
                      <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand-600" />
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
        </ThreadPrimitive.Viewport>
        <ComposerPrimitive.Root className="flex items-end gap-2 border-t border-slate-100 p-3">
          <ComposerPrimitive.Input
            aria-label="Pesan untuk Agent"
            placeholder="Cari nomor, client, atau posisi…"
            rows={1}
            maxLength={100}
            className="min-h-10 flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:bg-slate-50"
          />
          {/* Voice (M2) will sit here as push-to-talk feeding the same run; it can never confirm a write. */}
          <ComposerPrimitive.Send
            aria-label="Kirim"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white disabled:opacity-40"
          >
            <SendHorizontal className="h-4 w-4" />
          </ComposerPrimitive.Send>
        </ComposerPrimitive.Root>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}
