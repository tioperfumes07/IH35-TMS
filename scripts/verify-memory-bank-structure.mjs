#!/usr/bin/env node
/**
 * RULE 51 (2026-09-08) — docs/MEMORY_BANK.md must exist and keep its 3 required section headers.
 * Existence/structure only — whether an entry is WORTH being in the file is judgment, not guardable.
 *
 *   node scripts/verify-memory-bank-structure.mjs
 *   node scripts/verify-memory-bank-structure.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-memory-bank-structure";
const FILE = "docs/MEMORY_BANK.md";
const REQUIRED_HEADINGS = [
  "## Active Architectural Decisions",
  "## Known Quirks & Blockers",
  "## Next Immediate Milestones",
];

export function assertStructure(src) {
  const errs = [];
  if (!src) return [`${FILE}: missing`];
  for (const h of REQUIRED_HEADINGS) {
    // Line-anchored, exact match — seats append namespaced sub-headers like
    // "## Active Architectural Decisions — Banking (CC-2, …)" which legitimately CONTAIN a
    // required heading as a prefix; a substring-anywhere check would never notice the real,
    // bare section heading was removed as long as a namespaced one survives.
    const re = new RegExp(`^${h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m");
    if (!re.test(src)) errs.push(`${FILE}: missing required heading "${h}"`);
  }
  return errs;
}

function read() {
  const p = path.join(ROOT, FILE);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

function selftest() {
  const good = read() ?? "";
  const goodErrs = assertStructure(good);
  if (goodErrs.length) {
    console.error(`${LABEL} --selftest FAIL good (${goodErrs.length}): ${goodErrs.join("; ")}`);
    process.exit(1);
  }
  const missingFile = assertStructure(null);
  if (missingFile.length !== 1) {
    console.error(`${LABEL} --selftest FAIL: missing-file case not caught`);
    process.exit(1);
  }
  for (const h of REQUIRED_HEADINGS) {
    const mutated = good.replace(h, "");
    const errs = assertStructure(mutated);
    if (errs.length === 0) {
      console.error(`${LABEL} --selftest FAIL: removing heading "${h}" was not caught`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS (${REQUIRED_HEADINGS.length + 1}/${REQUIRED_HEADINGS.length + 1} mutations caught)`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errs = assertStructure(read());
if (errs.length) {
  console.error(`[${LABEL}] FAILED — ${errs.length} issue(s):`);
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — ${FILE} exists with all ${REQUIRED_HEADINGS.length} required sections`);
