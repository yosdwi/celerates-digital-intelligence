// Browser-side AG-UI stream consumption for the Agent panel (ADR-013, spike S2).
// POST /api/agent/ag-ui starts a run and streams AG-UI events; a dropped stream resumes through
// GET /api/agent/runs/{id}/events with Last-Event-ID. Events are applied to a pure reducer (run-state.ts).
export type AgUiEvent = { type: string; [key: string]: unknown };

export async function readSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: AgUiEvent, id: string | null) => void,
): Promise<string | null> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastId: string | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      let id: string | null = null;
      const data: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("id:")) id = line.slice(3).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }
      if (!data.length) continue;
      if (id) lastId = id;
      try {
        onEvent(JSON.parse(data.join("\n")) as AgUiEvent, id);
      } catch {
        // A malformed frame is skipped; the terminal event decides completion.
      }
    }
  }
  return lastId;
}

export type RunRequest = {
  runId: string;
  threadId: string;
  skill: "explain_signal" | "explain_entity" | "search" | "ask" | "follow_up_signal" | "import_dataset";
  args: Record<string, string>;
  path: string;
  text: string;
};

const TERMINAL = new Set(["RUN_FINISHED", "RUN_ERROR"]);

/** Runs to a terminal event, resuming up to three times from the last seen event id. */
export async function streamRun(request: RunRequest, onEvent: (event: AgUiEvent, id: string | null) => void, signal: AbortSignal) {
  let terminal = false;
  const handle = (event: AgUiEvent, id: string | null = null) => {
    if (TERMINAL.has(event.type)) terminal = true;
    onEvent(event, id);
  };
  const input = {
    threadId: request.threadId,
    runId: request.runId,
    state: {},
    tools: [],
    context: [],
    messages: [{ id: request.runId + ":user", role: "user", content: request.text }],
    forwardedProps: { skill: request.skill, args: request.args, path: request.path },
  };
  let lastId: string | null = null;
  let response = await fetch("/api/agent/ag-ui", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(input),
    signal,
  });
  for (let attempt = 0; ; attempt++) {
    if (!response.ok || !response.body) {
      const detail = await response.json().catch(() => ({ error: "" }));
      handle({ type: "RUN_ERROR", message: detail.error || "Agent belum dapat dihubungi.", code: `HTTP_${response.status}` });
      return;
    }
    try {
      lastId = (await readSse(response.body, handle)) ?? lastId;
    } catch (error) {
      if (signal.aborted) throw error;
    }
    if (terminal || attempt >= 3) break;
    response = await fetch(`/api/agent/runs/${request.runId}/events?path=${encodeURIComponent(request.path)}`, {
      headers: { Accept: "text/event-stream", ...(lastId ? { "Last-Event-ID": lastId } : {}) },
      signal,
    });
  }
  if (!terminal) handle({ type: "RUN_ERROR", message: "Koneksi ke Agent terputus. Coba lagi.", code: "STREAM_INCOMPLETE" });
}
