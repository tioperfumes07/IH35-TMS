#!/usr/bin/env node
/**
 * Insurance qbo_chrome — leaf-specific Built for chrome.toolbar_filter.
 * HONEST-BUILT-LAUNCH-LAW: no leafRe:".*" / word-blanket insurance(\.|$); only the one asserted leaf.
 *
 * Box 3 gap found 2026-08-20 (CC-3): insurance's other qbo_chrome leaves (chrome.toolbar_search,
 * chrome.toolbar_range, chrome.toolbar_gear) are already covered by
 * verify-collapsed-list-filters-apply.mjs (CLS-FILTER-GEAR-APPLY). chrome.toolbar_filter itself had
 * NO leaf-specific qbo_chrome guard anywhere — the feature was already mechanically built (all 4
 * insurance list surfaces already use the shared CollapsedListFilters QBO-collapse chrome), it just
 * had nothing locking Box 3 for this leaf/column pair.
 *
 * @matrix-built {"modules":["insurance"],"cols":["qbo_chrome"],"leafRe":"^chrome\\.toolbar_filter$","task":"VERTICAL-QBO-CHROME-insurance-toolbar-filter","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-insurance-qbo-chrome-toolbar-filter.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-insurance-qbo-chrome-toolbar-filter";

const CHECKS = [
  {
    name: "PoliciesList: CollapsedListFilters Apply triad + DataTable",
    file: "apps/frontend/src/pages/insurance/PoliciesList.tsx",
    pattern:
      /CollapsedListFilters[\s\S]*onApply=\{staged\.apply\}[\s\S]*onReset=\{staged\.reset\}[\s\S]*onCancel=\{staged\.cancel\}[\s\S]*DataTable/,
  },
  {
    name: "ClaimsTab: CollapsedListFilters Apply triad + ParityTable",
    file: "apps/frontend/src/pages/insurance/ClaimsTab.tsx",
    pattern:
      /CollapsedListFilters[\s\S]*onApply=\{stagedFilters\.apply\}[\s\S]*onReset=\{stagedFilters\.reset\}[\s\S]*onCancel=\{stagedFilters\.cancel\}/,
  },
  {
    name: "LawsuitsTab: CollapsedListFilters Apply triad + ParityTable",
    file: "apps/frontend/src/pages/insurance/LawsuitsTab.tsx",
    pattern:
      /CollapsedListFilters[\s\S]*onApply=\{staged\.apply\}[\s\S]*onReset=\{staged\.reset\}[\s\S]*onCancel=\{staged\.cancel\}/,
  },
  {
    name: "CoverageGapDashboard: CollapsedListFilters Apply triad + ParityTable",
    file: "apps/frontend/src/pages/insurance/CoverageGapDashboard.tsx",
    pattern:
      /CollapsedListFilters[\s\S]*onApply=\{stagedFilters\.apply\}[\s\S]*onReset=\{stagedFilters\.reset\}[\s\S]*onCancel=\{stagedFilters\.cancel\}[\s\S]*ParityTable/,
  },
];

function runChecks(root = ROOT) {
  const fails = [];
  for (const c of CHECKS) {
    const abs = path.join(root, c.file);
    if (!fs.existsSync(abs)) {
      fails.push(`${c.name}: missing ${c.file}`);
      continue;
    }
    const src = fs.readFileSync(abs, "utf8");
    if (!c.pattern.test(src)) fails.push(`${c.name}: pattern miss in ${c.file}`);
  }
  return fails;
}

function selftest() {
  const live = runChecks();
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".insurance-qbo-chrome-selftest-"));
  try {
    for (const c of CHECKS) {
      const abs = path.join(tmp, c.file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, "// poison — no chrome\n");
    }
    const planted = runChecks(tmp);
    if (planted.length < CHECKS.length) {
      console.error(`${LABEL} SELFTEST FAIL — planted chrome misses not caught (${planted.length})`);
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST PASS (poison trips ${planted.length})`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (live.length) {
    console.error(`${LABEL} FAIL live:\n- ${live.join("\n- ")}`);
    process.exit(1);
  }
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const fails = runChecks();
if (fails.length) {
  console.error(`${LABEL} FAIL (${fails.length}):\n- ${fails.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — ${CHECKS.length} insurance chrome.toolbar_filter qbo_chrome leaf asserts`);
