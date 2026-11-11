import assert from "node:assert/strict"
import test from "node:test"
import { parseWavHeader } from "../core/wav.js"
import { transcribeWithGnani } from "../providers/gnani-transcriber.js"

function createTestWavBuffer({
  sampleRate,
  numChannels,
  numSamples,
  bitDepth = 16,
}: {
  sampleRate: number
  numChannels: number
  numSamples: number
  bitDepth?: number
}): ArrayBuffer {
  const bytesPerSample = bitDepth / 8
  const dataSize = numSamples * numChannels * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i))
    }
  }

  writeString(0, "RIFF")
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, "WAVE")
  writeString(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true)
  view.setUint16(32, numChannels * bytesPerSample, true)
  view.setUint16(34, bitDepth, true)
  writeString(36, "data")
  view.setUint32(40, dataSize, true)

  return buffer
}

test("parseWavHeader returns accurate metadata", () => {
  const buffer = createTestWavBuffer({ sampleRate: 16000, numChannels: 2, numSamples: 16000 })
  const info = parseWavHeader(buffer)

  assert.equal(info.sampleRate, 16000)
  assert.equal(info.numChannels, 2)
  assert.equal(info.bitDepth, 16)
  assert.equal(info.durationMs, 1000)
})

test("transcribeWithGnani requires GNANI_API_KEY", async () => {
  const prev = process.env.GNANI_API_KEY
  process.env.GNANI_API_KEY = ""
  try {
    await assert.rejects(() => transcribeWithGnani(Buffer.from([1, 2, 3]), "clip.wav"), /GNANI_API_KEY/)
  } finally {
    process.env.GNANI_API_KEY = prev
  }
})

test("transcribeWithGnani enforces HTTPS", async () => {
  await assert.rejects(
    () =>
      transcribeWithGnani(Buffer.from([1, 2, 3]), "clip.wav", {
        apiKey: "test-key",
        apiUrl: "http://api.vachana.ai/stt/v3",
      }),
    /HTTPS/,
  )
})
