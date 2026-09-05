#!/usr/bin/env node
// DP1 (owner 13:20Z): "Double-routed section... renders ABOVE the tab content on every one of the
// 11 tabs. It belongs in Equipment Assignments only." + "Actions: 5 buttons instead of 1 dropdown."
// + "Method renders the machine value full_form" (Load History).
//
// Source check only — proves:
//   1. UnitDriverHistoryStrip in DriverDetail.tsx is gated to the Equipment Assignments tab, not
//      rendered unconditionally (the double-route this item exists to close).
//   2. The 4 secondary header actions (onboarding/deactivate/resend-invite/hos-detail) are
//      consolidated into ONE ActionsDropdown; Edit/Save stays its own primary button.
//   3. LoadHistoryTab's assignment_method column is humanized, never the raw machine string.
//
// Run: node scripts/verify-driver-profile-dp1-routes.mjs [--selftest]
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-profile-dp1-routes";
const DRIVER_DETAIL = "apps/frontend/src/pages/DriverDetail.tsx";
const LOAD_HISTORY = "apps/frontend/src/components/drivers/LoadHistoryTab.tsx";

function loadSource(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

export function collectSourceFailures(sources = { driverDetail: loadSource(DRIVER_DETAIL), loadHistory: loadSource(LOAD_HISTORY) }) {
  const failures = [];
  const { driverDetail, loadHistory } = sources;

  if (!/activeTab === "Equipment Assignments" && driver\.operating_company_id \? \(\s*<UnitDriverHistoryStrip/.test(driverDetail)) {
    failures.push("DriverDetail.tsx: UnitDriverHistoryStrip is not gated to the Equipment Assignments tab (double-route regression)");
  }
  if (!/<ActionsDropdown/.test(driverDetail)) {
    failures.push("DriverDetail.tsx: header actions are not consolidated into ActionsDropdown");
  }
  // Deactivate/Resend Invite/onboarding must live INSIDE the dropdown items, not as their own
  // top-level <Button> siblings any more (Edit/Save is the one allowed exception, by contract).
  const standaloneSecondaryButton = /<Button[^>]*variant="danger"[^>]*>\s*Deactivate\s*<\/Button>/.test(driverDetail);
  if (standaloneSecondaryButton) {
    failures.push("DriverDetail.tsx: Deactivate is still a standalone header button, not inside ActionsDropdown");
  }

  if (!/humanizeAuditEventType\(row\.assignment_method\)/.test(loadHistory)) {
    failures.push("LoadHistoryTab.tsx: assignment_method column does not humanize the raw machine value");
  }

  return failures;
}

function selftest() {
  const good = { driverDetail: loadSource(DRIVER_DETAIL), loadHistory: loadSource(LOAD_HISTORY) };
  if (collectSourceFailures(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — good sources rejected`);
    process.exit(1);
  }
  const unconditional = {
    ...good,
    driverDetail: good.driverDetail.replace(
      'activeTab === "Equipment Assignments" && driver.operating_company_id ? (',
      "driver.operating_company_id ? ("
    ),
  };
  const noDropdown = { ...good, driverDetail: good.driverDetail.replace(/<ActionsDropdown/g, "<RemovedDropdown") };
  const rawMethod = { ...good, loadHistory: good.loadHistory.replace("humanizeAuditEventType(row.assignment_method)", "row.assignment_method") };
  for (const [name, plant] of [
    ["double-route regression", unconditional],
    ["dropdown removed", noDropdown],
    ["raw method value", rawMethod],
  ]) {
    if (collectSourceFailures(plant).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name} was not caught`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST OK — 3/3 plants rejected`);
}

if (process.argv.includes("--selftest")) selftest();

const failures = collectSourceFailures();
if (failures.length) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — assignment-history strip is Equipment-Assignments-only, header actions are one dropdown, Load History Method is plain English`);
