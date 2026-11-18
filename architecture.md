# Vaidhya AI — Architecture

This document distinguishes the active Vaidhya web workflow from inherited OpenScribe pipeline modules that remain in the repository.

## 1. Active request path

```text
Patient/session setup
  apps/web/src/app/page.tsx
        |
        v
Browser microphone or uploaded audio
  apps/web/src/app/record/page.tsx
  apps/web/src/lib/audio-chunker.ts
        |
        | mono PCM, 16 kHz, WAV segments <= 24 seconds
        v
POST /api/transcribe
  apps/web/src/app/api/transcribe/route.ts
        |
        v
packages/pipeline/transcribe provider resolver
        +--> Gnani Prisma v3.0 (default)
        +--> NVIDIA Parakeet (optional)
        |
        v
Sequence-ordered transcript assembly in browser
        |
        v
POST /api/generate-notes
  apps/web/src/app/api/generate-notes/route.ts
        |
        v
Configured LLM -> structured draft JSON
        |
        v
Local results and original recording
        |
        v
apps/web/src/app/results/page.tsx
        +--> local review acknowledgement -> prefilled WhatsApp text draft
        +--> independent audio playback/export
```

## 2. E1 — Recording, audio processing and chunking

Active implementation: `apps/web/src/lib/audio-chunker.ts` plus `packages/pipeline/audio-ingest/src/capture/audio-processing.ts`.

- Microphone samples are downmixed to mono and resampled to 16 kHz.
- The streaming resampler carries its fractional source position across browser audio callbacks. Resetting phase at each callback causes sample drift at non-integer ratios such as 44.1 kHz to 16 kHz.
- The resampler flush emits only correctly interpolated target-rate samples; raw source-rate remainder samples must never be appended to a 16 kHz WAV.
- Live recording and uploaded files retain every non-empty final chunk, including short tails.
- Live microphone chunks are emitted at approximately 24-second intervals.

The active recording page keys transcript text and diarized segments by sequence number. Duplicate callbacks for an already pending/completed sequence are ignored. Recoverable transcription failures are retried up to three attempts; later chunks remain buffered after a persistent failure. Before note generation, remaining chunks are retried sequentially. A missing or failed chunk blocks finalisation.

## 3. E2 — Gnani Prisma v3 transcription

Active route: `POST /api/transcribe`.

The API validates that:
- `audio_file` is present.
- `seq_no` is a non-negative safe integer.
- output format is one of `verbatim`, `transcribe`, `codemix` or `transliterate`.

The server/provider path supports:
- `language_code` (session or environment setting).
- `format` (default `transcribe`).
- `topic` (default consultation context).
- `keyterms` (up to 200 terms).
- `speaker_names` (up to four actual names likely to be spoken; do not substitute generic role words).
- `previous_text` (bounded to the prior 600 characters).
- `X-API-Request-ID` for segment request correlation.

The API key remains server-side. Prisma context hints improve recognition of names/vocabulary; they are not proof of a speaker's clinical role. The current Gnani success response adapter returns transcript, language and processing metadata, but no verified diarized segments.

## 4. E3 — Clinical note generation

Active route: `POST /api/generate-notes`.

- Empty transcripts are rejected.
- Transcript input is capped at 60,000 characters.
- The LLM is instructed not to invent prescriptions, dosages, timings, restrictions, diagnoses or red flags.
- Missing dosage and meal-timing fields remain empty. Schedule fields accept only actual boolean `true`.
- Without supplied speaker-diarized segments, the note generator returns an empty `diarized_transcript`; it does not fabricate Clinician/Patient dialogue from raw text.
- Unrecognised speaker tags are normalised to `Unknown`.

These are safeguards around generated drafts, not clinical validation. A qualified clinician must verify the content before sharing or acting on it.

## 5. E4 — Results and patient sharing

The Results page displays draft notes, prescription schedules, transcript and original audio. Removing a medicine or changing a time slot resets the local acknowledgement.

WhatsApp sharing builds a `https://wa.me/` URL containing prefilled text. It is **not** a WhatsApp Business API integration, automatic message delivery, PDF generator or audio attachment path. A user acknowledgement is required before opening/copying the text draft; this local acknowledgement does not authenticate a clinician or certify the record.

Audio sharing is separate and uses the device share sheet when supported, falling back to file download.

## 6. E5 — Active versus inherited architecture

The following are the active web workflow modules:

- `apps/web/src/app/record/page.tsx`
- `apps/web/src/lib/audio-chunker.ts`
- `apps/web/src/app/api/transcribe/route.ts`
- `packages/pipeline/transcribe/src/providers/gnani-transcriber.ts`
- `packages/pipeline/transcribe/src/providers/provider-resolver.ts`
- `apps/web/src/app/api/generate-notes/route.ts`
- `apps/web/src/app/results/page.tsx`
- `packages/storage` and `packages/llm`

The `assemble`, `note-core`, `render`, and older segment-upload modules are reusable/inherited components, not automatically part of the active web route. The legacy segment uploader targets `/api/transcription/segment`; the current recorder sends `audio_file` to `/api/transcribe`. Before reusing legacy modules, reconcile endpoint, multipart fields, ordering, overlap and error/retry contracts.

## 7. Storage and privacy limitations

Patient/session data and consultation results are stored locally through the browser storage helper. The complete consultation audio is separately persisted as a Blob in IndexedDB and is not encrypted by that helper.

In browser mode, `NEXT_PUBLIC_SECURE_STORAGE_KEY` is client-visible and is not a secret. If it is absent, the browser fallback key is stored in localStorage. This is not production-grade protection for patient data. Audio is transmitted to the configured transcription provider; transcript text is transmitted to the configured LLM provider.

Do not use real patient data in the current prototype. Before any real pilot, implement identity/access management, explicit recording consent, encrypted/minimised audio persistence, retention/deletion controls, audit trails, vendor/privacy review, incident response and applicable legal/regulatory controls.

## 8. Configuration and checks

Keep the root `pnpm.overrides` entries in `package.json` aligned with the top-level `overrides` block in `pnpm-lock.yaml`; after changing an override, regenerate the lockfile with the repository's pnpm 10 version and commit both files. See [apps/web/.env.local.example](./apps/web/.env.local.example). Main configuration includes `TRANSCRIPTION_PROVIDER`, `GNANI_API_KEY`, `GNANI_STT_MODEL`, `GNANI_LANGUAGE_CODE`, `GNANI_STT_FORMAT`, `GNANI_STT_TOPIC`, `GNANI_STT_KEYTERMS`, `GNANI_STT_SPEAKER_NAMES`, and LLM credentials.

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
