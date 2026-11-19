import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { toPipelineError } from "@/server/errors"
import { resolveTranscriptionProvider, transcribeWithResolvedProvider } from "@/server/transcription"

export const runtime = "nodejs"

const GNANI_FORMATS = new Set(["verbatim", "transcribe", "codemix", "transliterate"])

function readText(formData: FormData, key: string): string | undefined {
  const value = formData.get(key)
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function parseStringList(raw: string | undefined, maxItems: number): string[] | undefined {
  if (!raw?.trim()) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = raw.split(/[,\n]/)
  }
  const values = Array.isArray(parsed) ? parsed : typeof parsed === "string" ? parsed.split(/[,\n]/) : []
  const items = (values as unknown[])
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.replace(/[\r\n\0]/g, " ").trim())
    .filter(Boolean)
    .slice(0, maxItems)
  return items.length > 0 ? items : undefined
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const audioFile = formData.get("audio_file")
    const seqNoRaw = readText(formData, "seq_no")
    const seqNo = seqNoRaw === undefined ? 0 : Number(seqNoRaw)

    if (!Number.isSafeInteger(seqNo) || seqNo < 0) {
      return NextResponse.json(
        { ok: false, error: { code: "validation_error", message: "seq_no must be a non-negative integer.", recoverable: false } },
        { status: 400 },
      )
    }
    if (!(audioFile instanceof Blob)) {
      return NextResponse.json(
        { ok: false, error: { code: "validation_error", message: "Missing audio_file in multipart upload.", recoverable: false } },
        { status: 400 },
      )
    }
    if (audioFile.size === 0) {
      return NextResponse.json({ ok: true, seqNo, transcript: "", provider: "gnani" })
    }

    const requestedFormat = readText(formData, "format") || process.env.GNANI_STT_FORMAT || "transcribe"
    if (!GNANI_FORMATS.has(requestedFormat)) {
      return NextResponse.json(
        { ok: false, error: { code: "validation_error", message: "Unsupported Gnani Prisma v3 output format.", recoverable: false } },
        { status: 400 },
      )
    }

    const resolved = resolveTranscriptionProvider()
    const filename = audioFile instanceof File && audioFile.name ? audioFile.name : `chunk-${seqNo}.wav`
    const requestId = readText(formData, "request_id") || randomUUID()
    const output = await transcribeWithResolvedProvider(
      Buffer.from(await audioFile.arrayBuffer()),
      filename,
      resolved,
      {
        languageCode: readText(formData, "language_code"),
        previousText: readText(formData, "previous_text"),
        format: requestedFormat as "verbatim" | "transcribe" | "codemix" | "transliterate",
        topic: readText(formData, "topic") || process.env.GNANI_STT_TOPIC,
        keyterms: parseStringList(readText(formData, "keyterms") || process.env.GNANI_STT_KEYTERMS, 200),
        speakerNames: parseStringList(readText(formData, "speaker_names") || process.env.GNANI_STT_SPEAKER_NAMES, 4),
        requestId,
        mimeType: audioFile.type || undefined,
      },
    )

    return NextResponse.json({
      ok: true,
      seqNo,
      transcript: output.transcript,
      provider: output.provider,
      model: output.model,
      requestId: output.requestId || requestId,
      processingTime: output.processingTime,
      detectedLanguageCode: output.detectedLanguageCode,
      truncated: output.truncated,
      diarizedSegments: output.diarizedSegments,
    })
  } catch (error) {
    const pipelineError = toPipelineError(error, {
      code: "transcription_error",
      message: "Transcription request failed",
      recoverable: true,
    })
    const status =
      pipelineError.code === "configuration_error" ? 500 : pipelineError.code === "validation_error" ? 400 : 502

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: pipelineError.code,
          message: pipelineError.message,
          recoverable: pipelineError.recoverable,
        },
      },
      { status },
    )
  }
}
