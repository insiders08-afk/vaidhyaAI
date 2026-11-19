import { DEFAULT_GNANI_MODEL, transcribeWithGnani, type GnaniTranscribeOptions } from "./gnani-transcriber"
import { transcribeWithNvidiaParakeet, type DiarizedUtterance } from "./nvidia-parakeet-transcriber"

export type TranscriptionProvider = "gnani" | "nvidia_parakeet"

export interface ResolvedTranscriptionProvider {
  provider: TranscriptionProvider
  model: string
}

export interface TranscriptionOutput {
  transcript: string
  provider: TranscriptionProvider
  model: string
  detectedLanguageCode?: string
  requestId?: string
  processingTime?: number
  truncated?: boolean
  diarizedSegments?: DiarizedUtterance[]
}

export interface TranscribeAudioOptions {
  languageCode?: string
  previousText?: string
  topic?: string
  format?: GnaniTranscribeOptions["format"]
  speakerNames?: string[]
  keyterms?: string[]
  requestId?: string
  mimeType?: string
  fetchFn?: typeof fetch
}

function normalizeProvider(rawProvider: string | undefined): string {
  return rawProvider?.trim().toLowerCase() || ""
}

export function resolveTranscriptionProvider(env: Partial<NodeJS.ProcessEnv> = process.env): ResolvedTranscriptionProvider {
  const provider = normalizeProvider(env.TRANSCRIPTION_PROVIDER)

  if (provider === "nvidia_parakeet" || provider === "parakeet" || provider === "nvidia") {
    return {
      provider: "nvidia_parakeet",
      model: env.NVIDIA_ASR_MODEL?.trim() || "nvidia/parakeet-tdt-0.6b-v2",
    }
  }

  return {
    provider: "gnani",
    model: env.GNANI_STT_MODEL?.trim() || DEFAULT_GNANI_MODEL,
  }
}

export async function transcribeWithResolvedProvider(
  buffer: Buffer,
  filename: string,
  resolved: ResolvedTranscriptionProvider = resolveTranscriptionProvider(),
  options: TranscribeAudioOptions = {},
): Promise<TranscriptionOutput> {
  if (resolved.provider === "nvidia_parakeet") {
    const result = await transcribeWithNvidiaParakeet(buffer, filename, {
      model: resolved.model,
      languageCode: options.languageCode,
    })
    return {
      transcript: result.transcript,
      provider: "nvidia_parakeet",
      model: result.model,
      diarizedSegments: result.diarizedSegments,
    }
  }

  const result = await transcribeWithGnani(buffer, filename, {
    model: resolved.model,
    languageCode: options.languageCode,
    previousText: options.previousText,
    topic: options.topic,
    format: options.format,
    speakerNames: options.speakerNames,
    keyterms: options.keyterms,
    requestId: options.requestId,
    mimeType: options.mimeType,
    fetchFn: options.fetchFn,
  })

  return {
    transcript: result.transcript,
    provider: "gnani",
    model: result.model,
    detectedLanguageCode: result.detectedLanguageCode,
    requestId: result.requestId,
    processingTime: result.processingTime,
    truncated: result.truncated,
  }
}
