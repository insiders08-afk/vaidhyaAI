"use client"

import type React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Mic, Phone, Upload, User } from "lucide-react"
import { VaidhyaHeader } from "@/components/vaidhya-header"
import { saveActivePatient } from "@/lib/consultation-store"
import type { PatientSession } from "@/lib/consultation-types"

const LANGUAGE_OPTIONS = [
  { value: "indic-auto", label: "Auto-Detect (Hindi, English & 9 Indian Languages)" },
  { value: "hi-IN,en-IN", label: "Hindi + English (Hinglish)" },
  { value: "en-IN", label: "English (India)" },
  { value: "hi-IN", label: "Hindi (हिन्दी)" },
  { value: "ta-IN,en-IN", label: "Tamil + English" },
  { value: "te-IN,en-IN", label: "Telugu + English" },
  { value: "kn-IN,en-IN", label: "Kannada + English" },
  { value: "ml-IN,en-IN", label: "Malayalam + English" },
  { value: "mr-IN,en-IN", label: "Marathi + English" },
  { value: "bn-IN,en-IN", label: "Bengali + English" },
  { value: "gu-IN,en-IN", label: "Gujarati + English" },
  { value: "pa-IN,en-IN", label: "Punjabi + English" },
]

export default function PatientEntryPage() {
  const router = useRouter()
  const [patientName, setPatientName] = useState("")
  const [patientPhone, setPatientPhone] = useState("")
  const [languageCode, setLanguageCode] = useState("indic-auto")
  const [error, setError] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)

  async function beginConsultation(mode: "mic" | "upload") {
    const trimmedName = patientName.trim()
    const trimmedPhone = patientPhone.trim()
    const phoneDigits = trimmedPhone.replace(/\D/g, "")

    if (!trimmedName) {
      setError("Please enter the patient's name.")
      return
    }
    if (phoneDigits.length < 10) {
      setError("Please enter a valid 10-digit WhatsApp phone number.")
      return
    }

    setError(null)
    setIsStarting(true)

    try {
      const session: PatientSession = {
        id: crypto.randomUUID(),
        patientName: trimmedName,
        patientPhone: trimmedPhone,
        languageCode,
        entryMode: mode,
        createdAt: new Date().toISOString(),
      }
      await saveActivePatient(session)
      if (mode === "mic") {
        router.push("/record?autostart=1")
      } else {
        router.push("/record?mode=upload")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start consultation.")
      setIsStarting(false)
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void beginConsultation("mic")
  }

  return (
    <div className="min-h-dvh bg-slate-50">
      <VaidhyaHeader activeStep={1} />

      <main className="mx-auto flex max-w-xl flex-col px-4 py-8 sm:py-12">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
          <div className="mb-6">
            <span className="inline-flex items-center rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
              New Consultation
            </span>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">Patient Details</h1>
            <p className="mt-1 text-sm text-slate-600">
              Enter the patient&apos;s name and WhatsApp number to start recording immediately.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="patient-name" className="mb-1.5 block text-sm font-medium text-slate-800">
                Patient Name
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="patient-name"
                  type="text"
                  autoComplete="name"
                  placeholder="e.g. Rajesh Kumar"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white py-3 pr-4 pl-10 text-base text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label htmlFor="patient-phone" className="mb-1.5 block text-sm font-medium text-slate-800">
                WhatsApp Number
              </label>
              <div className="relative">
                <Phone className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="patient-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="e.g. 9876543210 or +91 9876543210"
                  value={patientPhone}
                  onChange={(e) => setPatientPhone(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white py-3 pr-4 pl-10 text-base text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 focus:outline-none"
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">10-digit numbers automatically default to +91 for WhatsApp.</p>
            </div>

            <div>
              <label htmlFor="consult-language" className="mb-1.5 block text-sm font-medium text-slate-800">
                Consultation Language
              </label>
              <select
                id="consult-language"
                value={languageCode}
                onChange={(e) => setLanguageCode(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 focus:outline-none"
              >
                {LANGUAGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {error ? (
              <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <div className="space-y-3 pt-2">
              <button
                type="submit"
                disabled={isStarting}
                className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-teal-700 px-5 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-teal-800 active:scale-[0.99] disabled:opacity-60"
              >
                <Mic className="size-5" />
                <span>{isStarting ? "Starting..." : "Start Recording Directly"}</span>
              </button>

              <button
                type="button"
                disabled={isStarting}
                onClick={() => void beginConsultation("upload")}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                <Upload className="size-4 text-teal-700" />
                <span>Or Upload Pre-recorded Audio (.mp3 / .wav)</span>
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
