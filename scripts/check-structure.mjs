#!/usr/bin/env node
/* eslint-env node */

import fs from "node:fs"
import path from "node:path"

const root = path.resolve(process.cwd())
const allowedRootDirs = new Set([
  "src",
  "public",
  "tests",
  "docs",
  "scripts",
  "build",
  "node_modules",
])
const allowedRootFiles = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "tsconfig.json",
  "tsconfig.test.json",
  "next.config.mjs",
  "postcss.config.mjs",
  "tailwind.config.mjs",
  "eslint.config.mjs",
  "components.json",
  "next-env.d.ts",
  "README.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "architecture.md",
  ".gitignore",
])
const buildArtifacts = new Set([".next", ".tests-dist", "dist"])
const kebabCase = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const errors = []

for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  const name = entry.name

  if (buildArtifacts.has(name)) {
    errors.push(`Build artifact "${name}" must not be committed.`)
    continue
  }

  // Ignore Git metadata, local environment files and local tooling directories.
  if (name.startsWith(".") && name !== ".gitignore") continue

  let isDirectory = entry.isDirectory()
  if (entry.isSymbolicLink()) {
    try {
      isDirectory = fs.statSync(path.join(root, name)).isDirectory()
    } catch {
      // Broken symlinks are treated as files and rejected below.
    }
  }

  if (isDirectory) {
    if (!allowedRootDirs.has(name)) {
      errors.push(`Unexpected top-level directory: ${name}`)
    }
    continue
  }

  if (name.startsWith(".env") || name.endsWith(".tsbuildinfo")) continue
  if (!allowedRootFiles.has(name)) {
    errors.push(`Unexpected top-level file: ${name}`)
  }
}

function ensureKebabCase(directory) {
  if (!fs.existsSync(directory)) return

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (!kebabCase.test(entry.name)) {
      errors.push(
        `Folder "${path.relative(root, path.join(directory, entry.name))}" must use kebab-case.`,
      )
    }
  }
}

ensureKebabCase(path.join(root, "src"))
ensureKebabCase(path.join(root, "tests"))

if (errors.length > 0) {
  console.error("\nRepository structure violations:\n")
  for (const error of errors) console.error(` - ${error}`)
  console.error("\nFix the issues above before committing.\n")
  process.exit(1)
}

console.log("PASS repository structure is src-centred and clean")
