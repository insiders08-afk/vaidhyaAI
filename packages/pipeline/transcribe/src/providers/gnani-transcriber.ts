import { PipelineStageError } from "../../../shared/src/error"

export const DEFAULT_GNANI_API_URL = "https://api.vachana.ai/stt/v3"
export const DEFAULT_GNANI_MODEL = "prisma-v3.0"
export const DEFAULT_GNANI_LANGUAGE = "indic-auto"

export const GNANI_SUPPORTED_LANGUAGES = [
  "indic-auto",
  "en-IN",
  "hi-IN",
  "bn-IN",
  "gu-IN",
  "kn-IN",
  "ml-IN",
  "mr-IN",
  "pa-IN",
  "ta-IN",
  "te-IN",
] as const

export interface GnaniTranscribeOptions {
  apiKey?: string
  apiUrl?: string
  model?: string
  languageCode?: string
  format?: "verbatim" | "transcribe" | "codemix" | "transliterate"
  topic?: string
  previousText?: string
  speakerNames?: string[]
  keyterms?: string[]
  requestId?: string
  mimeType?: string
  fetchFn?: typeof fetch
}

export interface GnaniTranscribeResult {
  transcript: string
  detectedLanguageCode?: string
  model: string
  requestId?: string
  truncated?: boolean
  processingTime?: number
}

interface GnaniSuccessBody {
  success?: boolean
  request_id?: string
  transcript?: string
  model?: string
  detected_language_code?: string
  truncated?: boolean
  processing_time?: number
}

interface GnaniErrorBody {
  success?: boolean
  error?: { type?: string; message?: string }
  detail?: { error_code?: string; message?: string; status_code?: number } | Array<{ msg?: string }>
  code?: string
  message?: string
}

function validateHttpsUrl(rawUrl: string, serviceName: string): void {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new PipelineStageError("configuration_error", `Invalid ${serviceName} URL: ${rawUrl}`, false)
  }
  const isLoopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1"
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLoopback)) {
    throw new PipelineStageError(
      "configuration_error",
      `SECURITY ERROR: ${serviceName} endpoint must use HTTPS. Received: ${parsed.protocol}//${parsed.host}`,
      false,
    )
  }
}

function sanitizeContextText(raw: string, maxLength: number): string {
  return raw.replace(/<\||\|>/g, " ").trim().slice(-maxLength)
}

function extractGnaniErrorMessage(body: GnaniErrorBody | null, status: number): {
  code: string
  message: string
  recoverable: boolean
} {
  if (body?.detail && !Array.isArray(body.detail)) {
    const errorCode = body.detail.error_code || `HTTP_${status}`
    const recoverable = status === 429 || status >= 500
    return {
      code: errorCode,
      message: body.detail.message || `Gnani STT error (${errorCode})`,
      recoverable,
    }
  }

  if (body?.error) {
    const type = body.error.type || `HTTP_${status}`
    const recoverable = status >= 500
    return {
      code: type,
      message: body.error.message || `Gnani STT failed (${type})`,
      recoverable,
    }
  }

  if (body?.code === "UPSTREAM_TIMEOUT") {
    return {
      code: "UPSTREAM_TIMEOUT",
      message: body.message || "Gnani STT timed out",
      recoverable: true,
    }
  }

  if (Array.isArray(body?.detail) && body.detail.length > 0) {
    return {
      code: "VALIDATION_ERROR",
      message: body.detail.map((item) => item.msg || "Invalid field").join("; "),
      recoverable: false,
    }
  }

  return {
    code: `HTTP_${status}`,
    message: body?.message || `Gnani STT request failed with status ${status}`,
    recoverable: status === 429 || status >= 500,
  }
}

export async function transcribeWithGnani(
  buffer: Buffer,
  filename: string,
  options: GnaniTranscribeOptions = {},
): Promise<GnaniTranscribeResult> {
  const apiUrl = options.apiUrl || process.env.GNANI_API_URL || DEFAULT_GNANI_API_URL
  const apiKey = (options.apiKey || process.env.GNANI_API_KEY || "").trim()
  const model = (options.model || process.env.GNANI_STT_MODEL || DEFAULT_GNANI_MODEL).trim()
  const languageCode = (options.languageCode || process.env.GNANI_LANGUAGE_CODE || DEFAULT_GNANI_LANGUAGE).trim()
  const format = options.format || "transcribe"
  const fetchImpl = options.fetchFn || fetch

  validateHttpsUrl(apiUrl, "Gnani Vachana STT API")

  if (!apiKey) {
    throw new PipelineStageError(
      "configuration_error",
      "Missing GNANI_API_KEY. Set GNANI_API_KEY in your environment variables.",
      false,
    )
  }

  if (buffer.byteLength === 0) {
    return { transcript: "", model }
  }

  const formData = new FormData()
  const mimeType = options.mimeType || (filename.toLowerCase().endsWith(".mp3") ? "audio/mpeg" : "audio/wav")
  const blob = new Blob([new Uint8Array(buffer)], { type: mimeType })
  formData.append("audio_file", blob, filename)
  if (model) {
    formData.append("model", model)
  }
  formData.append("language_code", languageCode || DEFAULT_GNANI_LANGUAGE)
  formData.append("format", format)

  if (model === "prisma-v3.0") {
    const topic = options.topic ?? "Outpatient medical consultation between a doctor and a patient"
    if (topic.trim()) {
      formData.append("topic", sanitizeContextText(topic, 1600))
    }

    const speakerNames = options.speakerNames ?? ["Doctor", "Patient"]
    if (speakerNames.length > 0) {
      formData.append("speaker_names", JSON.stringify(speakerNames.slice(0, 4)))
    }

    if (options.previousText && options.previousText.trim().length > 0) {
      formData.append("previous_text", sanitizeContextText(options.previousText, 600))
    }

    if (options.keyterms && options.keyterms.length > 0) {
      formData.append("keyterms", JSON.stringify(options.keyterms.slice(0, 200)))
    }
  }

  const headers: Record<string, string> = {
    "X-API-Key-ID": apiKey,
  }
  if (options.requestId) {
    headers["X-API-Request-ID"] = options.requestId
  }

  const response = await fetchImpl(apiUrl, {
    method: "POST",
    headers,
    body: formData,
  })

  if (!response.ok) {
    let parsedError: GnaniErrorBody | null = null
    try {
      parsedError = (await response.json()) as GnaniErrorBody
    } catch {
      parsedError = null
    }
    const detail = extractGnaniErrorMessage(parsedError, response.status)
    throw new PipelineStageError(detail.recoverable ? "api_error" : "validation_error", detail.message, detail.recoverable, {
      status: response.status,
      provider: "gnani",
      gnaniCode: detail.code,
    })
  }

  const payload = (await response.json()) as GnaniSuccessBody
  return {
    transcript: (payload.transcript ?? "").trim(),
    detectedLanguageCode: payload.detected_language_code,
    model: payload.model || model,
    requestId: payload.request_id,
    truncated: payload.truncated,
    processingTime: payload.processing_time,
  }
}
