#!/usr/bin/env node
/**
 * verify-multipart-size-limits.mjs  (G3-3 — permanent guard)
 *
 * @fastify/multipart defaults fileSize AND files to Infinity. With no caps a single
 * request can stream unbounded bytes and memory-exhaust the process (DoS) — every
 * direct-upload route in this codebase calls part.toBuffer(), which buffers the whole
 * file into memory. This guard asserts the multipart plugin is registered WITH a
 * limits object that pins at least fileSize (the memory-exhaustion vector) and files,
 * so the hardening can't silently regress.
 *
 * Non-financial static check. Exits non-zero (fails CI) on any violation.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const errors = [];

// The production HTTP server that registers the multipart plugin.
const TARGET = "apps/backend/src/index.ts";
const abs = path.join(ROOT, TARGET);
if (!fs.existsSync(abs)) {
  console.error(`verify-multipart-size-limits: expected file not found: ${TARGET}`);
  process.exit(1);
}
const src = fs.readFileSync(abs, "utf8");

// Every app.register(multipart, ...) call must pass a limits.fileSize (and limits.files).
// Match the register call plus its options object up to the closing paren of register(...).
const registerRe = /register\(\s*multipart\b([^;]*?)\)\s*;/gs;
const matches = [...src.matchAll(registerRe)];

if (matches.length === 0) {
  errors.push(
    `${TARGET}: no \`register(multipart, ...)\` call found — the multipart plugin registration moved or was removed; update this guard to follow it.`
  );
}

for (const m of matches) {
  const call = m[0];
  const hasLimits = /\blimits\s*:/.test(call);
  const hasFileSize = /\bfileSize\s*:/.test(call);
  const hasFiles = /\bfiles\s*:/.test(call);
  if (!hasLimits) {
    errors.push(
      `${TARGET}: multipart is registered WITHOUT a \`limits\` object — fileSize/files default to Infinity (memory-exhaustion DoS). Add \`limits: { fileSize, files, fieldSize }\`.`
    );
    continue;
  }
  if (!hasFileSize) {
    errors.push(
      `${TARGET}: multipart \`limits\` is missing \`fileSize\` — this is THE memory-exhaustion vector (part.toBuffer buffers the whole file). Add a fileSize cap.`
    );
  }
  if (!hasFiles) {
    errors.push(
      `${TARGET}: multipart \`limits\` is missing \`files\` — an attacker can send unbounded file parts. Add a files cap.`
    );
  }
}

if (errors.length > 0) {
  console.error("verify-multipart-size-limits FAILED:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`verify-multipart-size-limits OK — multipart registered with fileSize + files caps (${matches.length} registration(s) checked).`);
