# Vaidhya AI — Architecture

This document describes the current single-application Next.js App Router structure and the active Vaidhya consultation workflow.

## 1. Application structure

```text
src/
├── app/                 # Next.js pages and API route handlers
├── components/          # Shared UI
├── features/            # Recording, consultation, transcription and sharing
├── hooks/               # App-wide React hooks when needed
├── lib/                 # Shared utilities and browser storage
├── server/              # Server-side LLM/STT providers and note modules
├── types/               # Cross-feature types when needed
└── middleware.ts
public/                   # PWA assets, service worker and audio worklets
tests/                    # Evaluation tests and audio fixtures
scripts/                  # Setup, structure and clinical-data logging checks
docs/                     # Supporting documentation
```

Feature-specific types and utilities should stay close to their owning feature. Use `src/types` only for genuinely cross-feature contracts. Keep provider credentials and server-only clients under `src/server`; never import them into Client Components.

## 2. Active request path

```text
Patient/session setup
  src/app/page.tsx
        |
        v
Browser microphone or uploaded audio
  src/app/record/page.tsx
  src/features/recording/audio-chunker.ts
  src/features/recording/audio-processing.ts
        |
        | mono PCM, 16 kHz, WAV segments <= 24 seconds
        v
POST /api/transcribe
  src/app/api/transcribe/route.ts
        |
        v
src/server/transcription
        +--> Gnani Prisma v3.0 (default)
        +--> NVIDIA Parakeet (optional)
        |
        v
Sequence-ordered transcript assembly in browser
        |
        v
POST /api/generate-notes
  src/app/api/generate-notes/route.ts
        |
        v
src/server/llm -> structured draft JSON
        |
        v
Local results and original recording
        |
        v
src/app/results/page.tsx
        +--> local review acknowledgement -> prefilled WhatsApp text draft
        +--> independent audio playback/export
```

## 3. E1 — Recording, audio processing and chunking

Active implementation: `src/features/recording/audio-chunker.ts` plus `src/features/recording/audio-processing.ts`.

- Microphone samples are downmixed to mono and resampled to 16 kHz.
- The streaming resampler carries its fractional source position across browser audio callbacks. Resetting phase at each callback can cause sample drift at non-integer ratios such as 44.1 kHz to 16 kHz.
- The resampler flush emits correctly interpolated target-rate samples.
- Live recording and uploaded files retain every non-empty final chunk, including short tails.
- Live microphone chunks are emitted at approximately 24-second intervals.

The active recording page keys transcript text and diarized segments by sequence number. Duplicate callbacks for an already pending/completed sequence are ignored. Recoverable transcription failures are retried up to three attempts; later chunks remain buffered after a persistent failure. Before note generation, remaining chunks are retried sequentially. A missing or failed chunk blocks finalisation.

## 4. E2 — Gnani Prisma v3 transcription

Active route: `POST /api/transcribe`.

The API validates that the audio file is present, `seq_no` is a non-negative safe integer and the requested format is one of `verbatim`, `transcribe`, `codemix` or `transliterate`.

The server/provider path supports:
- `language_code` (session or environment setting).
- `format` (default `transcribe`).
- `topic` (default consultation context).
- `keyterms` (up to 200 terms).
- `speaker_names` (up to four actual names likely to be spoken; do not substitute generic role words).
- `previous_text` (bounded to the prior 600 characters).
- `X-API-Request-ID` for segment request correlation.

The API key remains server-side. Prisma context hints may improve recognition of names/vocabulary; they are not proof of a speaker's clinical role. The current Gnani success adapter returns transcript, language and processing metadata, but no verified diarized segments.

## 5. E3 — Clinical note generation

Active route: `POST /api/generate-notes`.

- Empty transcripts are rejected and transcript input is capped at 60,000 characters.
- The LLM is instructed not to invent prescriptions, dosages, timings, restrictions, diagnoses or red flags.
- Missing dosage and meal-timing fields remain empty. Schedule fields accept only actual boolean `true`.
- Without supplied speaker-diarized segments, the note generator returns an empty `diarized_transcript`; it does not fabricate Clinician/Patient dialogue from raw text.
- Unrecognised speaker tags are normalised to `Unknown`.

These are safeguards around generated drafts, not clinical validation. The note-verification utilities under `src/server/clinical-notes/verification` are not called by the active API route. A qualified clinician must verify the content before sharing or acting on it.

## 6. E4 — Results and patient sharing

The Results page displays draft notes, prescription schedules, transcript and original audio. Removing a medicine or changing a time slot resets the local acknowledgement.

WhatsApp sharing builds a `https://wa.me/` URL containing prefilled text. It is **not** a WhatsApp Business API integration, automatic message delivery, PDF generator or audio attachment path. A user acknowledgement is required before opening/copying the text draft; this local acknowledgement does not authenticate a clinician or certify the record.

Audio sharing is separate and uses the device share sheet when supported, falling back to file download.

## 7. E5 — Configuration, storage and privacy

Patient/session data and consultation results are stored locally through the browser storage helper. The complete consultation audio is separately persisted as a Blob in IndexedDB and is not encrypted by that helper.

In browser mode, `NEXT_PUBLIC_SECURE_STORAGE_KEY` is client-visible and is not a secret. If it is absent, the browser fallback key is stored in localStorage. This is not production-grade protection for patient data. Audio is transmitted to the configured transcription provider; transcript text is transmitted to the configured LLM provider.

Do not use real patient data in the current prototype. Before any real pilot, implement identity/access management, explicit recording consent, encrypted/minimised audio persistence, retention/deletion controls, audit trails, vendor/privacy review, incident response and applicable legal/regulatory controls.

## 8. Configuration and checks

Keep root `pnpm.overrides` entries in `package.json` aligned with the top-level `overrides` block in `pnpm-lock.yaml`. After changing an override, regenerate the lockfile with the repository's pnpm 10 version and commit both files. Environment variables are documented in [`.env.example`](./.env.example).

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:no-phi-logs
pnpm build
```

Passing software tests is not clinical validation.

## 9. Licensing

The repository retains its MIT licence and upstream notices. Portions are derived from OpenScribe and StenoAI; preserve their original copyright and licence notices.
