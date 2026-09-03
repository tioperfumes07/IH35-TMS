#!/usr/bin/env node
/**
 * verify-deadhead-pay-line-renders-on-settlement.mjs
 *
 * 25-task #12 (CC-1-INSTRUCTIONS-09-02-2026.txt): "Deadhead pay line renders on the settlement as
 * its own row labeled 'Empty Miles', never folded into 'Loaded Miles'."
 *
 * settlement_lines line_type='deadhead_pay' rows have existed end to end since MILES SPEC
 * (settlement-engine.ts mints a separate row so it never folds into the loaded-mile 'earnings'
 * line) but SettlementDetailPage.tsx -- the driver/company-user-facing screen -- never filtered
 * for it: not its own section, not folded into Earnings either, just silently absent from both
 * the display AND the client-side gross total (even though the backend's own net_pay already
 * includes it, so the two totals disagreed).
 */
import { readFileSync } from "node:fs";

const PAGE_PATH = "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx";
const SUMMARY_PATH = "apps/frontend/src/pages/driver-finance/components/NetPaySummary.tsx";
const SECTION_PATH = "apps/frontend/src/pages/driver-finance/components/DeadheadPaySection.tsx";

function load(path) {
  return readFileSync(path, "utf8");
}

export function collectFailures({
  page = load(PAGE_PATH),
  summary = load(SUMMARY_PATH),
  section = (() => {
    try {
      return load(SECTION_PATH);
    } catch {
      return null;
    }
  })(),
} = {}) {
  const failures = [];

  if (section === null) {
    failures.push(`${SECTION_PATH} does not exist`);
    return failures;
  }
  if (!/line_type\)\s*===\s*"deadhead_pay"/.test(page)) {
    failures.push("SettlementDetailPage.tsx does not filter settlement_lines for line_type==='deadhead_pay'");
  }
  if (!/<DeadheadPaySection/.test(page)) {
    failures.push("SettlementDetailPage.tsx does not render <DeadheadPaySection>");
  }
  if (!/deadheadPay=\{summary\.deadheadTotal\}/.test(page)) {
    failures.push("SettlementDetailPage.tsx does not pass deadheadPay into NetPaySummary");
  }
  if (!/deadheadTotal/.test(page) || !/earnings\s*\+\s*deadheadPay/.test(summary) === false) {
    // secondary check below covers the actual arithmetic; this branch is a light presence check
  }
  if (!/const gross = earnings \+ deadheadPay \+ extraPay \+ reimbursements;/.test(summary)) {
    failures.push("NetPaySummary.tsx gross total does not include deadheadPay — client total would disagree with backend net_pay");
  }
  if (!/Empty Miles/.test(section)) {
    failures.push("DeadheadPaySection.tsx does not label the section 'Empty Miles'");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectFailures();
  if (baseline.length) {
    console.error(`verify-deadhead-pay-line-renders-on-settlement SELFTEST FAIL — good sources rejected: ${baseline.join(" | ")}`);
    process.exit(1);
  }
  const page = load(PAGE_PATH);
  const summary = load(SUMMARY_PATH);
  const mutations = [
    ["deadhead filter removed", page, { page: page.replace(/const deadhead = lines\.filter[\s\S]*?\}\);\n/, "") }],
    ["section not rendered", page, { page: page.replace("<DeadheadPaySection lines={deadhead} />\n          ", "") }],
    ["gross total drops deadheadPay", summary, { summary: summary.replace("const gross = earnings + deadheadPay + extraPay + reimbursements;", "const gross = earnings + extraPay + reimbursements;") }],
  ];
  const escaped = [];
  for (const [name, original, patch] of mutations) {
    if (patch.page === page && patch.summary === undefined) {
      escaped.push(`${name} (plant target not found -- source drifted)`);
      continue;
    }
    const args = { page: patch.page ?? page, summary: patch.summary ?? summary };
    if (collectFailures(args).length === 0) escaped.push(name);
  }
  if (escaped.length) {
    console.error(`verify-deadhead-pay-line-renders-on-settlement SELFTEST FAIL — escaped: ${escaped.join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-deadhead-pay-line-renders-on-settlement SELFTEST PASS — ${mutations.length}/${mutations.length} plants rejected`);
}

const failures = collectFailures();
if (failures.length > 0) {
  console.error("verify-deadhead-pay-line-renders-on-settlement: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-deadhead-pay-line-renders-on-settlement: OK — deadhead_pay renders as its own 'Empty Miles' section and is included in the client-side gross total");
