import assert from "node:assert/strict"
import test from "node:test"
import { transcribeWithResolvedProvider } from "../providers/provider-resolver.js"

test("resolver forwards Prisma output format, context, keyterms, speaker names and request ID", async () => {
  const oldKey = process.env.GNANI_API_KEY
  process.env.GNANI_API_KEY = "test-api-key"
  let form: FormData | undefined
  let headers: HeadersInit | undefined

  const fetchFn: typeof fetch = (async (_url, init) => {
    form = init?.body as FormData
    headers = init?.headers
    return new Response(JSON.stringify({
      success: true,
      transcript: "Patient reports follow-up for HbA1c.",
      model: "prisma-v3.0",
      request_id: "provider-request",
      processing_time: 42,
    }), { status: 200 })
  }) as typeof fetch

  try {
    const result = await transcribeWithResolvedProvider(
      Buffer.from([1, 2, 3]),
      "segment.wav",
      { provider: "gnani", model: "prisma-v3.0" },
      {
        languageCode: "hi-IN,en-IN",
        format: "codemix",
        topic: "Outpatient diabetes consultation",
        previousText: "The doctor asked about the prior report.",
        keyterms: ["HbA1c", "Metformin"],
        speakerNames: ["Dr Rao"],
        requestId: "vaidhya-request",
        fetchFn,
      },
    )

    assert.equal(result.transcript, "Patient reports follow-up for HbA1c.")
    assert.equal(result.requestId, "provider-request")
    assert.equal(result.processingTime, 42)
    assert(form)
    assert.equal(form.get("format"), "codemix")
    assert.equal(form.get("topic"), "Outpatient diabetes consultation")
    assert.equal(form.get("previous_text"), "The doctor asked about the prior report.")
    assert.equal(form.get("keyterms"), JSON.stringify(["HbA1c", "Metformin"]))
    assert.equal(form.get("speaker_names"), JSON.stringify(["Dr Rao"]))
    assert.equal((headers as Record<string, string>)["X-API-Request-ID"], "vaidhya-request")
  } finally {
    if (oldKey === undefined) delete process.env.GNANI_API_KEY
    else process.env.GNANI_API_KEY = oldKey
  }
})

test("generic role words are not sent as speaker-name hints by default", async () => {
  const oldKey = process.env.GNANI_API_KEY
  process.env.GNANI_API_KEY = "test-api-key"
  let form: FormData | undefined
  const fetchFn: typeof fetch = (async (_url, init) => {
    form = init?.body as FormData
    return new Response(JSON.stringify({ success: true, transcript: "Hello", model: "prisma-v3.0" }), { status: 200 })
  }) as typeof fetch

  try {
    await transcribeWithResolvedProvider(
      Buffer.from([1, 2, 3]),
      "segment.wav",
      { provider: "gnani", model: "prisma-v3.0" },
      { fetchFn },
    )
    assert(form)
    assert.equal(form.get("speaker_names"), null)
  } finally {
    if (oldKey === undefined) delete process.env.GNANI_API_KEY
    else process.env.GNANI_API_KEY = oldKey
  }
})
