#!/usr/bin/env node
// ROUND 197.1 (owner-raised, 2026-09-28) — verify-banking-filters-and-reconcile-complete.mjs
//
// Static-only (no live DB — source shape, not data). Two independent assertions:
//   1. DriverEscrowTabContent.tsx exposes a real QuickBooks-parity filter panel: date range
//      (presets + explicit from/to), driver (multi-select), transaction type (multi-select),
//      amount (min/max), status, and the header total is computed from the SAME filtered query
//      as the rows -- never the unfiltered account balance standing in for a filtered answer.
//   2. ReconciliationWorkspace.tsx renders beginning balance, ending balance, statement date,
//      service charge, interest earned, and a difference value that gates the Finish/complete
//      button -- never an auto-plugged difference.
import { readFileSync } from "node:fs";

const LABEL = "verify-banking-filters-and-reconcile-complete";
export const ALLOW_OFFLINE_SKIP = "pure static source-shape check, no live data involved";

const ESCROW_FILE = "apps/frontend/src/pages/banking/components/DriverEscrowTabContent.tsx";
const RECON_FILE = "apps/frontend/src/pages/banking/ReconciliationWorkspace.tsx";

function checkEscrowFilter(failures) {
  let src;
  try {
    src = readFileSync(ESCROW_FILE, "utf8");
  } catch {
    failures.push(`${ESCROW_FILE} not found.`);
    return;
  }
  const checks = [
    ["date range presets", /DATE_PRESETS|presetRange/],
    ["explicit from/to date inputs", /dateFrom[\s\S]*dateTo/],
    ["driver multi-select", /selectedDriverIds/],
    ["transaction-type multi-select", /selectedTypes/],
    ["amount min/max", /amountMinInput[\s\S]*amountMaxInput/],
    ["status filter", /statusFilter/],
    ["cleared/uncleared filter", /clearedFilter/],
    ["Clear all control", /[Cc]lear ?[Aa]ll/],
    ["removable filter chips", /chips/],
  ];
  for (const [label, re] of checks) {
    if (!re.test(src)) failures.push(`${ESCROW_FILE}: missing ${label}.`);
  }
  // The header total must come from the filtered query response (ledgerQuery.data), not from a
  // static/unfiltered prop standing in for it uncontested.
  if (!/ledgerQuery\.data\?\.total_amount_cents/.test(src)) {
    failures.push(`${ESCROW_FILE}: filtered header total is not read from the filtered query response.`);
  }
  // Every filter dimension must actually be threaded into the query call (wired, not decorative).
  if (!/getEscrowLedger\(/.test(src)) {
    failures.push(`${ESCROW_FILE}: does not call getEscrowLedger — filters would be inert UI.`);
  }
  const queryCallMatch = src.match(/getEscrowLedger\(operatingCompanyId,\s*\{([\s\S]*?)\}\)/);
  if (queryCallMatch) {
    const body = queryCallMatch[1];
    for (const field of ["from:", "to:", "driverIds:", "types:", "amountMinCents", "amountMaxCents", "cleared:", "accountStatus:"]) {
      if (!body.includes(field)) failures.push(`${ESCROW_FILE}: getEscrowLedger() call omits ${field} — a rendered filter with no effect.`);
    }
  } else {
    failures.push(`${ESCROW_FILE}: could not locate the getEscrowLedger(...) call to verify every filter is wired.`);
  }
}

function checkReconcile(failures) {
  let src;
  try {
    src = readFileSync(RECON_FILE, "utf8");
  } catch {
    failures.push(`${RECON_FILE} not found.`);
    return;
  }
  const checks = [
    ["beginning balance", /[Bb]eginning balance/],
    ["ending balance", /[Ee]nding balance/],
    ["statement date / period", /period_start|period_end|statement.{0,10}[Dd]ate/],
    ["service charge input", /serviceCharge/],
    ["interest earned input", /interestEarned/],
    ["a difference/variance value", /varianceCents|Difference/],
  ];
  for (const [label, re] of checks) {
    if (!re.test(src)) failures.push(`${RECON_FILE}: missing ${label}.`);
  }
  // Finish/complete must be gated by the variance, not just decoratively displayed.
  if (!/disabled=\{[\s\S]{0,400}varianceCents|disabled=\{[\s\S]{0,400}needsForceComplete/.test(src)) {
    failures.push(`${RECON_FILE}: the complete/Finish action's disabled condition does not reference the variance — could be enabled unconditionally.`);
  }
  // needsForceComplete (the gate the disabled= expression above reads) must be DERIVED from the
  // real variance, never a hardcoded literal standing in for it — this is the exact shape a
  // silent auto-plug regression takes (e.g. "const needsForceComplete = false;").
  const needsForceCompleteDef = src.match(/needsForceComplete\s*=\s*([^;]+);/);
  if (!needsForceCompleteDef) {
    failures.push(`${RECON_FILE}: could not find the needsForceComplete definition to verify it is derived, not hardcoded.`);
  } else if (/^(true|false|0|1)$/.test(needsForceCompleteDef[1].trim())) {
    failures.push(`${RECON_FILE}: needsForceComplete is a hardcoded literal (${needsForceCompleteDef[1].trim()}), not derived from the real variance — looks like an auto-plug.`);
  } else if (!/varianceCents/.test(needsForceCompleteDef[1])) {
    failures.push(`${RECON_FILE}: needsForceComplete's definition does not reference varianceCents.`);
  }
  // Never an auto-plug: nothing may silently zero out or overwrite varianceCents/adjustedBookBalanceCents
  // to force a match — the only legitimate write to those names is the computed assignment itself.
  const suspiciousPlug = /varianceCents\s*[:=]\s*0(?!\s*;?\s*\/\/)/;
  if (suspiciousPlug.test(src.replace(/varianceCents:\s*statementBalance/g, ""))) {
    failures.push(`${RECON_FILE}: a literal zero assignment to varianceCents was found outside the real computed difference — looks like an auto-plug.`);
  }
}

function selftest() {
  const failures = [];
  if (ESCROW_FILE === RECON_FILE) failures.push("ESCROW_FILE and RECON_FILE must be distinct paths.");
  if (!/DriverEscrowTabContent/.test(ESCROW_FILE)) failures.push("ESCROW_FILE path drifted.");
  if (!/ReconciliationWorkspace/.test(RECON_FILE)) failures.push("RECON_FILE path drifted.");
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest OK`);
}

function main() {
  const failures = [];
  checkEscrowFilter(failures);
  checkReconcile(failures);
  if (failures.length) {
    console.error(`${LABEL}: FAIL — ${failures.length} issue(s):`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — escrow filter exposes date/driver/type/amount/status/cleared + wired chips + filtered total, reconcile screen renders beginning/ending/statement/service-charge/interest-earned and gates Finish on the real difference.`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

main();
