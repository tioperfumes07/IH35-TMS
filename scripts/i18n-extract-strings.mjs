#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FRONTEND_SRC = path.join(ROOT, "apps/frontend/src");
const OUTPUT_PATH = path.join(ROOT, "docs/i18n-extracted-strings.json");

const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git", "__tests__"]);
const SOURCE_EXTENSIONS = new Set([".tsx", ".jsx"]);

function isTestFile(filePath) {
  return /(\.test\.|\.spec\.|\/__tests__\/)/.test(filePath);
}

function normalizeText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function toKey(filePath, text) {
  const stem = filePath
    .replace(/^apps\/frontend\/src\//, "")
    .replace(/\.[jt]sx$/, "")
    .replace(/[^\w/]+/g, "")
    .replace(/\//g, ".");
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return `${stem}.${slug || "value"}`;
}

function getLineNumber(source, index) {
  return source.slice(0, index).split("\n").length;
}

function extractHardcodedStrings(sourceText) {
  const matches = [];
  const jsxTextRegex = />\s*([^<>{}\n][^<>{}]*[A-Za-z][^<>{}]*)\s*</g;
  const attrTextRegex = /\b(?:title|aria-label|placeholder|label|alt)\s*=\s*"([^"]*[A-Za-z][^"]*)"/g;

  let match = null;
  while ((match = jsxTextRegex.exec(sourceText)) !== null) {
    const text = normalizeText(match[1] ?? "");
    if (!text || text.length < 2) continue;
    matches.push({ text, index: match.index });
  }

  while ((match = attrTextRegex.exec(sourceText)) !== null) {
    const text = normalizeText(match[1] ?? "");
    if (!text || text.length < 2) continue;
    matches.push({ text, index: match.index });
  }

  return matches;
}

function walk(dirPath) {
  const results = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...walk(fullPath));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;
    if (isTestFile(fullPath)) continue;
    results.push(fullPath);
  }
  return results;
}

const candidates = [];
for (const fullPath of walk(FRONTEND_SRC)) {
  const source = fs.readFileSync(fullPath, "utf8");
  const relative = path.relative(ROOT, fullPath).replace(/\\/g, "/");
  for (const match of extractHardcodedStrings(source)) {
    candidates.push({
      key: toKey(relative, match.text),
      file: relative,
      line: getLineNumber(source, match.index),
      text: match.text,
    });
  }
}

candidates.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(
  OUTPUT_PATH,
  `${JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      source_root: "apps/frontend/src",
      total_candidates: candidates.length,
      candidates,
    },
    null,
    2
  )}\n`
);

console.log(`Extracted ${candidates.length} candidate strings to ${path.relative(ROOT, OUTPUT_PATH)}`);
