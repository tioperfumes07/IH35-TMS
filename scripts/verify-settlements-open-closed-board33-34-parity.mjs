#!/usr/bin/env node
// R90-33/34 (ROUND 9.0 BOARDS 33+34 — 2026-11-13) — Design-parity guard for Settlements Open + Closed.
//
// Parity census (5 elements):
//   1. SettlementsToursRegister.tsx — KPI strip minmax(150px,1fr) (R90 standard)
//   2. SettlementsToursRegister.tsx — tourLabel guards against "open"/"pending" status words
//   3. SettlementsToursRegister.tsx — waitingOnReason reads r.close_blockers[0] (row-own)
//   4. SettlementsToursRegister.tsx — pills "Pre-Settlement (Open)" and "Settlement (Closed)"
//   5. SettlementsToursRegister.tsx — 14 open-tab columns: Ready + Waiting on present
//
// node scripts/verify-settlements-open-closed-board33-34-parity.mjs
// node scripts/verify-settlements-open-closed-board33-34-parity.mjs --selftest
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlements-open-closed-board33-34-parity";
const REG = "apps/frontend/src/pages/driver-finance/SettlementsToursRegister.tsx";

function readRel(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/** @returns {string[]} */
export function collectProblems(root = ROOT) {
  const problems = [];

  const src = readRel(root, REG);
  if (!src) {
    problems.push(`missing ${REG}`);
    return problems;
  }

  // 1. KPI tile 150px min-width
  if (!src.includes("minmax(150px,1fr)")) {
    problems.push(`${REG}: KPI strip must use minmax(150px,1fr) (R90-33/34 parity)`);
  }
  // 2. tourLabel guards against status words
  if (!src.includes('did.toLowerCase() !== "open"')) {
    problems.push(`${REG}: tourLabel must guard against "open" status word (R443274-C fix)`);
  }
  // 3. waitingOnReason reads row-own blocker
  if (!src.includes("r.close_blockers[0]")) {
    problems.push(`${REG}: waitingOnReason must read r.close_blockers[0] (row-own reason, not global)`);
  }
  // 4. Pills labels
  if (!src.includes("Pre-Settlement (Open)") || !src.includes("Settlement (Closed)")) {
    problems.push(`${REG}: pills must show "Pre-Settlement (Open)" and "Settlement (Closed)" (R90-33/34 parity)`);
  }
  // 5. Ready + Waiting on columns present for open tab
  if (!src.includes('"Ready"') || !src.includes('"Waiting on"')) {
    problems.push(`${REG}: open tab must have Ready and Waiting on columns (R90-33 census)`);
  }

  return problems;
}

// ── selftest ───────────────────────────────────────────────────────────────
function runSelftest() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "r9033-parity-"));
  const dir = path.join(tmpDir, "apps/frontend/src/pages/driver-finance");
  fs.mkdirSync(dir, { recursive: true });

  const good = `
// KPI strip
gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
// tourLabel
if (did && !/^S-\d{4}-\d+/i.test(did) && did.toLowerCase() !== "open" && did.toLowerCase() !== "pending") {
// waitingOnReason
return (r.close_blockers[0] ?? "").trim();
// pills
Pre-Settlement (Open)
Settlement (Closed)
// columns
label: "Ready",
label: "Waiting on",
`;

  const tests = [
    ["all good → 0 problems", good, 0],
    ["150px missing → 1", good.replace("minmax(150px,1fr)", "minmax(140px,1fr)"), 1],
    ['open guard missing → 1', good.replace('did.toLowerCase() !== "open"', '// removed'), 1],
    ["close_blockers missing → 1", good.replace("r.close_blockers[0]", "r.some_other_field"), 1],
    ['pills missing → 1', good.replace("Pre-Settlement (Open)", "Pre-Settlement"), 1],
    ['"Ready" missing → 1', good.replace('"Ready"', '"Readiness"'), 1],
    ['all missing → 5',
      good
        .replace("minmax(150px,1fr)", "minmax(140px,1fr)")
        .replace('did.toLowerCase() !== "open"', '// removed')
        .replace("r.close_blockers[0]", "r.other")
        .replace("Pre-Settlement (Open)", "Pre-Settlement")
        .replace('"Ready"', '"Readiness"'),
      5
    ],
  ];

  let passed = 0;
  let failed = 0;
  for (const [desc, src, expect] of tests) {
    fs.writeFileSync(path.join(dir, "SettlementsToursRegister.tsx"), src);
    const probs = collectProblems(tmpDir);
    if (probs.length !== expect) {
      console.error(`  FAIL [${desc}]: expected ${expect} problems, got ${probs.length}: ${JSON.stringify(probs)}`);
      failed++;
    } else {
      console.log(`  PASS [${desc}]`);
      passed++;
    }
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });

  if (failed > 0) {
    console.error(`\n${LABEL} selftest: ${failed} failed`);
    process.exit(1);
  }
  console.log(`\n${LABEL} selftest: ${passed}/${passed} passed`);
  process.exit(0);
}

// ── main ──────────────────────────────────────────────────────────────────
if (process.argv.includes("--selftest")) {
  runSelftest();
} else {
  const problems = collectProblems();
  if (problems.length === 0) {
    console.log(`[${LABEL}] PASS — 5/5 R90-33/34 parity elements present`);
    process.exit(0);
  } else {
    for (const p of problems) console.error(`[${LABEL}] FAIL: ${p}`);
    process.exit(1);
  }
}
