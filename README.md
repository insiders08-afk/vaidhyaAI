# Vaidhya AI

Vaidhya AI is a cloud-assisted clinical documentation prototype for multilingual consultations. The web application captures consultation audio, sends short WAV segments to Gnani Prisma for speech recognition, generates a structured draft with an LLM, and prepares a reviewable text summary for optional WhatsApp handoff.

> **Prototype safety notice:** This repository is not a clinically validated medical device. AI-generated notes and prescriptions are drafts, not medical advice or approved orders. A qualified clinician must verify the transcript, medicine names, strengths, dosage, timing, duration and follow-up before use. Do not use real patient or protected health information in demos or challenge submissions. The current web app does not provide production-grade authentication, access control, audit trails or regulatory compliance.

## Active web workflow

1. **Patient/session setup** — `apps/web/src/app/page.tsx` records the local patient session and language choice.
2. **Audio capture and chunking** — `apps/web/src/lib/audio-chunker.ts` converts microphone/upload audio to mono 16 kHz WAV and emits chunks up to 24 seconds.
3. **Transcription** — `POST /api/transcribe` routes to Gnani Prisma v3 by default. Provider code lives in `packages/pipeline/transcribe/src/providers/`.
4. **Transcript assembly** — `apps/web/src/app/record/page.tsx` queues segments by sequence number, supplies prior transcript context, retries recoverable failures and blocks note generation while segments remain unresolved.
5. **Note generation** — `POST /api/generate-notes` asks the configured LLM for structured draft notes. The current Gnani adapter does not return verified doctor/patient diarization; the notes endpoint must not invent speaker turns from raw transcript text.
6. **Review and sharing** — `apps/web/src/app/results/page.tsx` presents notes, prescriptions and audio. Medication edits reset the local share acknowledgement. WhatsApp opens a prefilled text draft; the user must review and send it manually.

## Gnani Prisma v3 configuration

Default endpoint: `https://api.vachana.ai/stt/v3`; default model: `prisma-v3.0`; default language setting: `indic-auto`.

The server-side adapter exposes these controls:

| Setting | Purpose |
|---|---|
| `GNANI_STT_FORMAT` | `verbatim`, `transcribe`, `codemix` or `transliterate` |
| `GNANI_STT_TOPIC` | Short domain/consultation context |
| `GNANI_STT_KEYTERMS` | Optional vocabulary hints, up to 200 |
| `GNANI_STT_SPEAKER_NAMES` | Optional actual names likely to be spoken, up to four |
| `previous_text` | Prior segment transcript context (last 600 characters) |
| `request_id` | Per-segment request correlation ID |

These controls improve recognition context; they do not establish clinical speaker roles or verify clinical facts. The current Gnani response model used here does not expose speaker-attributed segments to the note generator.

## Quick start

Requirements: Node.js compatible with the repository's Next.js version and pnpm 10.x.

```bash
pnpm install
pnpm run setup
```

Configure `apps/web/.env.local` with your `GNANI_API_KEY` and `OPENAI_API_KEY`, then run:

```bash
pnpm dev
```

The root development script serves the Next.js web app on port 3001.

## Validation commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:no-phi-logs
pnpm build
```

## Active and legacy paths

| Path | Current responsibility |
|---|---|
| `apps/web/src/app/record/page.tsx` | Active browser recording/upload orchestration |
| `apps/web/src/lib/audio-chunker.ts` | Active browser audio decoding, resampling and chunking |
| `apps/web/src/app/api/transcribe/route.ts` | Active transcription API route |
| `apps/web/src/app/api/generate-notes/route.ts` | Active LLM draft-generation route |
| `apps/web/src/app/results/page.tsx` | Active results, edits and sharing intent |
| `packages/pipeline/audio-ingest` | Shared audio capture/resampling primitives |
| `packages/pipeline/transcribe` | Gnani and optional NVIDIA provider adapters |
| `packages/pipeline/assemble`, `note-core`, `render` | Reusable/inherited modules; not the active web request path unless imported by it |

Some source, scripts and documentation are inherited from OpenScribe/StenoAI. The legacy segment uploader targets `/api/transcription/segment`; the active Vaidhya recorder posts `audio_file` to `/api/transcribe`. Do not connect the legacy uploader without reconciling endpoint, ordering and payload contracts. See [architecture.md](./architecture.md) for the current flow and storage notes.

## Data handling and limitations

- Patient/session metadata and consultation results are stored locally through the browser storage helper.
- The consultation audio blob is stored separately in IndexedDB and is not encrypted by that helper.
- `NEXT_PUBLIC_SECURE_STORAGE_KEY` is client-visible by definition. It is not a server secret or per-user security boundary. Do not treat it as production encryption.
- Audio is sent to the configured speech provider; transcript text is sent to the configured LLM provider.
- The WhatsApp action creates a prefilled `wa.me` text draft. It does not automatically send messages, generate a PDF or attach the recording. Audio export uses the device share sheet/download separately.

Do not use this prototype with real patient data. A real-world pilot needs authentication, role-based access, explicit recording consent, encrypted or minimised audio persistence, retention/deletion controls, auditable clinician approval, vendor/privacy review, incident response and applicable legal/regulatory review.

## Licensing and upstream attribution

The repository retains its MIT licence and upstream notices. Portions are derived from OpenScribe and StenoAI; preserve original copyright and licence notices when modifying or redistributing those components.
