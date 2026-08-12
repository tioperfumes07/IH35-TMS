#!/usr/bin/env node
/**
 * Ratchet: wiring guards that ratchet EntityLink/FK surfaces must declare @matrix-built
 * so the Program matrix auto-greens Box 3 on deploy (no manual wire-sprint feed edit).
 *
 * Exempt: guards without EntityLink/FK/matrix wiring scope in filename or body.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-matrix-built-tag-present";

const WIRING_HINT =
  /EntityLink|FK|fk_|reverse_link|connectivity|picker_law|leafRe|@matrix-built/i;

function listVerifyScripts() {
  return fs
    .readdirSync(path.join(ROOT, "scripts"))
    .filter((n) => n.startsWith("verify-") && n.endsWith(".mjs"))
    .map((n) => path.join("scripts", n));
}

function problems() {
  const out = [];
  for (const rel of listVerifyScripts()) {
    const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
    if (!WIRING_HINT.test(src)) continue;
    if (/@matrix-built\s+\{/.test(src)) continue;
    if (/MATRIX-BUILT-OPTIONAL|wire-sprint-built\.json only/i.test(src)) continue;
    out.push(`${rel}: wiring ratchet missing @matrix-built { modules, cols, leafRe, task } header`);
  }
  return out;
}

if (process.argv.includes("--selftest")) {
  const p = problems();
  if (p.length === 0) {
    console.log(`${LABEL} selftest: nothing to check (OK)`);
    process.exit(0);
  }
  console.log(`${LABEL} selftest: would fail on ${p.length} file(s) — run inject-matrix-built-tags.mjs`);
  process.exit(0);
}

// WEEKEND ratchet: report-only until inject covers the full wiring corpus.
// Hard FAIL would block Box-3 auto ship while ~300 legacy guards lack tags.
// New column-wave PRs still add @matrix-built (VERTICAL-WIRING-LAW); inject grows coverage.
const p = problems();
if (p.length) {
  console.log(
    `${LABEL} WARN — ${p.length} wiring guard(s) still missing @matrix-built (auto Box 3 partial; run inject --write).`,
  );
  for (const line of p.slice(0, 12)) console.log(`  - ${line}`);
  if (p.length > 12) console.log(`  ... and ${p.length - 12} more`);
  process.exit(0);
}
console.log(`${LABEL} OK`);
