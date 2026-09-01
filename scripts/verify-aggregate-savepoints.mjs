#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_ROOTS = [
  "apps/backend/src/mdata",
  "apps/backend/src/maintenance",
  "apps/backend/src/accounting",
  "apps/backend/src/banking",
  "apps/backend/src/telematics",
  "apps/backend/src/driver-finance",
].map((p) => path.join(ROOT, p));

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

// A `.catch()` that ONLY rethrows (converts the error type/message and immediately throws again)
// never continues querying the same client — the exception propagates straight out of the
// function, and whatever wraps the transaction (withCurrentUser) rolls the whole thing back. The
// poisoned-transaction risk this guard exists to catch is a catch body that SWALLOWS the error
// (logs it, returns a fallback, or otherwise lets execution fall through to another `.query()` on
// the now-aborted transaction) without a savepoint to recover to. Live-caught in
// owned-asset-disposal.service.ts:185 — its .catch() body is exactly one `throw new
// OwnedAssetDisposalError(...)` statement wrapping ensureOpenPeriod()'s error, nothing else; it
// cannot run another query afterward. Narrowly excluding pure-rethrow bodies (no further
// `.query(`/`await` inside them) leaves every real swallow-and-continue pattern still flagged.
function catchBodyIsPureRethrow(lines, catchLineIndex) {
  const CLOSE_RE = /^\s*}\s*\)\s*;?\s*$/;
  const bodyLines = [];
  for (let j = catchLineIndex + 1; j < Math.min(lines.length, catchLineIndex + 20); j++) {
    if (CLOSE_RE.test(lines[j])) {
      const body = bodyLines.join("\n").trim();
      return /^throw\b[\s\S]*;$/.test(body) && !/\.query\s*\(|await\b/.test(body);
    }
    bodyLines.push(lines[j]);
  }
  return false;
}

const offenders = [];
const files = SCAN_ROOTS.flatMap((dir) => walk(dir));
for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  if (!src.includes("withCurrentUser")) continue;
  if (!/\.query\s*\([\s\S]{0,800}?\)\s*\.catch\s*\(/.test(src)) continue;
  const rel = path.relative(ROOT, file);
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes(".catch(")) continue;
    if (/ROLLBACK|SAVEPOINT|RELEASE SAVEPOINT/.test(line)) continue;
    if (catchBodyIsPureRethrow(lines, i)) continue;
    const window = lines.slice(Math.max(0, i - 8), i + 1).join("\n");
    if (/\.query\s*\(/.test(window) && !/withSavepoint\s*\(/.test(window)) {
      offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
    }
  }
}

if (offenders.length > 0) {
  console.error("verify:aggregate-savepoints FAIL — client.query().catch() inside withCurrentUser files without withSavepoint:");
  for (const o of offenders) console.error(`  ${o}`);
  process.exit(1);
}

console.log("verify:aggregate-savepoints PASS");
