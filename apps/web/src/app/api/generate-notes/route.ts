import { NextRequest, NextResponse } from "next/server"
import { runLLMRequest } from "@llm"
import type { ClinicalConsultationResult, DiarizedTurn, PrescriptionItem } from "@/lib/consultation-types"

export const runtime = "nodejs"

interface GenerateNotesPayload {
  patientName?: string
  patientPhone?: string
  transcript?: string
  detectedLanguage?: string
  diarizedSegments?: Array<{ speaker?: string; text?: string }>
}

const SYSTEM_PROMPT = `You are Vaidhya AI, an expert clinical documentation assistant for doctors in India.
You receive a consultation transcript that may be in English, Hindi, Hinglish, or any Indian language (in native script or transliterated).

Your tasks:
1. SPEAKER DIARIZATION:
   - Separate the conversation into clear turns labeled strictly as "Clinician" (the doctor asking questions, examining, diagnosing, prescribing medicines, giving advice) or "Patient" (the patient describing symptoms, duration, history, asking questions).
   - If pre-diarized speaker segments are provided, preserve and refine them cleanly.
   - Extract patient symptoms strictly from Patient statements, and extract diagnosis, prescriptions, and clinical advice strictly from Clinician statements.

2. STRUCTURED CLINICAL NOTES & COURSE:
   - Write clear, concise medical notes in English (retaining key native terms in parentheses only if clinically helpful).
   - Summarize the treatment course, what the patient SHOULD take/do ("what_to_take"), and what the patient MUST NOT take/do ("what_not_to_take" — e.g. avoid alcohol, avoid NSAIDs, avoid cold drinks, fasting rules, contraindications).
   - Extract each prescribed medicine with its exact time-of-day schedule (morning, afternoon, evening, night), meal timing, dosage, and duration.
   - Never fabricate medicines, dosages, or clinical facts not supported by the transcript. If a field is not mentioned, return an empty array or concise "Not specified".

Return ONLY a valid JSON object with this exact schema:
{
  "diarized_transcript": [
    { "speaker": "Clinician" | "Patient", "text": "..." }
  ],
  "chief_complaint": "string",
  "symptoms": ["string"],
  "clinical_findings": "string",
  "medical_notes": "string",
  "course_summary": "string",
  "prescriptions": [
    {
      "medicine": "string (name + strength, e.g. Atenolol 50mg)",
      "dosage": "string (e.g. 1 tablet / 5 ml)",
      "schedule": {
        "morning": true,
        "afternoon": false,
        "evening": false,
        "night": true
      },
      "mealTiming": "string (e.g. After food, Before breakfast, Empty stomach, As directed)",
      "duration": "string (e.g. 5 days, 30 days)",
      "notes": "string (special instructions)"
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
      const speaker: "Clinician" | "Patient" =
        rawSpeaker.includes("patient") ? "Patient" : "Clinician"
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
        dosage: typeof obj.dosage === "string" ? obj.dosage.trim() : "As directed",
        schedule: {
          morning: Boolean(rawSchedule.morning),
          afternoon: Boolean(rawSchedule.afternoon),
          evening: Boolean(rawSchedule.evening),
          night: Boolean(rawSchedule.night),
        },
        mealTiming: typeof obj.mealTiming === "string" ? obj.mealTiming.trim() : "As directed",
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
    const patientName = (body.patientName ?? "Patient").trim()

    if (!transcript) {
      return NextResponse.json(
        { ok: false, error: "Transcript is empty. Please record or upload audio with speech." },
        { status: 400 },
      )
    }

    const preDiarizedHint =
      Array.isArray(body.diarizedSegments) && body.diarizedSegments.length > 0
        ? `\n\nPre-diarized speaker tracks from ASR:\n${body.diarizedSegments
            .map((seg) => `${seg.speaker || "Speaker"}: ${seg.text || ""}`)
            .join("\n")}`
        : ""

    const userPrompt = [
      `Patient Name: ${patientName}`,
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
    console.error("[generate-notes] failed:", error instanceof Error ? error.message : "unknown error")
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to generate clinical notes.",
      },
      { status: 500 },
    )
  }
}
