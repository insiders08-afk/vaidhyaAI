import type { ClinicalConsultationResult, PatientSession, PrescriptionItem } from "./consultation-types"

export function formatWhatsAppPhone(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, "")
  if (!digits) return ""
  // Default 10-digit Indian mobile numbers to +91
  if (digits.length === 10) {
    return `91${digits}`
  }
  return digits
}

function formatScheduleSlots(item: PrescriptionItem): string {
  const slots: string[] = []
  if (item.schedule.morning) slots.push("Morning")
  if (item.schedule.afternoon) slots.push("Afternoon")
  if (item.schedule.evening) slots.push("Evening")
  if (item.schedule.night) slots.push("Night")
  return slots.length > 0 ? slots.join(" • ") : "As directed"
}

export function buildWhatsAppSummaryText(
  patient: PatientSession,
  consultation: ClinicalConsultationResult,
): string {
  const dateStr = new Date(patient.createdAt || Date.now()).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })

  const lines: string[] = [
    `*Vaidhya AI — Consultation Summary*`,
    `Patient: *${patient.patientName}*`,
    `Date: ${dateStr}`,
    "",
  ]

  if (consultation.chief_complaint) {
    lines.push(`*Chief Complaint:* ${consultation.chief_complaint}`)
  }

  if (consultation.clinical_findings) {
    lines.push(`*Assessment / Findings:* ${consultation.clinical_findings}`)
  }

  if (consultation.medical_notes) {
    lines.push("", `*Medical Notes & Course:*`, consultation.medical_notes)
  }

  if (consultation.prescriptions.length > 0) {
    lines.push("", `*Prescription (By Time of Day):*`)
    consultation.prescriptions.forEach((rx, idx) => {
      const timing = formatScheduleSlots(rx)
      const details = [rx.dosage, timing, rx.mealTiming, rx.duration ? `for ${rx.duration}` : ""]
        .filter(Boolean)
        .join(" | ")
      lines.push(`${idx + 1}. *${rx.medicine}* — ${details}`)
      if (rx.notes) {
        lines.push(`   _${rx.notes}_`)
      }
    })
  }

  if (consultation.what_to_take.length > 0) {
    lines.push("", `*What To Take / Do:*`)
    consultation.what_to_take.forEach((item) => lines.push(`✅ ${item}`))
  }

  if (consultation.what_not_to_take.length > 0) {
    lines.push("", `*What NOT To Take / Avoid:*`)
    consultation.what_not_to_take.forEach((item) => lines.push(`⛔ ${item}`))
  }

  if (consultation.follow_up) {
    lines.push("", `*Follow-Up:* ${consultation.follow_up}`)
  }

  if (consultation.red_flags.length > 0) {
    lines.push("", `*Seek Urgent Care If:*`)
    consultation.red_flags.forEach((item) => lines.push(`⚠️ ${item}`))
  }

  lines.push("", `_Consultation audio recording is available from Vaidhya AI._`)
  return lines.join("\n")
}

export function buildWhatsAppIntentUrl(
  patient: PatientSession,
  consultation: ClinicalConsultationResult,
): string {
  const phone = formatWhatsAppPhone(patient.patientPhone)
  const text = buildWhatsAppSummaryText(patient, consultation)
  const encoded = encodeURIComponent(text)
  return phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`
}
