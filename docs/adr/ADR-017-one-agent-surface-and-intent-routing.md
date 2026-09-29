# ADR-017 — One Agent surface, and Masukan understood from free text

Status: accepted (2026-09-27). Builds on ADR-010 (ERP-held proposals), ADR-013 (AG-UI panel), ADR-014 (bounded model reasoning) and ADR-015 (quality loop).

## Context

The Agent panel had three tabs: *Perlu perhatian*, *Tanya* and *Masukan*. That is three mental models for one assistant.

The product direction is one conversational surface as the centre of a future mobile-friendly operational shell. It has one composer (text, voice, file, send), and the Agent decides which capability a message needs. *Perlu perhatian* and *Masukan* must stay as capabilities, but they are no longer entry tabs.

Doc 14 §3 also asks that free text be understood as the right *kind* of feedback: Feature Request, data correction, knowledge correction, Agent feedback or an action. A complaint must not automatically become a Feature Request.

## Decision

1. **One surface.**
   - The panel is one thread with one composer.
   - *Perlu perhatian* becomes the **Ringkasan** above the thread. It keeps the same ERP rules, counts, wording, links, `Tanyakan`/`Tindak lanjuti`, trends and *Tindak lanjut berjalan*. It is open until a conversation starts, then folds to one line.
   - The Ringkasan reads only ERP, so it works when Intelligence is off.
   - "Apa yang perlu aku perhatikan hari ini?" is answered in the conversation by a deterministic brief: live counts, ranked by observed rise and then by count. It runs deterministically even when a model is configured.
   - On a phone, the Agent is full screen.
2. **Masukan is a capability with a form fallback.**
   - The contextual Feature Request form is unchanged. It is reachable from the surface at any time and is the path when the Agent is not configured.
3. **Four feedback intents, one routing substrate.** Questions and action requests keep the `ask` path. A feedback message ends in a **draft the user reviews** before anything is submitted:

   | Intent | Draft | Who applies |
   | --- | --- | --- |
   | `feature_request` | ERP-held proposal `feature_request.create`, with the page as context | ERP, when the user confirms |
   | `data_correction` | ERP-held proposal `task.create` linked to the record | ERP creates a task for the data owner; data is never edited directly |
   | `knowledge_correction` | Intelligence-held draft (`agent_submissions`), inheriting the scope of the knowledge it cites | Sent by the user; a curator may turn it into a *draft* knowledge source; approval stays in Knowledge |
   | `agent_feedback` | Intelligence-held draft about the previous answer in the same conversation | Sent by the user; recorded as `agent_feedback` on that answer (ADR-015) |

   How the intent is chosen:
   - **With a model**, the planner may reply `{"route": {...}}`. The runtime validates it:
     - the intent comes from the fixed set;
     - citations must be known;
     - the record for a data correction and the knowledge for a knowledge correction are taken from **cited evidence**, never from model text. On a record page, the page's record is used.
   - The route is shown as *Inferensi*, recorded as a model turn (verdict `route`), and can be saved and replayed as an evaluation case: expected intent, and grounded citations.
   - The user can correct the chosen kind ("Bukan ini: …"). Each correction is a new, reviewed draft.
   - **Without a model** (or when a route fails validation), the deterministic router only *notices* feedback-like wording. It offers the kinds as actions, and the user picks one (`route_feedback`, shown as an observation "dipilih Anda"). It does not guess.
4. **Intelligence-held drafts are a `propose`-class tool.** `draft_submission` creates the user's own draft and nothing else.
   - Only the owner can send or cancel it, through the ERP BFF under their delegation.
   - Curators see sent items in the Brain Console. There they either **promote** a knowledge correction to a draft knowledge source or **close** it.
   - An ERP sign-in (ADR-016) may promote, because that creates a draft only. Knowledge approval still needs a named workspace token.
5. **The previous exchange is conversation context.** The model receives the previous question and answer of the same thread (skipping feedback turns). It uses them to resolve "jawaban tadi" and "nomor 2". The deterministic brief and routing do not depend on it.

## Consequences

- Users need no longer know where to go. The launcher opens one conversation, and *Perlu perhatian* is still the first thing they see.
- No new write path.
  - ERP effects remain ERP-held proposals confirmed by the user.
  - Intelligence stores drafts and observations only.
  - Knowledge changes only through the existing curator approval.
- A knowledge correction without cited knowledge falls back to company scope. One with cited knowledge inherits that source's scope and classification, and is never wider.
- The thread chunk (assistant-ui) now loads when the panel opens, instead of when the *Tanya* tab opened. Pages that never open the Agent still pay nothing for it.
- Browser and journey tests now assert the one-surface behaviour: no tabs, Ringkasan fold, form fallback, full-screen mobile.
