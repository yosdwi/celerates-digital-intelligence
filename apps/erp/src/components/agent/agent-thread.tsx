"use client";
// `Tanya` thread (spike S1): assistant-ui primitives over our own run store via ExternalStoreRuntime.
// assistant-ui renders messages/composer only. Run state, transport (AG-UI via ERP BFF) and authority stay ours.
// Loaded lazily by the Agent panel so pages that never open this tab pay nothing for it.
import { createContext, useContext, useRef, useState, type DragEvent, type ReactNode } from "react";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { Loader2, Paperclip, SendHorizontal, Sparkles } from "lucide-react";
import { toThreadMessages, type AgentAction, type AgentRun, type Evidence, type MappingCardData, type Provenance } from "@/lib/agent/run-state";
import { EvidenceCard, ProvenanceLine, RunError, RunProgress, ToolTrace } from "./evidence";
import { MappingCard } from "./mapping";
import { ProposalCard } from "./proposal";

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

// Part renderers are module-level so their component identity is stable. Inline renderers would be new component
// types on every render, remounting parts and resetting an open proposal card's selections.
const ActionContext = createContext<(action: AgentAction) => void>(() => undefined);

function Actions({ items }: { items: AgentAction[] }) {
  const onAction = useContext(ActionContext);
  return (
    <div className="flex flex-wrap gap-2" aria-label="Langkah berikutnya">
      {items.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={() => onAction(action)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-brand-100 bg-brand-50 px-2.5 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {action.label}
        </button>
      ))}
    </div>
  );
}

function Mapping({ data }: { data: MappingCardData }) {
  return <MappingCard data={data} onRun={useContext(ActionContext)} />;
}

type DataPart = { data: Record<string, unknown> };
const PARTS = {
  Text: ({ text }: { text: string }) => <p className="whitespace-pre-line text-sm leading-relaxed text-slate-800">{text}</p>,
  data: {
    by_name: {
      progress: ({ data }: DataPart) => <RunProgress steps={data.steps as { name: string; done: boolean }[]} running={data.running === true} />,
      evidence: ({ data }: DataPart) => <EvidenceCard item={data as unknown as Evidence} />,
      error: ({ data }: DataPart) => <RunError message={String(data.message)} />,
      proposal: ({ data }: DataPart) => <ProposalCard id={String(data.id)} title={String(data.title)} />,
      actions: ({ data }: DataPart) => <Actions items={data.items as AgentAction[]} />,
      mapping: ({ data }: DataPart) => <Mapping data={data as unknown as MappingCardData} />,
      provenance: ({ data }: DataPart) => <ProvenanceLine value={data as unknown as Provenance} />,
    },
  },
  tools: {
    Fallback: ({ toolName, result }: { toolName: string; result?: unknown }) => <ToolTrace toolName={toolName} result={result} />,
  },
  ToolGroup: ({ children }: { children?: ReactNode }) => (
    <details className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
      <summary className="cursor-pointer">Jejak alat Agent</summary>
      <ul className="mt-2 space-y-1">{children}</ul>
    </details>
  ),
};

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="space-y-2" data-agent-message>
      <MessagePrimitive.Parts components={PARTS} />
    </MessagePrimitive.Root>
  );
}

export default function AgentThread({
  runs,
  running,
  enabled,
  suggestions,
  onSearch,
  onFile,
  onAction,
}: {
  runs: AgentRun[];
  running: boolean;
  enabled: boolean;
  suggestions: Suggestion[];
  onSearch: (text: string) => void;
  /** `Drop anything`: a CSV/XLSX becomes a dataset, then a proposal the user confirms in ERP. */
  onFile: (file: File) => Promise<string | null>;
  onAction: (action: AgentAction) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const accept = async (file: File | undefined) => {
    if (!file || !enabled || running || uploading) return;
    setUploading(true);
    setFileError(await onFile(file));
    setUploading(false);
  };
  const drop = {
    onDragOver: (e: DragEvent) => {
      if (!enabled || !e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (e: DragEvent) => {
      if (!enabled) return;
      e.preventDefault();
      setDragging(false);
      void accept(e.dataTransfer.files[0]);
    },
  };
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
      <ThreadPrimitive.Root className={`flex h-full flex-col ${dragging ? "bg-brand-50/60 ring-2 ring-inset ring-brand-300" : ""}`} {...drop}>
        <ThreadPrimitive.Viewport className="flex-1 space-y-4 overflow-y-auto overscroll-contain p-5">
          <ThreadPrimitive.Empty>
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                {enabled
                  ? "Tanyakan apa saja tentang kondisi, record, atau aturan kerja — misalnya “requisition mana yang belum punya TA PIC?” — atau jatuhkan berkas CSV/XLSX untuk diimpor. Jawaban disusun dari fakta ERP dan pengetahuan yang disetujui, dengan buktinya; perubahan data selalu menunggu konfirmasi Anda."
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
          <ActionContext.Provider value={onAction}>
            <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
          </ActionContext.Provider>
        </ThreadPrimitive.Viewport>
        {fileError && (
          <p role="alert" className="mx-3 mb-0 mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
            {fileError}
          </p>
        )}
        <ComposerPrimitive.Root className="flex items-end gap-2 border-t border-slate-100 p-3">
          <input
            ref={picker}
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            data-agent-file
            onChange={(e) => {
              void accept(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            aria-label="Lampirkan berkas CSV atau XLSX"
            title="Impor CSV/XLSX"
            disabled={!enabled || running || uploading}
            onClick={() => picker.current?.click()}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 text-slate-600 hover:border-brand-300 hover:text-brand-700 disabled:opacity-40"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
          </button>
          <ComposerPrimitive.Input
            aria-label="Pesan untuk Agent"
            placeholder="Tanya kondisi, nomor, client, atau posisi…"
            rows={1}
            maxLength={300}
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
