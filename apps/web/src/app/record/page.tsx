"use client"

import type React from "react"
import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  FileAudio,
  Loader2,
  Mic,
  Pause,
  Play,
  Square,
  UploadCloud,
} from "lucide-react"
import { VaidhyaHeader } from "@/components/vaidhya-header"
import {
  type AudioChunk,
  sliceAudioFileToWavChunks,
  useConsultationRecorder,
} from "@/lib/audio-chunker"
import {
  loadActivePatient,
  saveActiveConsultation,
  saveConsultationAudioBlob,
} from "@/lib/consultation-store"
import type { ClinicalConsultationResult, PatientSession } from "@/lib/consultation-types"

interface TranscribeApiResponse {
  ok: boolean
  seqNo?: number
  transcript?: string
  detectedLanguageCode?: string
  diarizedSegments?: Array<{ speaker?: string; text?: string }>
  error?: { code?: string; message?: string; recoverable?: boolean }
}

interface GenerateNotesApiResponse {
  ok: boolean
  consultation?: ClinicalConsultationResult
  error?: string
}

class TranscriptionRequestError extends Error {
  constructor(message: string, readonly recoverable: boolean) {
    super(message)
    this.name = "TranscriptionRequestError"
  }
}

function formatTimer(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
}

function RecordWorkspace() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const autostart = searchParams.get("autostart") === "1"
  const initialUploadMode = searchParams.get("mode") === "upload"

  const [patient, setPatient] = useState<PatientSession | null>(null)
  const [mode, setMode] = useState<"mic" | "upload">(initialUploadMode ? "upload" : "mic")
  const [chunkTranscripts, setChunkTranscripts] = useState<string[]>([])
  const [detectedLang, setDetectedLang] = useState<string | undefined>(undefined)
  const [statusMessage, setStatusMessage] = useState<string>("Ready to capture consultation")
  const [isProcessing, setIsProcessing] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const queueRef = useRef<Promise<void>>(Promise.resolve())
  const transcriptsBySeqRef = useRef<Map<number, string>>(new Map())
  const pendingChunksRef = useRef<Map<number, AudioChunk>>(new Map())
  const completedChunksRef = useRef<Set<number>>(new Set())
  const blockedAfterFailureRef = useRef(false)
  const detectedLangRef = useRef<string | undefined>(undefined)
  const diarizedSegmentsRef = useRef<Array<{ speaker?: string; text?: string }>>([])
  const diarizedSegmentsBySeqRef = useRef<Map<number, Array<{ speaker?: string; text?: string }>>>(new Map())
  const patientRef = useRef<PatientSession | null>(null)
  const hasAutoStartedRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    patientRef.current = patient
  }, [patient])

  const sendChunkToGnani = useCallback(
    async (chunk: AudioChunk, activePatient: PatientSession | null) => {
      const previousText = [...transcriptsBySeqRef.current.entries()]
        .filter(([seqNo]) => seqNo < chunk.seqNo)
        .sort(([left], [right]) => left - right)
        .map(([, transcript]) => transcript)
        .filter(Boolean)
        .join(" ")
        .slice(-600)

      const formData = new FormData()
      formData.append("audio_file", chunk.blob, `chunk-${chunk.seqNo}.wav`)
      formData.append("seq_no", String(chunk.seqNo))
      formData.append("language_code", activePatient?.languageCode || "indic-auto")
      formData.append("request_id", crypto.randomUUID())
      if (previousText) formData.append("previous_text", previousText)

      let lastError: unknown
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          const response = await fetch("/api/transcribe", { method: "POST", body: formData })
          const data = (await response.json()) as TranscribeApiResponse

          if (!response.ok || !data.ok) {
            const recoverable = data.error?.recoverable ?? (response.status === 429 || response.status >= 500)
            throw new TranscriptionRequestError(
              data.error?.message || `Chunk ${chunk.seqNo + 1} transcription failed`,
              recoverable,
            )
          }

          if (data.detectedLanguageCode && !detectedLangRef.current) {
            detectedLangRef.current = data.detectedLanguageCode
            setDetectedLang(data.detectedLanguageCode)
          }
          if (Array.isArray(data.diarizedSegments)) {
            diarizedSegmentsBySeqRef.current.set(chunk.seqNo, data.diarizedSegments)
            diarizedSegmentsRef.current = [...diarizedSegmentsBySeqRef.current.entries()]
              .sort(([left], [right]) => left - right)
              .flatMap(([, segments]) => segments)
          }

          transcriptsBySeqRef.current.set(chunk.seqNo, (data.transcript || "").trim())
          completedChunksRef.current.add(chunk.seqNo)
          setChunkTranscripts(
            [...transcriptsBySeqRef.current.entries()]
              .sort(([left], [right]) => left - right)
              .map(([, transcript]) => transcript)
              .filter(Boolean),
          )
          return
        } catch (error) {
          lastError = error
          if (error instanceof TranscriptionRequestError && !error.recoverable) throw error
          if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 400 * attempt))
        }
      }

      throw lastError instanceof Error ? lastError : new Error("Transcription failed after three attempts.")
    },
    [],
  )

  const drainPendingChunks = useCallback(async () => {
    if (blockedAfterFailureRef.current) return
    const pending = [...pendingChunksRef.current.values()].sort((left, right) => left.seqNo - right.seqNo)
    for (const chunk of pending) {
      if (blockedAfterFailureRef.current) return
      try {
        setStatusMessage(`Transcribing audio segment ${chunk.seqNo + 1}...`)
        await sendChunkToGnani(chunk, patientRef.current)
        pendingChunksRef.current.delete(chunk.seqNo)
        setStatusMessage("Recording live — listening...")
      } catch (err) {
        blockedAfterFailureRef.current = true
        setError(err instanceof Error ? err.message : "Audio chunk transcription failed.")
        setStatusMessage("A segment needs retry before notes can be generated.")
        return
      }
    }
  }, [sendChunkToGnani]);

  const handleChunkReady = useCallback(
    (chunk: AudioChunk) => {
      // Ignore duplicate callbacks after a chunk is pending or complete.
      if (completedChunksRef.current.has(chunk.seqNo) || pendingChunksRef.current.has(chunk.seqNo)) return
      pendingChunksRef.current.set(chunk.seqNo, chunk)
      queueRef.current = queueRef.current.then(drainPendingChunks, drainPendingChunks)
    },
    [drainPendingChunks],
  )

  const {
    isRecording,
    isPaused,
    durationSeconds,
    audioLevel,
    error: recorderError,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
  } = useConsultationRecorder({ onChunkReady: handleChunkReady })

  const resetTranscriptionState = useCallback(() => {
    queueRef.current = Promise.resolve()
    transcriptsBySeqRef.current.clear()
    pendingChunksRef.current.clear()
    completedChunksRef.current.clear()
    blockedAfterFailureRef.current = false
    detectedLangRef.current = undefined
    diarizedSegmentsRef.current = []
    diarizedSegmentsBySeqRef.current.clear()
    setChunkTranscripts([])
    setDetectedLang(undefined)
    setError(null)
  }, [])

  const beginRecording = useCallback(async () => {
    resetTranscriptionState()
    await startRecording()
  }, [resetTranscriptionState, startRecording])

  async function retryPendingChunks(activePatient: PatientSession | null) {
    blockedAfterFailureRef.current = false
    const pending = [...pendingChunksRef.current.values()].sort((left, right) => left.seqNo - right.seqNo)
    for (const chunk of pending) {
      setStatusMessage(`Retrying audio segment ${chunk.seqNo + 1}...`)
      await sendChunkToGnani(chunk, activePatient)
      pendingChunksRef.current.delete(chunk.seqNo)
    }
    blockedAfterFailureRef.current = false
    setError(null)
  }

  useEffect(() => {
    let active = true
    loadActivePatient()
      .then((loaded) => {
        if (!active) return
        if (!loaded) {
          router.replace("/")
          return
        }
        setPatient(loaded)
        patientRef.current = loaded

        if (autostart && !initialUploadMode && !hasAutoStartedRef.current) {
          hasAutoStartedRef.current = true
          beginRecording()
            .then(() => {
              setStatusMessage("Recording live — listening...")
            })
            .catch(() => {
              setStatusMessage("Tap Start Microphone to begin recording")
            })
        }
      })
      .catch(() => router.replace("/"))

    return () => {
      active = false
    }
  }, [autostart, initialUploadMode, router, beginRecording])

  async function finalizeAndGenerateNotes(
    audioBlob: Blob,
    filename: string,
    totalDurationSeconds: number,
  ) {
    const activePatient = patientRef.current
    if (!activePatient) {
      router.replace("/")
      return
    }

    const fullTranscript = [...transcriptsBySeqRef.current.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, transcript]) => transcript)
      .filter(Boolean)
      .join(" ")
      .trim()
    if (!fullTranscript) {
      setError("No speech was detected in the consultation audio. Please try again.")
      setIsProcessing(false)
      return
    }

    setStatusMessage("Generating draft clinical notes for review...")
    await saveConsultationAudioBlob(audioBlob)

    const response = await fetch("/api/generate-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientName: activePatient.patientName,
        patientPhone: activePatient.patientPhone,
        transcript: fullTranscript,
        detectedLanguage: detectedLangRef.current,
        diarizedSegments: diarizedSegmentsRef.current,
      }),
    })

    const data = (await response.json()) as GenerateNotesApiResponse
    if (!response.ok || !data.ok || !data.consultation) {
      throw new Error(data.error || "Failed to generate clinical notes.")
    }

    await saveActiveConsultation({
      patient: activePatient,
      rawTranscript: fullTranscript,
      result: data.consultation,
      audioFilename: filename,
      audioMimeType: audioBlob.type || "audio/wav",
      durationSeconds: totalDurationSeconds,
      completedAt: new Date().toISOString(),
    })

    router.push("/results")
  }

  async function handleStopAndProcess() {
    setError(null)
    setIsProcessing(true)
    setStatusMessage("Finalizing audio recording...")

    try {
      const fullWavBlob = await stopRecording()
      await queueRef.current
      if (pendingChunksRef.current.size > 0) {
        await retryPendingChunks(patientRef.current)
      }

      if (!fullWavBlob) {
        setError("No audio was recorded. Please record again or upload an audio file.")
        setIsProcessing(false)
        return
      }

      const safeName = (patient?.patientName || "patient").toLowerCase().replace(/[^a-z0-9]+/g, "-")
      await finalizeAndGenerateNotes(fullWavBlob, `${safeName}-consultation.wav`, durationSeconds)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process recording.")
      setIsProcessing(false)
    }
  }

  async function handleFileSelected(file: File) {
    setError(null)
    setIsProcessing(true)
    resetTranscriptionState()

    try {
      setStatusMessage(`Decoding ${file.name}...`)
      let chunks: AudioChunk[] = []
      let totalDurationSeconds = 0

      try {
        const sliced = await sliceAudioFileToWavChunks(file)
        chunks = sliced.chunks
        totalDurationSeconds = sliced.totalDurationSeconds
      } catch {
        // Fallback: if browser cannot decode format, send raw file as single chunk
        chunks = [{ seqNo: 0, blob: file, durationSeconds: 0 }]
      }

      for (let i = 0; i < chunks.length; i += 1) {
        setUploadProgress(`Transcribing chunk ${i + 1} of ${chunks.length} via Gnani AI...`)
        setStatusMessage(`Transcribing chunk ${i + 1} of ${chunks.length}...`)
        await sendChunkToGnani(chunks[i], patientRef.current)
      }

      setUploadProgress(null)
      await finalizeAndGenerateNotes(file, file.name, totalDurationSeconds)
    } catch (err) {
      setUploadProgress(null)
      setError(err instanceof Error ? err.message : "Failed to process uploaded audio file.")
      setIsProcessing(false)
    }
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file) {
      void handleFileSelected(file)
    }
  }

  const levelBars = [0.25, 0.45, 0.7, 0.9, 0.6, 0.85, 0.5, 0.3]

  return (
    <div className="min-h-dvh bg-slate-50">
      <VaidhyaHeader activeStep={2} />

      <main className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
        {patient ? (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-xs">
            <div>
              <p className="text-xs font-medium text-slate-500">Active Patient</p>
              <p className="text-base font-semibold text-slate-900">
                {patient.patientName}{" "}
                <span className="text-sm font-normal text-slate-500">• {patient.patientPhone}</span>
              </p>
            </div>
            {detectedLang ? (
              <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800">
                Detected: {detectedLang}
              </span>
            ) : null}
          </div>
        ) : null}

        {!isRecording && !isProcessing ? (
          <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-1.5">
            <button
              type="button"
              onClick={() => setMode("mic")}
              className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition ${
                mode === "mic" ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Mic className="size-4" />
              <span>Live Microphone</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("upload")}
              className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition ${
                mode === "upload" ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <FileAudio className="size-4" />
              <span>Upload Audio (.mp3/.wav)</span>
            </button>
          </div>
        ) : null}

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
          {isProcessing ? (
            <div className="flex flex-col items-center py-10 text-center">
              <Loader2 className="size-12 animate-spin text-teal-700" />
              <h2 className="mt-5 text-xl font-bold text-slate-900">Preparing Consultation Package</h2>
              <p className="mt-2 max-w-md text-sm text-slate-600">{uploadProgress || statusMessage}</p>
            </div>
          ) : mode === "mic" ? (
            <div className="flex flex-col items-center text-center">
              <div
                className={`flex size-24 items-center justify-center rounded-full transition ${
                  isRecording && !isPaused
                    ? "animate-pulse bg-red-50 text-red-600 ring-8 ring-red-100"
                    : "bg-teal-50 text-teal-700"
                }`}
              >
                <Mic className="size-10" />
              </div>

              <p className="mt-5 font-mono text-4xl font-bold tracking-tight text-slate-900">
                {formatTimer(durationSeconds)}
              </p>
              <p className="mt-1.5 text-sm font-medium text-slate-600">{statusMessage}</p>

              {/* Live audio level bars */}
              <div className="my-6 flex h-10 items-end gap-1.5" aria-hidden="true">
                {levelBars.map((weight, idx) => {
                  const activeHeight = isRecording && !isPaused ? Math.max(16, Math.round(audioLevel * weight * 100)) : 16
                  return (
                    <span
                      key={idx}
                      style={{ height: `${Math.min(100, activeHeight)}%` }}
                      className={`w-2 rounded-full transition-all duration-100 ${
                        isRecording && !isPaused ? "bg-teal-600" : "bg-slate-200"
                      }`}
                    />
                  )
                })}
              </div>

              {!isRecording ? (
                <button
                  type="button"
                  onClick={() => {
                    setError(null)
                    void beginRecording().then(() => setStatusMessage("Recording live — listening..."))
                  }}
                  className="flex w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-teal-700 px-6 py-4 text-base font-semibold text-white shadow-sm transition hover:bg-teal-800"
                >
                  <Mic className="size-5" />
                  <span>Start Microphone</span>
                </button>
              ) : (
                <div className="flex w-full max-w-sm flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={isPaused ? resumeRecording : pauseRecording}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                  >
                    {isPaused ? <Play className="size-4" /> : <Pause className="size-4" />}
                    <span>{isPaused ? "Resume" : "Pause"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleStopAndProcess()}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
                  >
                    <Square className="size-4 fill-current" />
                    <span>Stop &amp; Generate</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setIsDragging(true)
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`flex flex-col items-center rounded-2xl border-2 border-dashed p-8 text-center transition ${
                isDragging ? "border-teal-600 bg-teal-50/70" : "border-slate-300 bg-slate-50/60"
              }`}
            >
              <UploadCloud className="size-12 text-teal-700" />
              <h2 className="mt-4 text-lg font-semibold text-slate-900">Upload Pre-recorded Consultation</h2>
              <p className="mt-1 max-w-sm text-sm text-slate-600">
                Drag and drop an <strong>.mp3</strong> or <strong>.wav</strong> recording from a secondary device. Long
                recordings are automatically split into 24-second segments for Gnani AI.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept=".mp3,.wav,.m4a,.ogg,.flac,audio/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void handleFileSelected(file)
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-3 text-sm font-semibold text-white shadow-xs transition hover:bg-teal-800"
              >
                <FileAudio className="size-4" />
                <span>Choose Audio File</span>
              </button>
            </div>
          )}

          {error || recorderError ? (
            <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error || recorderError}
            </div>
          ) : null}
        </section>

        {chunkTranscripts.length > 0 ? (
          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Live Transcript Preview ({chunkTranscripts.length} {chunkTranscripts.length === 1 ? "segment" : "segments"})
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">{chunkTranscripts.join(" ")}</p>
          </section>
        ) : null}
      </main>
    </div>
  )
}

export default function RecordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-slate-50">
          <Loader2 className="size-8 animate-spin text-teal-700" />
        </div>
      }
    >
      <RecordWorkspace />
    </Suspense>
  )
}
