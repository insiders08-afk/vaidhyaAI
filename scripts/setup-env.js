#!/usr/bin/env node
/**
 * Create the local environment file without overwriting existing credentials.
 * The NEXT_PUBLIC key is a client-visible compatibility value, not a server secret.
 */
const fs = require("node:fs")
const path = require("node:path")
const crypto = require("node:crypto")

const root = path.resolve(__dirname, "..")
const envPath = path.join(root, ".env.local")
const envExamplePath = path.join(root, ".env.example")
const keyName = "NEXT_PUBLIC_SECURE_STORAGE_KEY"
const placeholderValues = new Set([
  "base64-secret",
  "base64-32-byte-key-for-local-demo-only",
  "PASTE_OUTPUT_FROM_OPENSSL_COMMAND",
])

function hasConfiguredKey(content) {
  const match = content.match(/^NEXT_PUBLIC_SECURE_STORAGE_KEY\s*=\s*(.*)$/m)
  if (!match) return false

  const value = match[1].trim().replace(/^["']|["']$/g, "")
  return value.length > 0 && !placeholderValues.has(value)
}

function makeFallbackTemplate() {
  return [
    "# Gnani Vachana / Prisma v3",
    'TRANSCRIPTION_PROVIDER="gnani"',
    'GNANI_API_KEY="your-gnani-api-key"',
    'GNANI_API_URL="https://api.vachana.ai/stt/v3"',
    'GNANI_STT_MODEL="prisma-v3.0"',
    'GNANI_LANGUAGE_CODE="indic-auto"',
    'GNANI_STT_FORMAT="transcribe"',
    'GNANI_STT_TOPIC="Outpatient medical consultation"',
    'GNANI_STT_KEYTERMS=""',
    'GNANI_STT_SPEAKER_NAMES=""',
    "",
    "# LLM used for clinical note drafting",
    'OPENAI_API_KEY="sk-your-openai-key"',
    'OPENAI_BASE_URL="https://api.openai.com/v1"',
    'OPENAI_MODEL="gpt-4o"',
    "",
    "# Client-visible local compatibility key; not a production security boundary",
    'NEXT_PUBLIC_SECURE_STORAGE_KEY="base64-32-byte-key-for-local-demo-only"',
    "",
  ].join("\n")
}

let envContent
const existingEnv = fs.existsSync(envPath)
if (existingEnv) {
  envContent = fs.readFileSync(envPath, "utf8")
  if (hasConfiguredKey(envContent)) {
    console.log(".env.local already exists with a configured compatibility key.")
    process.exit(0)
  }
} else if (fs.existsSync(envExamplePath)) {
  envContent = fs.readFileSync(envExamplePath, "utf8")
} else {
  envContent = makeFallbackTemplate()
}

const generatedKey = crypto.randomBytes(32).toString("base64")
const generatedLine = `${keyName}="${generatedKey}"`
const keyLinePattern = /^NEXT_PUBLIC_SECURE_STORAGE_KEY\s*=.*$/m

if (keyLinePattern.test(envContent)) {
  envContent = envContent.replace(keyLinePattern, generatedLine)
} else {
  envContent = `${envContent.trimEnd()}\n\n${generatedLine}\n`
}

fs.writeFileSync(envPath, envContent, { encoding: "utf8", mode: 0o600 })

console.log(`Created ${path.relative(root, envPath)} and generated a local compatibility key.`)
console.log("Next steps:")
console.log("1. Add your GNANI_API_KEY.")
console.log("2. Add your OPENAI_API_KEY.")
console.log("3. Start the app with pnpm dev.")
