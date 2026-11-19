#!/usr/bin/env node
/* eslint-env node */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const targets = [
  'src/app/api/transcribe/route.ts',
  'src/app/api/generate-notes/route.ts',
  'src/middleware.ts',
  'src/server/transcription/providers/gnani-transcriber.ts',
  'src/server/transcription/providers/provider-resolver.ts',
  'src/server/llm/providers/openai-compatible.ts',
  'src/server/clinical-notes/note-generator.ts',
]

const bannedPatterns = [
  { regex: /debugLogPHI\s*\(/g, reason: 'PHI debug logger is not allowed in server runtime files.' },
  { regex: /\[PHI DEBUG\]/g, reason: 'PHI debug marker is not allowed in server runtime files.' },
]
const suspiciousPatterns = [
  /console\.log\([^\n]*(patient|transcript|note|phi)/i,
  /console\.error\([^\n]*(patient|transcript|note|phi)/i,
]

const requestedTargets = process.argv.slice(2)
const filesToScan = requestedTargets.length > 0
  ? requestedTargets.filter((target) => targets.includes(target))
  : targets
let failed = false

for (const relPath of filesToScan) {
  let source
  try {
    source = readFileSync(join(process.cwd(), relPath), 'utf8')
  } catch (error) {
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
      console.error(`FAIL ${relPath}: suspicious logging pattern detected: ${match[0].slice(0, 120)}`)
      failed = true
    }
  }
}
if (failed) process.exit(1)
console.log('PASS no PHI logging patterns detected in guarded server files')
