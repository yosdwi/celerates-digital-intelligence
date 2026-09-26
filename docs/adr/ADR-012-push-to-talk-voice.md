# ADR-012 — Push-to-talk voice through the same Agent runtime

Status: accepted (2026-09-26). Record: [operating-substrate-m3.md](../implementation/operating-substrate-m3.md). Proposed in doc 15 §9.

## Decision

1. **Voice is an input method, not a second agent.**
   - Push-to-talk (click to record, click to stop, auto-stop at 60 s) is transcribed into **editable text in the composer**.
   - The user reviews the text and sends it. The run is the same `ask` run, recorded with `modality='voice'`.
2. **Transcription goes through the Model Gateway.**
   - `gateway.transcribe` calls `litellm.transcription` with `AGENT_TRANSCRIBE_MODEL` (default language `AGENT_TRANSCRIBE_LANGUAGE=id`), using the same `MODEL_API_BASE` / `MODEL_API_KEY`.
   - Audio passes through the ERP BFF (`POST /api/agent/transcribe`: session, same origin, ≤ 5 MB audio) to Intelligence (`POST /api/agent/transcribe`: user delegation).
   - **Neither service stores audio.** Only the text returns.
3. **Voice never acts.**
   - Transcribing starts no run.
   - Sending the reviewed text only asks.
   - Proposals are still confirmed by a click in ERP against the stored digest (ADR-010).
4. **Voice appears only when configured.**
   - Intelligence reports `GET /api/agent/capabilities` (`reasoning`, `voice`), which ERP caches for 15 s.
   - Without `AGENT_TRANSCRIBE_MODEL`, the microphone is not shown.
5. **Browser speech APIs are not used** (doc 15 §2.10), including assistant-ui's Web Speech dictation adapter. Recording uses `MediaRecorder` (WebM/Opus where supported).

## Consequences

- Any Whisper-compatible provider behind LiteLLM works. The harness uses a local stand-in and Chromium's fake microphone to test the full path.
- The Brain Console marks voice runs.
- Continuous or streaming voice, and spoken answers (TTS), are not included.
