import { runOpenAICompatibleCompletion } from "./providers/openai-compatible"

export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1"
export const DEFAULT_OPENAI_MODEL = "gpt-4o"

export interface LLMRequest {
  system: string
  prompt: string
  model?: string
  apiKey?: string
  /** Optional OpenAI-compatible base URL override. Must be HTTPS (or loopback). */
  baseUrl?: string
  responseFormat?: "json_object" | "text"
  maxTokens?: number
}

export function resolveOpenAIConfig(overrides?: { model?: string; apiKey?: string; baseUrl?: string }) {
  const apiKey = (
    overrides?.apiKey ||
    process.env.OPENAI_API_KEY ||
    process.env.LLM_API_KEY ||
    ""
  ).trim()

  const baseUrl = (
    overrides?.baseUrl ||
    process.env.OPENAI_BASE_URL ||
    process.env.LLM_API_URL ||
    DEFAULT_OPENAI_BASE_URL
  ).trim()

  const model = (
    overrides?.model ||
    process.env.OPENAI_MODEL ||
    process.env.LLM_MODEL ||
    DEFAULT_OPENAI_MODEL
  ).trim()

  return { apiKey, baseUrl, model }
}

/**
 * Primary cloud LLM completion transport for Vaidhya AI (OpenAI GPT / OpenAI-compatible).
 */
export async function runLLMRequest({
  system,
  prompt,
  model,
  apiKey,
  baseUrl,
  responseFormat,
  maxTokens,
}: LLMRequest): Promise<string> {
  const resolved = resolveOpenAIConfig({ model, apiKey, baseUrl })
  if (!resolved.apiKey) {
    throw new Error("Missing OPENAI_API_KEY (or LLM_API_KEY). Configure your API key in environment variables.")
  }

  return runOpenAICompatibleCompletion({
    system,
    prompt,
    model: resolved.model,
    baseUrl: resolved.baseUrl,
    apiKey: resolved.apiKey,
    responseFormat,
    maxTokens,
  })
}

export { runOpenAICompatibleCompletion } from "./providers/openai-compatible"
export type { OpenAICompatibleCompletionRequest } from "./providers/openai-compatible"
export { assertSecureEndpoint, isLoopbackHostname } from "./providers/endpoint-security"
export * from "./note-model"
export * as prompts from "./prompts"
