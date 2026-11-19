import { NextRequest, NextResponse } from "next/server"
import { runLLMRequest } from "@/server/llm"
import type { ClinicalConsultationResult, DiarizedTurn, PrescriptionItem } from "@/features/consultation/types"

export const runtime = "nodejs"

interface GenerateNotesPayload {
  patientName?: string
  patientPhone?: string
  transcript?: string
  detectedLanguage?: string
  diarizedSegments?: Array<{ speaker?: string; text?: string }>
}

const SYSTEM_PROMPT = `You are Vaidhya AI, a clinical documentation drafting assistant for clinician review.
The transcript may contain English, Hindi, Hinglish, or other Indian languages, including code-switching.

Clinical evidence rules:
- Treat the supplied transcript as the source of encounter-specific facts. Do not add facts from medical knowledge.
- Never invent diagnoses, medicines, strengths, dosage, route, frequency, meal timing, duration, investigations, restrictions, follow-up dates, or red flags.
- Include medication instructions and advice only when explicitly supported by the consultation. Do not add generic advice or warnings.
- Preserve uncertainty, negation, corrections, historical statements, and contradictions.
- Leave unsupported fields empty. Do not use "As directed" or "Not specified" as a substitute for missing prescription details.
- Set a time-of-day schedule flag only when that specific time is explicitly stated.

Speaker attribution rules:
- If no pre-diarized speaker segments are supplied, return an empty diarized_transcript. Do not invent Doctor/Patient turns from raw transcript text.
- If diarized segments are supplied, preserve their order and text. A tag such as speaker_0 is not proof the person is the clinician or patient.
- Map a speaker to Clinician or Patient only when supplied segment metadata makes the role explicit; otherwise use Unknown.
- Separate patient-reported symptoms from clinician instructions only when their source is clear.

Return ONLY a valid JSON object with this exact schema:
{
  "diarized_transcript": [
    { "speaker": "Clinician" | "Patient" | "Unknown", "text": "..." }
  ],
  "chief_complaint": "string",
  "symptoms": ["string"],
  "clinical_findings": "string",
  "medical_notes": "string",
  "course_summary": "string",
  "prescriptions": [
    {
      "medicine": "string",
      "dosage": "string",
      "schedule": {
        "morning": false,
        "afternoon": false,
        "evening": false,
        "night": false
      },
      "mealTiming": "string",
      "duration": "string",
      "notes": "string"
    }
  ],
  "what_to_take": ["string"],
  "what_not_to_take": ["string"],
  "follow_up": "string",
  "red_flags": ["string"]
}`

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0)
}

function normalizeDiarizedTurns(value: unknown): DiarizedTurn[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null
      const obj = entry as { speaker?: unknown; text?: unknown }
      const text = typeof obj.text === "string" ? obj.text.trim() : ""
      if (!text) return null
      const rawSpeaker = String(obj.speaker ?? "").toLowerCase()
      const speaker: DiarizedTurn["speaker"] = rawSpeaker.includes("patient")
        ? "Patient"
        : /clinician|doctor|provider/.test(rawSpeaker)
          ? "Clinician"
          : "Unknown"
      return { speaker, text }
    })
    .filter((item): item is DiarizedTurn => item !== null)
}

function normalizePrescriptions(value: unknown): PrescriptionItem[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null
      const obj = entry as Record<string, unknown>
      const medicine = typeof obj.medicine === "string" ? obj.medicine.trim() : ""
      if (!medicine) return null
      const rawSchedule =
        obj.schedule && typeof obj.schedule === "object"
          ? (obj.schedule as Record<string, unknown>)
          : {}
      return {
        medicine,
        dosage: typeof obj.dosage === "string" ? obj.dosage.trim() : "",
        schedule: {
          morning: rawSchedule.morning === true,
          afternoon: rawSchedule.afternoon === true,
          evening: rawSchedule.evening === true,
          night: rawSchedule.night === true,
        },
        mealTiming: typeof obj.mealTiming === "string" ? obj.mealTiming.trim() : "",
        duration: typeof obj.duration === "string" ? obj.duration.trim() : "",
        notes: typeof obj.notes === "string" ? obj.notes.trim() : "",
      }
    })
    .filter((item): item is PrescriptionItem => item !== null)
}

function normalizeConsultationResult(
  raw: Record<string, unknown>,
  detectedLanguage?: string,
): ClinicalConsultationResult {
  return {
    diarized_transcript: normalizeDiarizedTurns(raw.diarized_transcript),
    chief_complaint: typeof raw.chief_complaint === "string" ? raw.chief_complaint.trim() : "",
    symptoms: toStringArray(raw.symptoms),
    clinical_findings: typeof raw.clinical_findings === "string" ? raw.clinical_findings.trim() : "",
    medical_notes: typeof raw.medical_notes === "string" ? raw.medical_notes.trim() : "",
    course_summary: typeof raw.course_summary === "string" ? raw.course_summary.trim() : "",
    prescriptions: normalizePrescriptions(raw.prescriptions),
    what_to_take: toStringArray(raw.what_to_take),
    what_not_to_take: toStringArray(raw.what_not_to_take),
    follow_up: typeof raw.follow_up === "string" ? raw.follow_up.trim() : "",
    red_flags: toStringArray(raw.red_flags),
    detected_language: detectedLanguage,
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as GenerateNotesPayload
    const transcript = (body.transcript ?? "").trim()

    if (!transcript) {
      return NextResponse.json(
        { ok: false, error: "Transcript is empty. Please record or upload audio with speech." },
        { status: 400 },
      )
    }

    const preDiarizedHint =
      Array.isArray(body.diarizedSegments) && body.diarizedSegments.length > 0
        ? `\n\nPre-diarized speaker tracks from ASR (labels are not necessarily clinical roles):\n${body.diarizedSegments
            .map((seg) => `${seg.speaker || "Unknown"}: ${seg.text || ""}`)
            .join("\n")}`
        : "\n\nNo verified speaker diarization was supplied. Return an empty diarized_transcript; do not infer speaker turns."

    if (transcript.length > 60000) {
      return NextResponse.json(
        { ok: false, error: "Transcript is too long to process in one request." },
        { status: 413 },
      )
    }

    const userPrompt = [
      body.detectedLanguage ? `Detected Audio Language: ${body.detectedLanguage}` : "",
      "",
      "Consultation Transcript:",
      transcript,
      preDiarizedHint,
    ]
      .filter(Boolean)
      .join("\n")

    const rawJsonText = await runLLMRequest({
      system: SYSTEM_PROMPT,
      prompt: userPrompt,
      responseFormat: "json_object",
      maxTokens: 4096,
    })

    const cleaned = rawJsonText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim()

    const parsed = JSON.parse(cleaned) as Record<string, unknown>
    const result = normalizeConsultationResult(parsed, body.detectedLanguage)

    return NextResponse.json({
      ok: true,
      consultation: result,
    })
  } catch (error) {
    console.error("[generate-notes] failed:", error instanceof Error ? error.name : "UnknownError")
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to generate clinical notes.",
      },
      { status: 500 },
    )
  }
}
