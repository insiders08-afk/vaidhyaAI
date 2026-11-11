import { PipelineStageError } from "../../../shared/src/error"

export interface DiarizedUtterance {
  speaker: "Clinician" | "Patient" | string
  text: string
  startMs?: number
  endMs?: number
}

export interface NvidiaParakeetOptions {
  apiUrl?: string
  apiKey?: string
  model?: string
  languageCode?: string
  fetchFn?: typeof fetch
}

export interface NvidiaParakeetResult {
  transcript: string
  model: string
  diarizedSegments: DiarizedUtterance[]
}

interface NvidiaDiarizedResponse {
  text?: string
  transcript?: string
  segments?: Array<{
    speaker?: string | number
    text?: string
    start?: number
    end?: number
  }>
}

/**
 * Optional future upgrade adapter modeled after NVIDIA AI Blueprints
 * (Parakeet-TDT ASR + NeMo/Sortformer speaker diarization).
 *
 * Enable via `TRANSCRIPTION_PROVIDER=nvidia_parakeet`, `NVIDIA_ASR_API_URL`,
 * and `NVIDIA_API_KEY`.
 */
export async function transcribeWithNvidiaParakeet(
  buffer: Buffer,
  filename: string,
  options: NvidiaParakeetOptions = {},
): Promise<NvidiaParakeetResult> {
  const apiUrl = (options.apiUrl || process.env.NVIDIA_ASR_API_URL || "").trim()
  const apiKey = (options.apiKey || process.env.NVIDIA_API_KEY || "").trim()
  const model = (options.model || process.env.NVIDIA_ASR_MODEL || "nvidia/parakeet-tdt-0.6b-v2").trim()
  const fetchImpl = options.fetchFn || fetch

  if (!apiUrl) {
    throw new PipelineStageError(
      "configuration_error",
      "Missing NVIDIA_ASR_API_URL for nvidia_parakeet transcription provider.",
      false,
    )
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(apiUrl)
  } catch {
    throw new PipelineStageError("configuration_error", `Invalid NVIDIA_ASR_API_URL: ${apiUrl}`, false)
  }
  const isLoopback = parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1"
  if (parsedUrl.protocol !== "https:" && !(parsedUrl.protocol === "http:" && isLoopback)) {
    throw new PipelineStageError(
      "configuration_error",
      "SECURITY ERROR: NVIDIA_ASR_API_URL must use HTTPS.",
      false,
    )
  }

  if (!apiKey) {
    throw new PipelineStageError(
      "configuration_error",
      "Missing NVIDIA_API_KEY for nvidia_parakeet transcription provider.",
      false,
    )
  }

  const formData = new FormData()
  const mimeType = filename.toLowerCase().endsWith(".mp3") ? "audio/mpeg" : "audio/wav"
  formData.append("file", new Blob([new Uint8Array(buffer)], { type: mimeType }), filename)
  formData.append("model", model)
  formData.append("diarize", "true")
  if (options.languageCode && options.languageCode !== "indic-auto") {
    formData.append("language", options.languageCode)
  }

  const response = await fetchImpl(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new PipelineStageError(
      response.status >= 500 || response.status === 429 ? "api_error" : "validation_error",
      `NVIDIA Parakeet transcription failed: ${response.status} ${errorText}`,
      response.status >= 500 || response.status === 429,
    )
  }

  const payload = (await response.json()) as NvidiaDiarizedResponse
  const diarizedSegments: DiarizedUtterance[] = (payload.segments ?? [])
    .filter((segment) => typeof segment.text === "string" && segment.text.trim().length > 0)
    .map((segment) => {
      const rawSpeaker = String(segment.speaker ?? "0").toLowerCase()
      const speaker =
        rawSpeaker === "0" || rawSpeaker.includes("0") || rawSpeaker.includes("doctor") || rawSpeaker.includes("clinician")
          ? "Clinician"
          : "Patient"
      return {
        speaker,
        text: segment.text!.trim(),
        ...(typeof segment.start === "number" ? { startMs: Math.round(segment.start * 1000) } : {}),
        ...(typeof segment.end === "number" ? { endMs: Math.round(segment.end * 1000) } : {}),
      }
    })

  const transcript =
    (payload.transcript || payload.text || "").trim() ||
    diarizedSegments.map((seg) => `${seg.speaker}: ${seg.text}`).join("\n")

  return {
    transcript,
    model,
    diarizedSegments,
  }
}
