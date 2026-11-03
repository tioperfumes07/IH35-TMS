#!/usr/bin/env node
/**
 * verify-deadhead-pay-line-renders-on-settlement.mjs
 *
 * 25-task #12: Deadhead pay line renders on the settlement as its own row labeled 'Empty Miles',
 * never folded into 'Loaded Miles'. Filter lives in settlementDetailLineMaps.buildSettlementLineViews;
 * SettlementStatementWorkflowPage renders DeadheadPaySection + NetPaySummary.deadheadPay.
 */
import { readFileSync } from "node:fs";

const PAGE_PATH = "apps/frontend/src/pages/driver-finance/SettlementStatementWorkflowPage.tsx";
const MAP_PATH = "apps/frontend/src/pages/driver-finance/settlementDetailLineMaps.ts";
const SUMMARY_PATH = "apps/frontend/src/pages/driver-finance/components/NetPaySummary.tsx";
const SECTION_PATH = "apps/frontend/src/pages/driver-finance/components/DeadheadPaySection.tsx";

function load(path) {
  return readFileSync(path, "utf8");
}

export function collectFailures({
  page = load(PAGE_PATH),
  map = load(MAP_PATH),
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
  if (!/line_type\)\s*===\s*"deadhead_pay"/.test(map)) {
    failures.push("settlementDetailLineMaps.ts does not filter settlement_lines for line_type==='deadhead_pay'");
  }
  if (!/buildSettlementLineViews\(activeLines/.test(page)) {
    failures.push("SettlementStatementWorkflowPage must build line views via buildSettlementLineViews");
  }
  if (!/<DeadheadPaySection/.test(page)) {
    failures.push("SettlementStatementWorkflowPage.tsx does not render <DeadheadPaySection>");
  }
  if (!/deadheadPay=\{summary\.deadheadTotal\}/.test(page)) {
    failures.push("SettlementStatementWorkflowPage.tsx does not pass deadheadPay into NetPaySummary");
  }
  if (!/const gross = earnings \+ deadheadPay \+ extraPay \+ reimbursements;/.test(summary)) {
    failures.push("NetPaySummary.tsx gross total does not include deadheadPay — client total would disagree with backend net_pay");
  }
  if (summary.includes("text-[11px]")) {
    failures.push("NetPaySummary.tsx: must not use text-[11px] — use text-xs or text-section-header");
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
  const map = load(MAP_PATH);
  const summary = load(SUMMARY_PATH);
  const mutations = [
    [
      "deadhead filter removed",
      { map: map.replace(/\.filter\(\(line\) => String\(line\.line_type\) === "deadhead_pay"\)/, ".filter(() => false)") },
    ],
    [
      "section not rendered",
      {
        page: page.replace(
          "<DeadheadPaySection lines={deadhead} isOpen={!settlementIsReadOnly} operatingCompanyId={companyId} />",
          "",
        ),
      },
    ],
    [
      "gross total drops deadheadPay",
      {
        summary: summary.replace(
          "const gross = earnings + deadheadPay + extraPay + reimbursements;",
          "const gross = earnings + extraPay + reimbursements;",
        ),
      },
    ],
    ["off-scale caption", { summary: summary.replace("text-xs text-gray-500", "text-[11px] text-gray-500") }],
  ];
  const escaped = [];
  for (const [name, patch] of mutations) {
    const before = patch.page ?? patch.map ?? patch.summary;
    const original = patch.page != null ? page : patch.map != null ? map : summary;
    if (before === original) {
      escaped.push(`${name} (plant target not found -- source drifted)`);
      continue;
    }
    const args = {
      page: patch.page ?? page,
      map: patch.map ?? map,
      summary: patch.summary ?? summary,
    };
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
console.log("verify-deadhead-pay-line-renders-on-settlement: PASS");
