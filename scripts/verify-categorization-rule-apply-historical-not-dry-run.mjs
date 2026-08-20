#!/usr/bin/env node
/**
 * ACCT-F5601 regression guard — the frontend's applyCategorizationRuleHistorical() must send
 * dry_run=false, or the "Apply to Historical Transactions" button silently no-ops forever.
 *
 * ROOT CAUSE of CLS-BANK-MATCH-DENSITY (98.25% of 11,365 bank_transactions stuck uncategorized,
 * flagged money_critical in docs/audit/wave-queue.json since 2026-08-05, unchanged 15 days later):
 * the backend route POST /api/v1/banking/categorization-rules/:id/apply-historical defaults its
 * dry_run query param to true when absent (a deliberate ACCT-LINK-06 safety default, so Owner/
 * Accountant cannot mint mass bank_categorization JEs by accident). The frontend wrapper never sent
 * dry_run at all, so the "Apply to Historical Transactions" button -- the caller's deliberate commit
 * step AFTER already reviewing the separate read-only preview (getCategorizationPreview) -- silently
 * ALWAYS dry-ran: it computed and displayed a "matched N transactions" success toast but never
 * persisted anything. 25 active categorization rules existed with zero effect on the backlog.
 *
 * This static check (no DB connection) asserts the frontend API client explicitly requests the
 * real (non-dry-run) application.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify:categorization-rule-apply-historical-not-dry-run";
const SELFTEST = process.argv.includes("--selftest");
const FILE = "apps/frontend/src/api/banking.ts";

const FUNC_NEEDLE = "export function applyCategorizationRuleHistorical(";
const GATE_STRING = "dry_run=false";
const WINDOW = 900;

function assertAll(src) {
  const problems = [];
  const idx = src.indexOf(FUNC_NEEDLE);
  if (idx === -1) {
    problems.push("applyCategorizationRuleHistorical() not found (guard target moved; update this guard)");
    return problems;
  }
  const window = src.slice(idx, idx + WINDOW);
  if (!window.includes(GATE_STRING)) {
    problems.push("applyCategorizationRuleHistorical() does not request dry_run=false -- the Apply to Historical button would silently no-op");
  }
  return problems;
}

const read = () => fs.readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const src = read();
  const idx = src.indexOf(FUNC_NEEDLE);
  if (idx === -1) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: function not found in real code`);
    process.exit(1);
  }
  const gateIdx = src.indexOf(GATE_STRING, idx);
  if (gateIdx === -1 || gateIdx - idx > WINDOW) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: dry_run=false not found near the function (guard text drifted from real code)`);
    process.exit(1);
  }
  // Plant the original bug: strip "&dry_run=false" from the URL template literal.
  const planted = src.slice(0, gateIdx - 1) + src.slice(gateIdx + GATE_STRING.length);

  if (!assertAll(planted).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect (dry_run=false removed) not caught`);
    process.exit(1);
  }

  const live = assertAll(src);
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertAll(read());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
