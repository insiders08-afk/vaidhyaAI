"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardCopy,
  Clock,
  Download,
  FileText,
  MessageCircle,
  Moon,
  Pill,
  PlusCircle,
  Share2,
  Sun,
  Sunrise,
  Sunset,
  Trash2,
  Volume2,
} from "lucide-react"
import { VaidhyaHeader } from "@/components/vaidhya-header"
import {
  clearConsultationAudioBlob,
  loadActiveConsultation,
  loadConsultationAudioBlob,
  saveActiveConsultation,
} from "@/lib/consultation-store"
import type { PrescriptionItem, StoredConsultation } from "@/lib/consultation-types"
import { buildWhatsAppIntentUrl, buildWhatsAppSummaryText } from "@/lib/whatsapp-intent"

type ActiveTab = "notes" | "prescription" | "audio"

function TimeSlotBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
        active ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-400"
      }`}
    >
      {label}
    </span>
  )
}

export default function ResultsPage() {
  const router = useRouter()
  const [consultation, setConsultation] = useState<StoredConsultation | null>(null)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<ActiveTab>("prescription")
  const [copied, setCopied] = useState(false)
  const [showTranscript, setShowTranscript] = useState(false)

  useEffect(() => {
    let objectUrl: string | null = null
    let mounted = true

    Promise.all([loadActiveConsultation(), loadConsultationAudioBlob()])
      .then(([savedConsultation, savedAudio]) => {
        if (!mounted) return
        if (!savedConsultation) {
          router.replace("/")
          return
        }
        setConsultation(savedConsultation)
        if (savedAudio) {
          setAudioBlob(savedAudio)
          objectUrl = URL.createObjectURL(savedAudio)
          setAudioUrl(objectUrl)
        }
      })
      .catch(() => router.replace("/"))

    return () => {
      mounted = false
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [router])

  if (!consultation) {
    return null
  }

  const { patient, result } = consultation

  function handleSendWhatsApp() {
    const url = buildWhatsAppIntentUrl(patient, result)
    window.open(url, "_blank", "noopener,noreferrer")
  }

  async function handleCopySummary() {
    const text = buildWhatsAppSummaryText(patient, result)
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleShareAudio() {
    if (!audioBlob) return
    const file = new File([audioBlob], consultation?.audioFilename || "consultation.wav", {
      type: audioBlob.type || "audio/wav",
    })
    if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          title: `Consultation Audio — ${patient.patientName}`,
          text: `Audio recording for ${patient.patientName}`,
          files: [file],
        })
        return
      } catch {
        // Fall through to download if share sheet is canceled/unsupported
      }
    }
    handleDownloadAudio()
  }

  function handleDownloadAudio() {
    if (!audioUrl) return
    const anchor = document.createElement("a")
    anchor.href = audioUrl
    anchor.download = consultation?.audioFilename || "consultation.wav"
    anchor.click()
  }

  async function handleRemoveMedicine(index: number) {
    if (!consultation) return
    const updated: StoredConsultation = {
      ...consultation,
      result: {
        ...consultation.result,
        prescriptions: consultation.result.prescriptions.filter((_, i) => i !== index),
      },
    }
    setConsultation(updated)
    await saveActiveConsultation(updated)
  }

  async function handleToggleSlot(index: number, slot: keyof PrescriptionItem["schedule"]) {
    if (!consultation) return
    const updatedList = consultation.result.prescriptions.map((item, idx) =>
      idx === index ? { ...item, schedule: { ...item.schedule, [slot]: !item.schedule[slot] } } : item,
    )
    const updated: StoredConsultation = {
      ...consultation,
      result: { ...consultation.result, prescriptions: updatedList },
    }
    setConsultation(updated)
    await saveActiveConsultation(updated)
  }

  const timeGroups = [
    { key: "morning" as const, title: "Morning", icon: Sunrise, items: result.prescriptions.filter((p) => p.schedule.morning) },
    { key: "afternoon" as const, title: "Afternoon", icon: Sun, items: result.prescriptions.filter((p) => p.schedule.afternoon) },
    { key: "evening" as const, title: "Evening", icon: Sunset, items: result.prescriptions.filter((p) => p.schedule.evening) },
    { key: "night" as const, title: "Night", icon: Moon, items: result.prescriptions.filter((p) => p.schedule.night) },
  ]

  return (
    <div className="min-h-dvh bg-slate-50 pb-28">
      <VaidhyaHeader activeStep={3} />

      <main className="mx-auto max-w-3xl px-4 py-6">
        {/* Patient Summary Banner */}
        <section className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900">{patient.patientName}</h1>
              {result.detected_language ? (
                <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-800">
                  {result.detected_language}
                </span>
              ) : null}
            </div>
            <p className="text-sm text-slate-500">WhatsApp: {patient.patientPhone}</p>
          </div>
          <Link
            href="/"
            onClick={() => void clearConsultationAudioBlob()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <PlusCircle className="size-4 text-teal-700" />
            <span>New Patient</span>
          </Link>
        </section>

        {/* 3 Deliverable Tabs */}
        <div className="mb-5 grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xs">
          <button
            type="button"
            onClick={() => setActiveTab("prescription")}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold transition sm:text-sm ${
              activeTab === "prescription" ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Pill className="size-4" />
            <span>Prescriptions ({result.prescriptions.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("notes")}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold transition sm:text-sm ${
              activeTab === "notes" ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <FileText className="size-4" />
            <span>Medical Notes</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("audio")}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold transition sm:text-sm ${
              activeTab === "audio" ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Volume2 className="size-4" />
            <span>Audio</span>
          </button>
        </div>

        {/* TAB 1: PRESCRIPTIONS BY TIME OF DAY */}
        {activeTab === "prescription" ? (
          <div className="space-y-5">
            {/* Time-of-Day Schedule Overview */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="mb-4 flex items-center gap-2">
                <Clock className="size-5 text-teal-700" />
                <h2 className="text-base font-bold text-slate-900">Daily Medication Schedule</h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {timeGroups.map((group) => {
                  const Icon = group.icon
                  return (
                    <div key={group.key} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
                        <Icon className="size-4 text-teal-700" />
                        <span>{group.title}</span>
                      </div>
                      {group.items.length > 0 ? (
                        <ul className="space-y-1.5 text-xs text-slate-700">
                          {group.items.map((item, idx) => (
                            <li key={idx} className="flex items-start justify-between gap-2">
                              <span className="font-medium text-slate-900">{item.medicine}</span>
                              <span className="shrink-0 text-slate-500">
                                {item.dosage} • {item.mealTiming}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-slate-400">No medicines scheduled</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>

            {/* Individual Medicine Cards (tap time pills to adjust) */}
            <section className="space-y-3">
              <h2 className="px-1 text-sm font-semibold text-slate-700">Prescription Course Details (Tap slots to adjust)</h2>
              {result.prescriptions.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
                  No medications were detected in this consultation.
                </div>
              ) : (
                result.prescriptions.map((rx, index) => (
                  <div key={index} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-bold text-slate-900">{rx.medicine}</h3>
                        <p className="mt-0.5 text-sm text-slate-600">
                          {rx.dosage} {rx.mealTiming ? `• ${rx.mealTiming}` : ""}{" "}
                          {rx.duration ? `• ${rx.duration}` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleRemoveMedicine(index)}
                        aria-label={`Remove ${rx.medicine}`}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {(["morning", "afternoon", "evening", "night"] as const).map((slot) => (
                        <button key={slot} type="button" onClick={() => void handleToggleSlot(index, slot)}>
                          <TimeSlotBadge
                            active={rx.schedule[slot]}
                            label={slot.charAt(0).toUpperCase() + slot.slice(1)}
                          />
                        </button>
                      ))}
                    </div>

                    {rx.notes ? <p className="mt-2.5 text-xs text-slate-500">Note: {rx.notes}</p> : null}
                  </div>
                ))
              )}
            </section>
          </div>
        ) : null}

        {/* TAB 2: MEDICAL NOTES + DIARIZED TRANSCRIPT */}
        {activeTab === "notes" ? (
          <div className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
              {result.chief_complaint ? (
                <div>
                  <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Chief Complaint</h2>
                  <p className="mt-1 text-sm font-medium text-slate-900">{result.chief_complaint}</p>
                </div>
              ) : null}

              {result.symptoms.length > 0 ? (
                <div>
                  <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                    Symptoms (From Patient)
                  </h2>
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {result.symptoms.map((sym, idx) => (
                      <li key={idx} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-800">
                        {sym}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {result.clinical_findings ? (
                <div>
                  <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                    Clinical Findings &amp; Assessment
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-slate-800">{result.clinical_findings}</p>
                </div>
              ) : null}

              <div>
                <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Medical Notes &amp; Course
                </h2>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-800">
                  {result.medical_notes || result.course_summary}
                </p>
              </div>
            </section>

            <div className="grid gap-4 sm:grid-cols-2">
              <section className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-bold text-emerald-900">
                  <CheckCircle2 className="size-4 text-emerald-700" />
                  <span>What To Take / Do</span>
                </div>
                {result.what_to_take.length > 0 ? (
                  <ul className="space-y-1.5 text-sm text-emerald-950">
                    {result.what_to_take.map((item, idx) => (
                      <li key={idx}>• {item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-emerald-800/70">No specific diet or lifestyle additions noted.</p>
                )}
              </section>

              <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-bold text-amber-950">
                  <AlertTriangle className="size-4 text-amber-700" />
                  <span>What NOT To Take / Avoid</span>
                </div>
                {result.what_not_to_take.length > 0 ? (
                  <ul className="space-y-1.5 text-sm text-amber-950">
                    {result.what_not_to_take.map((item, idx) => (
                      <li key={idx}>• {item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-amber-800/70">No specific restrictions noted.</p>
                )}
              </section>
            </div>

            {result.follow_up || result.red_flags.length > 0 ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-2">
                {result.follow_up ? (
                  <p className="text-sm text-slate-800">
                    <strong className="font-semibold text-slate-900">Follow-up:</strong> {result.follow_up}
                  </p>
                ) : null}
                {result.red_flags.length > 0 ? (
                  <div>
                    <p className="text-xs font-semibold text-red-700 uppercase">Urgent Warning Signs</p>
                    <ul className="mt-1 space-y-1 text-sm text-red-800">
                      {result.red_flags.map((flag, idx) => (
                        <li key={idx}>• {flag}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>
            ) : null}

            {/* Speaker-Diarized Transcript */}
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <button
                type="button"
                onClick={() => setShowTranscript((prev) => !prev)}
                className="flex w-full items-center justify-between text-left text-sm font-semibold text-slate-900"
              >
                <span>Speaker-Separated Conversation (Clinician vs Patient)</span>
                <span className="text-xs font-medium text-teal-700">{showTranscript ? "Hide" : "Show"}</span>
              </button>

              {showTranscript ? (
                <div className="mt-4 space-y-2.5 border-t border-slate-100 pt-4">
                  {result.diarized_transcript.length > 0 ? (
                    result.diarized_transcript.map((turn, idx) => (
                      <div
                        key={idx}
                        className={`rounded-xl p-3 text-sm ${
                          turn.speaker === "Clinician"
                            ? "bg-teal-50/70 text-slate-900"
                            : "bg-slate-100 text-slate-800"
                        }`}
                      >
                        <span className="mb-0.5 block text-[11px] font-bold tracking-wide text-teal-800 uppercase">
                          {turn.speaker}
                        </span>
                        {turn.text}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-600">{consultation.rawTranscript}</p>
                  )}
                </div>
              ) : null}
            </section>
          </div>
        ) : null}

        {/* TAB 3: CONSULTATION AUDIO */}
        {activeTab === "audio" ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <h2 className="text-base font-bold text-slate-900">Full Consultation Recording</h2>
            <p className="mt-1 text-sm text-slate-600">
              Play, download, or share the complete consultation audio directly to the patient.
            </p>

            {audioUrl ? (
              <div className="mt-5 space-y-4">
                <audio controls src={audioUrl} className="w-full" />
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void handleShareAudio()}
                    className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
                  >
                    <Share2 className="size-4" />
                    <span>Share Audio File</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadAudio}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Download className="size-4" />
                    <span>Download ({consultation.audioFilename})</span>
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">Audio recording is not available in this session.</p>
            )}
          </section>
        ) : null}
      </main>

      {/* Sticky Bottom WhatsApp Intent Bar */}
      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2.5">
          <button
            type="button"
            onClick={handleSendWhatsApp}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.99] sm:text-base"
          >
            <MessageCircle className="size-5" />
            <span>Send Notes &amp; Rx via WhatsApp</span>
          </button>

          {audioBlob ? (
            <button
              type="button"
              onClick={() => void handleShareAudio()}
              title="Share consultation audio file"
              className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-3.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              <Share2 className="size-4 text-teal-700" />
              <span className="hidden sm:inline">Audio</span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => void handleCopySummary()}
            title="Copy summary text"
            className="flex items-center justify-center rounded-xl border border-slate-300 bg-white p-3.5 text-slate-700 hover:bg-slate-50"
          >
            {copied ? <Check className="size-4 text-emerald-600" /> : <ClipboardCopy className="size-4" />}
          </button>
        </div>
      </footer>
    </div>
  )
}
