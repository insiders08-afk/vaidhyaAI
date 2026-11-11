export interface PatientSession {
  id: string
  patientName: string
  patientPhone: string
  languageCode: string
  entryMode: "mic" | "upload"
  createdAt: string
}

export interface DiarizedTurn {
  speaker: "Clinician" | "Patient"
  text: string
}

export interface DoseSchedule {
  morning: boolean
  afternoon: boolean
  evening: boolean
  night: boolean
}

export interface PrescriptionItem {
  medicine: string
  dosage: string
  schedule: DoseSchedule
  mealTiming: string
  duration: string
  notes: string
}

export interface ClinicalConsultationResult {
  diarized_transcript: DiarizedTurn[]
  chief_complaint: string
  symptoms: string[]
  clinical_findings: string
  medical_notes: string
  prescriptions: PrescriptionItem[]
  what_to_take: string[]
  what_not_to_take: string[]
  course_summary: string
  follow_up: string
  red_flags: string[]
  detected_language?: string
}

export interface StoredConsultation {
  patient: PatientSession
  rawTranscript: string
  result: ClinicalConsultationResult
  audioFilename: string
  audioMimeType: string
  durationSeconds: number
  completedAt: string
}
