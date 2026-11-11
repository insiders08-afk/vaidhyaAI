"use client"

import {
  SampleBuffer,
  StreamingResampler,
  TARGET_SAMPLE_RATE,
  createWavBlob,
} from "@audio/capture/audio-processing"
import { useCallback, useEffect, useRef, useState } from "react"

/** Gnani REST /stt/v3 allows max 30 seconds per request. We use 24s chunks for headroom. */
export const GNANI_CHUNK_SECONDS = 24
const CHUNK_MS = GNANI_CHUNK_SECONDS * 1000
const MIN_FINAL_CHUNK_SAMPLES = Math.round(0.25 * TARGET_SAMPLE_RATE)

export interface AudioChunk {
  seqNo: number
  blob: Blob
  durationSeconds: number
}

/**
 * Decode an uploaded audio file (.mp3, .wav, .m4a, .ogg) in the browser,
 * mix to mono, resample to 16kHz, and slice into <= 24s WAV chunks for Gnani STT.
 */
export async function sliceAudioFileToWavChunks(
  file: File,
  chunkSeconds: number = GNANI_CHUNK_SECONDS,
): Promise<{ chunks: AudioChunk[]; totalDurationSeconds: number }> {
  const arrayBuffer = await file.arrayBuffer()
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const audioCtx = new AudioCtx()

  try {
    const decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0))
    const totalDurationSeconds = Math.round(decoded.duration)
    const length = decoded.length
    const channelCount = decoded.numberOfChannels

    // Mix down to mono
    const mono = new Float32Array(length)
    for (let ch = 0; ch < channelCount; ch += 1) {
      const channelData = decoded.getChannelData(ch)
      for (let i = 0; i < length; i += 1) {
        mono[i] += channelData[i] / channelCount
      }
    }

    // Resample to 16kHz
    const resampler = new StreamingResampler(decoded.sampleRate, TARGET_SAMPLE_RATE)
    const resampled = resampler.process(mono)
    const flushed = resampler.flush()
    const full16k = new Float32Array(resampled.length + flushed.length)
    full16k.set(resampled, 0)
    full16k.set(flushed, resampled.length)

    const samplesPerChunk = chunkSeconds * TARGET_SAMPLE_RATE
    const chunks: AudioChunk[] = []
    let offset = 0
    let seqNo = 0

    while (offset < full16k.length) {
      const end = Math.min(offset + samplesPerChunk, full16k.length)
      const slice = full16k.subarray(offset, end)
      if (slice.length >= MIN_FINAL_CHUNK_SAMPLES || chunks.length === 0) {
        chunks.push({
          seqNo,
          blob: createWavBlob(slice, TARGET_SAMPLE_RATE),
          durationSeconds: Math.max(1, Math.round(slice.length / TARGET_SAMPLE_RATE)),
        })
        seqNo += 1
      }
      offset = end
    }

    return { chunks, totalDurationSeconds }
  } finally {
    await audioCtx.close().catch(() => undefined)
  }
}

interface UseConsultationRecorderOptions {
  onChunkReady: (chunk: AudioChunk) => void
}

export function useConsultationRecorder({ onChunkReady }: UseConsultationRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [durationSeconds, setDurationSeconds] = useState(0)
  const [audioLevel, setAudioLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<AudioWorkletNode | ScriptProcessorNode | null>(null)
  const resamplerRef = useRef<StreamingResampler | null>(null)
  const chunkBufferRef = useRef(new SampleBuffer())
  const allSamplesRef = useRef<Float32Array[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const seqRef = useRef(0)
  const isRecordingRef = useRef(false)
  const pausedRef = useRef(false)
  const onChunkRef = useRef(onChunkReady)

  useEffect(() => {
    onChunkRef.current = onChunkReady
  }, [onChunkReady])

  const chunkSampleCount = Math.round((CHUNK_MS / 1000) * TARGET_SAMPLE_RATE)

  const cleanup = useCallback(async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    processorRef.current?.disconnect()
    processorRef.current = null
    if (audioContextRef.current) {
      await audioContextRef.current.close().catch(() => undefined)
      audioContextRef.current = null
    }
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    resamplerRef.current = null
    setAudioLevel(0)
  }, [])

  const emitSamples = useCallback((samples: Float32Array) => {
    const seqNo = seqRef.current
    seqRef.current += 1
    onChunkRef.current({
      seqNo,
      blob: createWavBlob(samples, TARGET_SAMPLE_RATE),
      durationSeconds: Math.max(1, Math.round(samples.length / TARGET_SAMPLE_RATE)),
    })
  }, [])

  const handleSamples = useCallback(
    (input: Float32Array) => {
      if (!isRecordingRef.current || pausedRef.current) return
      const resampler = resamplerRef.current
      if (!resampler) return

      // Compute RMS level for visual meter
      let sumSquares = 0
      for (let i = 0; i < input.length; i += 4) {
        sumSquares += input[i] * input[i]
      }
      const rms = Math.sqrt(sumSquares / Math.max(1, Math.ceil(input.length / 4)))
      setAudioLevel(Math.min(1, rms * 5))

      const resampled = resampler.process(input)
      if (resampled.length === 0) return

      allSamplesRef.current.push(resampled)
      chunkBufferRef.current.push(resampled)

      while (chunkBufferRef.current.length >= chunkSampleCount) {
        const chunkSamples = chunkBufferRef.current.consume(chunkSampleCount)
        emitSamples(chunkSamples)
      }
    },
    [chunkSampleCount, emitSamples],
  )

  const startRecording = useCallback(async () => {
    setError(null)
    setDurationSeconds(0)
    chunkBufferRef.current.clear()
    allSamplesRef.current = []
    seqRef.current = 0

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      })
      streamRef.current = stream

      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const audioContext = new AudioCtx()
      audioContextRef.current = audioContext
      if (audioContext.state === "suspended") {
        await audioContext.resume()
      }

      resamplerRef.current = new StreamingResampler(audioContext.sampleRate, TARGET_SAMPLE_RATE)
      const source = audioContext.createMediaStreamSource(stream)

      try {
        await audioContext.audioWorklet.addModule("/worklets/pcm-processor.js")
        const node = new AudioWorkletNode(audioContext, "pcm-processor")
        node.port.onmessage = (event: MessageEvent<Float32Array>) => handleSamples(event.data)
        const silentGain = audioContext.createGain()
        silentGain.gain.value = 0
        source.connect(node)
        node.connect(silentGain)
        silentGain.connect(audioContext.destination)
        processorRef.current = node
      } catch {
        const scriptNode = audioContext.createScriptProcessor(4096, 1, 1)
        scriptNode.onaudioprocess = (event) => {
          const channel = event.inputBuffer.getChannelData(0)
          handleSamples(new Float32Array(channel))
        }
        const silentGain = audioContext.createGain()
        silentGain.gain.value = 0
        source.connect(scriptNode)
        scriptNode.connect(silentGain)
        silentGain.connect(audioContext.destination)
        processorRef.current = scriptNode
      }

      isRecordingRef.current = true
      pausedRef.current = false
      setIsRecording(true)
      setIsPaused(false)
      timerRef.current = setInterval(() => {
        if (!pausedRef.current) {
          setDurationSeconds((prev) => prev + 1)
        }
      }, 1000)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not access microphone. Please allow microphone permissions."
      setError(message)
      await cleanup()
      throw err
    }
  }, [cleanup, handleSamples])

  const pauseRecording = useCallback(() => {
    if (!isRecordingRef.current || pausedRef.current) return
    pausedRef.current = true
    setIsPaused(true)
    setAudioLevel(0)
    audioContextRef.current?.suspend().catch(() => undefined)
  }, [])

  const resumeRecording = useCallback(() => {
    if (!isRecordingRef.current || !pausedRef.current) return
    pausedRef.current = false
    setIsPaused(false)
    audioContextRef.current?.resume().catch(() => undefined)
  }, [])

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    if (!isRecordingRef.current) return null
    isRecordingRef.current = false
    pausedRef.current = false
    setIsRecording(false)
    setIsPaused(false)

    // Flush any remaining resampled tail audio so nothing at the end is lost
    const remaining = chunkBufferRef.current.drain()
    if (remaining.length >= MIN_FINAL_CHUNK_SAMPLES) {
      emitSamples(remaining)
    }

    const allChunks = allSamplesRef.current
    const totalSamples = allChunks.reduce((sum, item) => sum + item.length, 0)
    await cleanup()

    if (totalSamples === 0) return null
    const merged = new Float32Array(totalSamples)
    let offset = 0
    for (const part of allChunks) {
      merged.set(part, offset)
      offset += part.length
    }
    return createWavBlob(merged, TARGET_SAMPLE_RATE)
  }, [cleanup, emitSamples])

  useEffect(() => {
    return () => {
      isRecordingRef.current = false
      void cleanup()
    }
  }, [cleanup])

  return {
    isRecording,
    isPaused,
    durationSeconds,
    audioLevel,
    error,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
  }
}
