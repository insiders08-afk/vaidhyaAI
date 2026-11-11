import assert from "node:assert/strict"
import test from "node:test"
import { resolveTranscriptionProvider } from "../providers/provider-resolver.js"
import { transcribeWithGnani } from "../providers/gnani-transcriber.js"

test("resolveTranscriptionProvider defaults to gnani with prisma-v3.0 model", () => {
  const resolved = resolveTranscriptionProvider({})
  assert.equal(resolved.provider, "gnani")
  assert.equal(resolved.model, "prisma-v3.0")
})

test("resolveTranscriptionProvider supports nvidia_parakeet upgrade path", () => {
  assert.equal(resolveTranscriptionProvider({ TRANSCRIPTION_PROVIDER: "nvidia_parakeet" }).provider, "nvidia_parakeet")
  assert.equal(resolveTranscriptionProvider({ TRANSCRIPTION_PROVIDER: "parakeet" }).provider, "nvidia_parakeet")
  assert.equal(resolveTranscriptionProvider({ TRANSCRIPTION_PROVIDER: "gnani" }).provider, "gnani")
})

test("transcribeWithGnani sends X-API-Key-ID, prisma-v3.0, and indic-auto", async () => {
  const seen: { url?: string; headers?: HeadersInit; form?: FormData } = {}
  const fetchFn: typeof fetch = (async (url, init) => {
    seen.url = url as string
    seen.headers = init?.headers
    seen.form = init?.body as FormData
    return new Response(
      JSON.stringify({
        success: true,
        transcript: "Patient has fever for 3 days.",
        model: "prisma-v3.0",
        detected_language_code: "en-IN",
      }),
      { status: 200 },
    )
  }) as typeof fetch

  const result = await transcribeWithGnani(Buffer.from([1, 2, 3]), "chunk-0.wav", {
    apiKey: "gnani-test-key",
    previousText: "Good morning doctor",
    fetchFn,
  })

  assert.equal(result.transcript, "Patient has fever for 3 days.")
  assert.equal(result.detectedLanguageCode, "en-IN")
  assert.equal(seen.url, "https://api.vachana.ai/stt/v3")
  assert.equal((seen.headers as Record<string, string>)["X-API-Key-ID"], "gnani-test-key")
  assert(seen.form instanceof FormData)
  assert.equal(seen.form.get("model"), "prisma-v3.0")
  assert.equal(seen.form.get("language_code"), "indic-auto")
  assert.equal(seen.form.get("previous_text"), "Good morning doctor")
})
