# Vaidhya AI

Vaidhya AI is a cloud-assisted clinical documentation prototype for multilingual consultations. It captures consultation audio, sends short WAV segments to Gnani Prisma for speech recognition, generates a structured draft using an LLM, and prepares a reviewable text summary for optional WhatsApp handoff.

> **Prototype safety notice:** This repository is not a clinically validated medical device. AI-generated notes and prescriptions are drafts, not medical advice or approved orders. A qualified clinician must verify the transcript, medicine names, strengths, dosage, timing, duration and follow-up before use. Do not use real patient or protected health information in demos or challenge submissions. The current prototype does not provide production-grade authentication, access control, auditable clinician approval or regulatory compliance.

## Application workflow

1. **Patient/session setup** — `src/app/page.tsx` stores the local patient session and language choice.
2. **Audio capture and chunking** — `src/features/recording/audio-chunker.ts` converts microphone/upload audio to mono 16 kHz WAV and emits chunks up to 24 seconds. The streaming resampler and capture primitives live alongside it.
3. **Transcription** — `POST /api/transcribe` routes to Gnani Prisma v3 by default. Provider adapters live in `src/server/transcription/providers/`.
4. **Transcript assembly** — `src/app/record/page.tsx` queues results by sequence number, passes previous transcript context, retries recoverable failures and blocks note generation while chunks remain unresolved.
5. **Note generation** — `POST /api/generate-notes` asks the configured LLM for structured draft notes. The default Gnani adapter does not return verified doctor/patient diarization; the notes endpoint must not invent speaker turns from raw transcript text.
6. **Review and sharing** — `src/app/results/page.tsx` presents notes, prescriptions and audio. Medication edits reset the local share acknowledgement. WhatsApp opens a prefilled text draft; the user must review and send it manually.

## Repository layout

| Directory | Responsibility |
|---|---|
| `src/app` | Next.js App Router pages and API route handlers |
| `src/components` | Shared UI and primitive components |
| `src/features` | Product workflows: recording, consultation, transcription and sharing |
| `src/server` | Server-side STT/LLM providers, clinical-note modules and error handling |
| `src/lib` | Shared utilities and browser storage helpers |
| `src/hooks` | App-wide React hooks, when needed |
| `src/types` | Cross-feature types, when types cannot stay beside their owner |
| `public` | PWA manifest, service worker, icons and audio worklets |
| `tests` | Evaluation tests and safe audio fixtures |
| `scripts` | Local setup and repository/PHI logging checks |
| `docs` | Architecture, setup and operations documentation |

The app uses Next.js App Router. Routes belong in `src/app`; this repository does not use the legacy Pages Router.

## Gnani Prisma v3 configuration

Default endpoint: `https://api.vachana.ai/stt/v3`; default model: `prisma-v3.0`; default language setting: `indic-auto`.

The server-side adapter supports:

| Setting | Purpose |
|---|---|
| `GNANI_STT_FORMAT` | `verbatim`, `transcribe`, `codemix` or `transliterate` |
| `GNANI_STT_TOPIC` | Short domain/consultation context |
| `GNANI_STT_KEYTERMS` | Optional vocabulary hints, up to 200 |
| `GNANI_STT_SPEAKER_NAMES` | Optional actual names likely to be spoken, up to four |
| `previous_text` | Prior segment transcript context (last 600 characters) |
| `request_id` | Per-segment request correlation ID |

These controls provide recognition context; they do not prove a speaker's clinical role or verify clinical facts. The current Gnani adapter returns transcript, language and processing metadata, but no verified diarized segments.

## Quick start

Requirements: Node.js compatible with the repository's Next.js version and pnpm 10.x.

```bash
pnpm install
pnpm run setup
pnpm dev
```

The setup command creates the root `.env.local` from `.env.example` when needed. Add `GNANI_API_KEY` and `OPENAI_API_KEY` to `.env.local`. The development server runs on port 3001.

## Validation

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:no-phi-logs
pnpm build
```

`pnpm typecheck` checks application TypeScript and compiles the test suite. `pnpm test` runs the compiled Node test files.

## Data handling and limitations

- Patient/session metadata and consultation results are stored locally through the browser storage helper.
- The consultation audio blob is stored separately in IndexedDB and is not encrypted by that helper.
- `NEXT_PUBLIC_SECURE_STORAGE_KEY` is client-visible by definition. It is not a server secret or per-user security boundary. Do not treat it as production encryption.
- Audio is sent to the configured speech provider; transcript text is sent to the configured LLM provider.
- The WhatsApp action creates a prefilled `wa.me` text draft. It does not automatically send messages, generate a PDF or attach the recording. Audio export uses the device share sheet/download separately.
- The clinical-note verification utilities under `src/server/clinical-notes/verification` are not currently integrated into the active `/api/generate-notes` request path. Prompt safeguards are not clinical verification.

Do not use this prototype with real patient data. A real-world pilot needs authentication, role-based access, explicit recording consent, encrypted or minimised audio persistence, retention/deletion controls, auditable clinician approval, vendor/privacy review, incident response and applicable legal/regulatory review.

## Licensing and upstream attribution

The repository retains its MIT licence and upstream notices. Portions are derived from OpenScribe and StenoAI; preserve original copyright and licence notices when modifying or redistributing those components.
