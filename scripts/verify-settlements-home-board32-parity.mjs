#!/usr/bin/env node
// R90-32 (ROUND 9.0 BOARD 32 — 2026-11-13) — Design-parity guard for Settlements Home Board.
//
// Parity census (5 elements):
//   1. SettlementsHomeBoardPanels.tsx — chart panel uses 1.6fr ratio in grid
//   2. SettlementsHomeBoardPanels.tsx — deductions panel title is the selected-week caption "Deductions · Week of …" (board shows "Deductions this week" for the current week; honesty guard verify-settlement-fe-honesty forbids the hard-wired phrase)
//   3. SettlementsHomeBoardPanels.tsx — inline totals row testId (settlements-home-week-of-totals)
//   4. SettlementsHomeBoardPanels.tsx — weekOfBoardStatus accepts pill param
//   5. SettlementsPage.tsx — KPI tiles minmax(150px,1fr)
//
// node scripts/verify-settlements-home-board32-parity.mjs
// node scripts/verify-settlements-home-board32-parity.mjs --selftest
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlements-home-board32-parity";
const PANELS = "apps/frontend/src/pages/driver-finance/SettlementsHomeBoardPanels.tsx";
const PAGE = "apps/frontend/src/pages/driver-finance/SettlementsPage.tsx";

function readRel(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/** @returns {string[]} */
export function collectProblems(root = ROOT) {
  const problems = [];

  const panels = readRel(root, PANELS);
  if (!panels) {
    problems.push(`missing ${PANELS}`);
  } else {
    // 1. Chart panel 1.6fr ratio
    if (!panels.includes("1.6fr")) {
      problems.push(`${PANELS}: chart panel must use 1.6fr column ratio (R90-32 parity)`);
    }
    // 2. Deductions panel title prefix
    if (!panels.includes("Deductions · Week of")) {
      problems.push(`${PANELS}: deductions panel title must include "Deductions · Week of" (R90-32 parity, selected-week caption)`);
    }
    // 3. Inline totals row test ID
    if (!panels.includes("settlements-home-week-of-totals")) {
      problems.push(`${PANELS}: must include inline totals row with testId settlements-home-week-of-totals (R90-32 parity)`);
    }
    // 4. weekOfBoardStatus pill param
    if (!panels.includes('pill?: "open" | "closed"') && !panels.includes("pill?: 'open' | 'closed'")) {
      problems.push(`${PANELS}: weekOfBoardStatus must accept pill param (R90-32 Closed panel fix)`);
    }
  }

  const page = readRel(root, PAGE);
  if (!page) {
    problems.push(`missing ${PAGE}`);
  } else {
    // 5. KPI tiles 150px min-width
    if (!page.includes("minmax(150px,1fr)")) {
      problems.push(`${PAGE}: KPI tiles must use minmax(150px,1fr) (R90-32 parity)`);
    }
  }

  return problems;
}

// ── selftest ───────────────────────────────────────────────────────────────
function runSelftest() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "r9032-parity-"));
  const panelsDir = path.join(tmpDir, "apps/frontend/src/pages/driver-finance");
  fs.mkdirSync(panelsDir, { recursive: true });

  const panelsGood = `
export function weekOfBoardStatus(s: SettlementListRow, pill?: "open" | "closed") {
  if (pill === "closed") return { label: "Closed", color: "#13233F" };
  return { label: "Open", color: "#1D4ED8" };
}
// className="grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]"
// Deductions · Week of Nov 9 · $500
// data-testid="settlements-home-week-of-totals"
`;
  const pageGood = `
style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}
`;

  const tests = [
    // [desc, panelsSrc, pageSrc, expectProblems]
    ["all good → 0 problems", panelsGood, pageGood, 0],
    ["missing 1.6fr → 1 problem", panelsGood.replace("1.6fr", "2fr"), pageGood, 1],
    ["missing deductions title → 1 problem", panelsGood.replace("Deductions · Week of", "Deductions"), pageGood, 1],
    ["missing totals testid → 1 problem", panelsGood.replace("settlements-home-week-of-totals", "settlements-home-totals-REMOVED"), pageGood, 1],
    ['missing pill param → 1 problem', panelsGood.replace('pill?: "open" | "closed"', "// removed"), pageGood, 1],
    ["missing 150px KPI → 1 problem", panelsGood, pageGood.replace("minmax(150px,1fr)", "minmax(140px,1fr)"), 1],
    ["all missing → 5 problems", panelsGood.replace("1.6fr","2fr").replace("Deductions · Week of","Ded").replace("settlements-home-week-of-totals","x").replace('pill?: "open" | "closed"',"// rm"), pageGood.replace("minmax(150px,1fr)","minmax(140px,1fr)"), 5],
  ];

  let passed = 0;
  let failed = 0;
  for (const [desc, pSrc, pgSrc, expect] of tests) {
    fs.writeFileSync(path.join(panelsDir, "SettlementsHomeBoardPanels.tsx"), pSrc);
    fs.writeFileSync(path.join(panelsDir, "SettlementsPage.tsx"), pgSrc);
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
    console.log(`[${LABEL}] PASS — 5/5 R90-32 parity elements present`);
    process.exit(0);
  } else {
    for (const p of problems) console.error(`[${LABEL}] FAIL: ${p}`);
    process.exit(1);
  }
}
