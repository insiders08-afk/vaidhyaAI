import { NextRequest, NextResponse } from "next/server"
import { toPipelineError } from "@pipeline-errors"
import { resolveTranscriptionProvider, transcribeWithResolvedProvider } from "@transcription"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const audioFile = formData.get("audio_file")
    const languageCode = formData.get("language_code")
    const previousText = formData.get("previous_text")
    const seqNoRaw = formData.get("seq_no")

    if (!(audioFile instanceof Blob)) {
      return NextResponse.json(
        { ok: false, error: { code: "validation_error", message: "Missing audio_file in multipart upload." } },
        { status: 400 },
      )
    }

    const arrayBuffer = await audioFile.arrayBuffer()
    if (arrayBuffer.byteLength === 0) {
      return NextResponse.json({
        ok: true,
        seqNo: Number(seqNoRaw ?? 0),
        transcript: "",
        provider: "gnani",
      })
    }

    const resolved = resolveTranscriptionProvider()
    const filename =
      audioFile instanceof File && audioFile.name ? audioFile.name : `chunk-${String(seqNoRaw ?? 0)}.wav`

    const output = await transcribeWithResolvedProvider(Buffer.from(arrayBuffer), filename, resolved, {
      languageCode: typeof languageCode === "string" && languageCode.trim() ? languageCode.trim() : undefined,
      previousText: typeof previousText === "string" && previousText.trim() ? previousText.trim() : undefined,
      mimeType: audioFile.type || undefined,
    })

    return NextResponse.json({
      ok: true,
      seqNo: Number(seqNoRaw ?? 0),
      transcript: output.transcript,
      provider: output.provider,
      model: output.model,
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
