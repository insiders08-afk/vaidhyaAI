#!/usr/bin/env node
/* eslint-env node */
import { readFileSync } from "node:fs"
import { join } from "node:path"

const targets = [
  "src/app/api/transcribe/route.ts",
  "src/app/api/generate-notes/route.ts",
  "src/middleware.ts",
  "src/server/transcription/providers/gnani-transcriber.ts",
  "src/server/transcription/providers/provider-resolver.ts",
  "src/server/llm/providers/openai-compatible.ts",
  "src/server/clinical-notes/note-generator.ts",
]

const bannedPatterns = [
  {
    regex: /debugLogPHI\s*\(/g,
    reason: "PHI debug logger is not allowed in server runtime files.",
  },
  {
    regex: /\[PHI DEBUG\]/g,
    reason: "PHI debug marker is not allowed in server runtime files.",
  },
  {
    regex: /debugLog\s*\(\s*(?:emptyNote|normalizedMarkdown|transcript|patient_name|visit_reason)\b/g,
    reason: "Clinical content must never be written to debug logs.",
  },
  {
    regex: /console\.(?:log|error|warn)\s*\(\s*(?:transcript|patientName|patient_name|consultation|clinicalNote|normalizedMarkdown|emptyNote)\b/g,
    reason: "Clinical content must never be written to console logs.",
  },
  {
    regex: /console\.(?:log|error|warn)\s*\([^\n]*\$\{\s*(?:transcript|patientName|patient_name|consultation|clinicalNote|normalizedMarkdown|emptyNote)\b/g,
    reason: "Clinical content must never be interpolated into console logs.",
  },
]

const suspiciousPatterns = [
  /console\.log\([^\n]*\b(?:patient|transcript|prescription)\s*[,)]/i,
  /console\.error\([^\n]*\b(?:patient|transcript|prescription)\s*[,)]/i,
]

const requestedTargets = process.argv.slice(2)
const filesToScan = requestedTargets.length > 0
  ? requestedTargets.filter((target) => targets.includes(target))
  : targets

let failed = false

for (const relPath of filesToScan) {
  let source
  try {
    source = readFileSync(join(process.cwd(), relPath), "utf8")
  } catch {
    console.error(`FAIL ${relPath}: unable to read guarded file`)
    failed = true
    continue
  }

  for (const { regex, reason } of bannedPatterns) {
    regex.lastIndex = 0
    if (regex.test(source)) {
      console.error(`FAIL ${relPath}: ${reason}`)
      failed = true
    }
  }

  for (const regex of suspiciousPatterns) {
    const match = source.match(regex)
    if (match) {
      console.error(
        `FAIL ${relPath}: suspicious logging pattern detected: ${match[0].slice(0, 120)}`,
      )
      failed = true
    }
  }
}

if (failed) process.exit(1)
console.log("PASS no clinical-content logging patterns detected in guarded files")
