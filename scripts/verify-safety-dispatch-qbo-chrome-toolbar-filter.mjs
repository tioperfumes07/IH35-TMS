#!/usr/bin/env node
/**
 * Safety + Dispatch qbo_chrome — leaf-specific Built for chrome.toolbar_filter.
 * HONEST-BUILT-LAUNCH-LAW: no leafRe:".*"; only the one asserted leaf per module.
 *
 * Same theater-coverage gap already found+fixed for insurance/legal (2026-08-20, CC-3): neither
 * module appears in any existing chrome.toolbar_filter × qbo_chrome guard (lists' own
 * LINK-F5170-LISTS-TOOLBAR-FILTER-APPLY, or the 7-module CODEX-ZERO-REMAINDER-PROTECTED-CHROME-7
 * list — which covers customers/docs/factoring/fleet/maintenance/tasks/vendors but not safety or
 * dispatch). The feature is already genuinely built for both:
 *   - safety: every tab under SafetyLayout.tsx shares ONE filter chrome — SafetyDashboardFilter.tsx,
 *     which is a real CollapsedListFilters (Apply/Reset/Cancel triad) — not a per-tab reimplementation.
 *   - dispatch: PodReviewPage.tsx (and TripProfitability.tsx) use the same real CollapsedListFilters
 *     Apply/Reset/Cancel triad directly.
 *
 * @matrix-built {"modules":["safety"],"cols":["qbo_chrome"],"leafRe":"^chrome\\.toolbar_filter$","task":"VERTICAL-QBO-CHROME-safety-toolbar-filter","vertical":"column-wave"}
 * @matrix-built {"modules":["dispatch"],"cols":["qbo_chrome"],"leafRe":"^chrome\\.toolbar_filter$","task":"VERTICAL-QBO-CHROME-dispatch-toolbar-filter","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-safety-dispatch-qbo-chrome-toolbar-filter.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-dispatch-qbo-chrome-toolbar-filter";

const CHECKS = [
  {
    name: "safety: SafetyLayout mounts the real SafetyDashboardFilter (shared across every tab)",
    file: "apps/frontend/src/pages/safety/SafetyLayout.tsx",
    pattern: /<SafetyDashboardFilter\b/,
  },
  {
    name: "safety: SafetyDashboardFilter is a real CollapsedListFilters Apply/Reset/Cancel triad",
    file: "apps/frontend/src/components/safety/SafetyDashboardFilter.tsx",
    pattern: /CollapsedListFilters[\s\S]*onApply=\{staged\.apply\}[\s\S]*onReset=\{staged\.reset\}[\s\S]*onCancel=\{staged\.cancel\}/,
  },
  {
    name: "dispatch: PodReviewPage CollapsedListFilters Apply/Reset/Cancel triad",
    file: "apps/frontend/src/pages/dispatch/PodReviewPage.tsx",
    pattern: /CollapsedListFilters[\s\S]*onApply=\{staged\.apply\}[\s\S]*onReset=\{staged\.reset\}[\s\S]*onCancel=\{staged\.cancel\}/,
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
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".safety-dispatch-qbo-chrome-selftest-"));
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
console.log(`${LABEL} PASS — ${CHECKS.length} safety/dispatch chrome.toolbar_filter qbo_chrome leaf asserts`);
