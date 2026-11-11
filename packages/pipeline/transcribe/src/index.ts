export { parseWavHeader, getWavDataChunk, isLikelySilentPcm16 } from "./core/wav"
export type { WavInfo } from "./core/wav"
export { useSegmentUpload } from "./hooks/use-segment-upload"
export type { PendingSegment, UploadError } from "./hooks/use-segment-upload"

export {
  DEFAULT_GNANI_API_URL,
  DEFAULT_GNANI_LANGUAGE,
  DEFAULT_GNANI_MODEL,
  GNANI_SUPPORTED_LANGUAGES,
  transcribeWithGnani,
  type GnaniTranscribeOptions,
  type GnaniTranscribeResult,
} from "./providers/gnani-transcriber"

export {
  transcribeWithNvidiaParakeet,
  type DiarizedUtterance,
  type NvidiaParakeetOptions,
  type NvidiaParakeetResult,
} from "./providers/nvidia-parakeet-transcriber"

export {
  resolveTranscriptionProvider,
  transcribeWithResolvedProvider,
  type ResolvedTranscriptionProvider,
  type TranscribeAudioOptions,
  type TranscriptionOutput,
  type TranscriptionProvider,
} from "./providers/provider-resolver"
