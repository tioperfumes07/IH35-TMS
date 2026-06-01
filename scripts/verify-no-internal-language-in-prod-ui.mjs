#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const targetRoot = path.join(repoRoot, "apps/frontend/src");
const selfPath = path.resolve(repoRoot, "scripts/verify-no-internal-language-in-prod-ui.mjs");

// Documented exceptions:
// - api/identity.ts: API contract action_code values that must preserve backend workflow identifiers.
// - types/api.ts: Type literals mirroring backend workflow codes; not user-facing UI copy.
const IGNORED_FILES = [
  "apps/frontend/src/api/identity.ts",
  "apps/frontend/src/types/api.ts",
].map((relativePath) => path.resolve(repoRoot, relativePath).replace(/\\/g, "/"));

const forbiddenTerms = [
  "BLOCK 0",
  "WF-0",
  "FOUNDATION",
  "qbo_archive",
  "rebuild +",
  "triage band",
  "stub allowed",
  "after Block",
  "Uses vendor bills API today",
  "Read-only foundation",
  "once write flow is enabled",
  "Production data import (admin)",
  "(admin)",
];

function isExcluded(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized === selfPath.replace(/\\/g, "/")) return true;
  if (IGNORED_FILES.includes(normalized)) return true;
  if (normalized.includes("/__tests__/")) return true;
  if (normalized.includes("/test/")) return true;
  if (normalized.includes("/tests/")) return true;
  if (/\.test\.[cm]?[jt]sx?$/.test(normalized)) return true;
  if (/\.spec\.[cm]?[jt]sx?$/.test(normalized)) return true;
  return false;
}

function walk(dirPath, out = []) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walk(absolute, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!absolute.endsWith(".ts") && !absolute.endsWith(".tsx")) continue;
    if (isExcluded(absolute)) continue;
    out.push(absolute);
  }
  return out;
}

if (!fs.existsSync(targetRoot)) {
  console.error(`[verify-no-internal-language-in-prod-ui] Missing target path: ${targetRoot}`);
  process.exit(1);
}

const violations = [];
const files = walk(targetRoot);
for (const file of files) {
  const content = fs.readFileSync(file, "utf8");
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const term of forbiddenTerms) {
      if (line.includes(term)) {
        violations.push({
          file: path.relative(repoRoot, file),
          line: i + 1,
          term,
          text: line.trim(),
        });
      }
    }
  }
}

if (violations.length) {
  console.error("[verify-no-internal-language-in-prod-ui] Forbidden internal language found:");
  for (const violation of violations) {
    console.error(`- ${violation.file}:${violation.line} [${violation.term}] ${violation.text}`);
  }
  process.exit(1);
}

console.log(`[verify-no-internal-language-in-prod-ui] OK (${files.length} files scanned)`);
