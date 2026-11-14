#!/usr/bin/env node
// R90-35 (ROUND 9.0 BOARD 35 — 2026-11-13) — Design-parity guard for Settlement Statement.
//
// Parity census (6 elements):
//   1. SettlementStatementWorkflowPage.tsx — Print statement button
//   2. SettlementStatementWorkflowPage.tsx — Download PDF button
//   3. SettlementStatementWorkflowPage.tsx — Open journal entry button
//   4. SettlementStatementWorkflowPage.tsx — EarningsSection (by load)
//   5. SettlementStatementWorkflowPage.tsx — DeductionsSection + ReimbursementsSection
//   6. SettlementStatementWorkflowPage.tsx — CompanyWaterfallSection (side by side)
//   +  MoneyProofTrailPanel (linked records)
//   +  BackButton with fallbackTo settlements (reverse routing)
//
// node scripts/verify-settlements-statement-board35-parity.mjs
// node scripts/verify-settlements-statement-board35-parity.mjs --selftest
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlements-statement-board35-parity";
const PAGE = "apps/frontend/src/pages/driver-finance/SettlementStatementWorkflowPage.tsx";

function readRel(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

/** @returns {string[]} */
export function collectProblems(root = ROOT) {
  const problems = [];

  const src = readRel(root, PAGE);
  if (!src) {
    problems.push(`missing ${PAGE}`);
    return problems;
  }

  // 1. Print statement button
  if (!src.includes("Print statement")) {
    problems.push(`${PAGE}: must have "Print statement" action button (R90-35 parity)`);
  }
  // 2. Download PDF button
  if (!src.includes("Download PDF")) {
    problems.push(`${PAGE}: must have "Download PDF" action button (R90-35 parity)`);
  }
  // 3. Open journal entry button
  if (!src.includes("Open journal entry")) {
    problems.push(`${PAGE}: must have "Open journal entry" action button (R90-35 parity)`);
  }
  // 4. EarningsSection (earnings by load)
  if (!src.includes("EarningsSection")) {
    problems.push(`${PAGE}: must import and render EarningsSection (R90-35 parity)`);
  }
  // 5. DeductionsSection (deductions/reimbursements/net)
  if (!src.includes("DeductionsSection")) {
    problems.push(`${PAGE}: must import and render DeductionsSection (R90-35 parity)`);
  }
  // 6. CompanyWaterfallSection (company settlement side by side)
  if (!src.includes("CompanyWaterfallSection")) {
    problems.push(`${PAGE}: must import and render CompanyWaterfallSection (R90-35 parity)`);
  }
  // 7. MoneyProofTrailPanel (linked records)
  if (!src.includes("MoneyProofTrailPanel")) {
    problems.push(`${PAGE}: must import MoneyProofTrailPanel for linked records (R90-35 parity)`);
  }
  // 8. BackButton with fallbackTo settlements (reverse routing)
  if (!src.includes("fallbackTo=\"/driver-finance/settlements\"") && !src.includes("fallbackTo='/driver-finance/settlements'")) {
    problems.push(`${PAGE}: BackButton must fallbackTo /driver-finance/settlements (R90-35 reverse routing)`);
  }

  return problems;
}

// ── selftest ───────────────────────────────────────────────────────────────
function runSelftest() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "r9035-parity-"));
  const dir = path.join(tmpDir, "apps/frontend/src/pages/driver-finance");
  fs.mkdirSync(dir, { recursive: true });

  const good = `
Print statement
Download PDF
Open journal entry
EarningsSection
DeductionsSection
CompanyWaterfallSection
MoneyProofTrailPanel
fallbackTo="/driver-finance/settlements"
`;

  const tests = [
    ["all good → 0 problems", good, 0],
    ["Print missing → 1", good.replace("Print statement", "Print"), 1],
    ["Download PDF missing → 1", good.replace("Download PDF", "Download"), 1],
    ["journal entry missing → 1", good.replace("Open journal entry", "Open JE"), 1],
    ["EarningsSection missing → 1", good.replace("EarningsSection", "EarningsList"), 1],
    ["DeductionsSection missing → 1", good.replace("DeductionsSection", "DeductionsList"), 1],
    ["CompanyWaterfall missing → 1", good.replace("CompanyWaterfallSection", "CompanySection"), 1],
    ["MoneyProofTrail missing → 1", good.replace("MoneyProofTrailPanel", "ProofTrailPanel"), 1],
    ["BackButton route missing → 1", good.replace("fallbackTo=\"/driver-finance/settlements\"", "fallbackTo=\"/driver-finance\""), 1],
    ["all missing → 8",
      good
        .replace("Print statement", "Print")
        .replace("Download PDF", "Download")
        .replace("Open journal entry", "Open JE")
        .replace("EarningsSection", "EarningsList")
        .replace("DeductionsSection", "DeductionsList")
        .replace("CompanyWaterfallSection", "CompanySection")
        .replace("MoneyProofTrailPanel", "ProofTrailPanel")
        .replace('fallbackTo="/driver-finance/settlements"', 'fallbackTo="/driver-finance"'),
      8
    ],
  ];

  let passed = 0;
  let failed = 0;
  for (const [desc, src, expect] of tests) {
    fs.writeFileSync(path.join(dir, "SettlementStatementWorkflowPage.tsx"), src);
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
    console.log(`[${LABEL}] PASS — 8/8 R90-35 parity elements present`);
    process.exit(0);
  } else {
    for (const p of problems) console.error(`[${LABEL}] FAIL: ${p}`);
    process.exit(1);
  }
}
