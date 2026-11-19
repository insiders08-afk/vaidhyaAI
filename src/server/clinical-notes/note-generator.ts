import { generateNoteCompletion, prompts } from "@llm"
import { toPipelineStageError } from "@pipeline-errors"
import { 
  extractMarkdownFromResponse, 
  normalizeMarkdownSections,
  createEmptyMarkdownNote 
} from "./clinical-models/markdown-note"
import { debugLog, debugError, debugWarn } from "@storage"

export type NoteLength = "short" | "long"

export interface ClinicalNoteRequest {
  transcript: string
  patient_name: string
  visit_reason: string
  noteLength?: NoteLength
  template?: string
  apiKey?: string
}

export async function createClinicalNoteText(params: ClinicalNoteRequest): Promise<string> {
  const { transcript, patient_name, visit_reason, noteLength = "long", template, apiKey } = params

  debugLog("=".repeat(80))
  debugLog("GENERATING CLINICAL NOTE (MARKDOWN)")
  debugLog("=".repeat(80))
  debugLog(`Note Length: ${noteLength}`)
  debugLog(`Template: ${template || "default"}`)
  debugLog(`Transcript length: ${transcript.length} characters`)

  if (!transcript || transcript.trim().length === 0) {
    debugLog("⚠️  Transcript is empty - returning empty note structure")
    const emptyNote = createEmptyMarkdownNote()
    debugLog("Returning an empty clinical note draft")
    return emptyNote
  }

  const systemPrompt = prompts.clinicalNote.currentVersion.getSystemPrompt(noteLength, template)
  const userPrompt = prompts.clinicalNote.currentVersion.getUserPrompt({
    transcript,
    patient_name,
    visit_reason,
    noteLength,
    template,
  })

  try {
    debugLog("🤖 Calling LLM to generate markdown clinical note...")
    debugLog(`📌 Using prompt version: ${prompts.clinicalNote.currentVersion.PROMPT_VERSION}`)
    debugLog(`🤖 Requested model: ${prompts.clinicalNote.currentVersion.MODEL_OPTIMIZED_FOR}`)

    // Provider/model come from the NOTE_MODEL_* env config, which defaults to
    // the Anthropic path with the prompt version's model. Direct text
    // generation - no JSON schema.
    const completion = await generateNoteCompletion({
      system: systemPrompt,
      prompt: userPrompt,
      model: prompts.clinicalNote.currentVersion.MODEL_OPTIMIZED_FOR,
      apiKey,
    })

    debugLog(`✅ Note model provider: ${completion.provider} (model: ${completion.model})`)

    const text = completion.text

    // Extract markdown from response (handles code fences)
    const cleanedMarkdown = extractMarkdownFromResponse(text)
    
    // Normalize section headings to standard format
    const normalizedMarkdown = normalizeMarkdownSections(cleanedMarkdown)

    debugLog("Clinical note draft generated")

    return normalizedMarkdown
  } catch (error) {
    debugError("❌ Failed to generate clinical note:", error)
    debugWarn("⚠️  Propagating note generation error")
    throw toPipelineStageError(error, {
      code: "note_generation_error",
      message: "Failed to generate clinical note",
      recoverable: true,
      details: {
        template: template || "default",
      },
    })
  }
}
