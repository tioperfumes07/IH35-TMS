#!/usr/bin/env node
/**
 * @matrix-built {"modules":["drivers"],"cols":["settlement","driver","connectivity","reverse_link","picker_law"],"leafRe":"^drivers\\.modal\\.settlement_dispute$","task":"WAVE-A-drivers-settlement-dispute","vertical":"column-wave"}
 * SettlementDisputeModal — DriverPickerWithCreate (not silent listDrivers 200).
 * SETL-PICK-03 — modal + detail share settlementDisputeCategories + openSettlementDispute.
 * Wave A: selected settlement must EntityLink for reverse hop.
 * Claim 2152.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-dispute-driver-picker";
const MODAL = "apps/frontend/src/pages/drivers/SettlementDisputeModal.tsx";
const DETAIL = "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx";
const TAB = "apps/frontend/src/pages/driver-finance/components/SettlementDisputesTab.tsx";
const SHARED = "apps/frontend/src/pages/driver-finance/settlementDisputeCategories.ts";
function readRel(root, rel) {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}
export function collectProblems(root = ROOT) {
  const problems = [];
  const src = readRel(root, MODAL);
  if (!src) return [`missing ${MODAL}`];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  if (!/DriverPickerWithCreate/.test(code)) problems.push(`${MODAL}: must use DriverPickerWithCreate`);
  if (/listDrivers\(/.test(code)) problems.push(`${MODAL}: must not call listDrivers`);
  if (/limit:\s*200/.test(code) && /listDrivers/.test(src)) problems.push(`${MODAL}: silent listDrivers limit:200`);
  if (!/<Combobox[\s\S]*?id=["']settlement-dispute-settlement-picker["']/.test(code)) {
    problems.push(`${MODAL}: settlement must use the searchable Combobox`);
  }
  if (/<select[\s\S]*?value=\{settlement_id\}/.test(code)) {
    problems.push(`${MODAL}: settlement must not regress to a native ID-valued select`);
  }
  if (!/kind="settlement"/.test(code) || !/settlement-dispute-settlement-link/.test(code)) {
    problems.push(`${MODAL}: selected settlement must EntityLink (Wave A settlement reverse hop)`);
  }

  // SETL-PICK-03
  const shared = readRel(root, SHARED);
  if (!shared) problems.push(`missing ${SHARED}`);
  else if (!/SETTLEMENT_DISPUTE_CATEGORY_OPTIONS/.test(shared)) {
    problems.push(`${SHARED}: must export SETTLEMENT_DISPUTE_CATEGORY_OPTIONS`);
  }
  if (!/settlementDisputeCategories/.test(src)) {
    problems.push(`${MODAL}: must import settlementDisputeCategories (SETL-PICK-03)`);
  }
  if (!/openSettlementDispute/.test(code)) {
    problems.push(`${MODAL}: must POST via openSettlementDispute (canonical dispute_category)`);
  }
  if (/dispute_type:/.test(code) || /DISPUTE_TYPES/.test(code)) {
    problems.push(`${MODAL}: must not use legacy DISPUTE_TYPES / dispute_type`);
  }
  const detail = readRel(root, DETAIL);
  if (!detail) problems.push(`missing ${DETAIL}`);
  else if (!/settlementDisputeCategories/.test(detail)) {
    problems.push(`${DETAIL}: must import settlementDisputeCategories (SETL-PICK-03)`);
  } else if (!/SETTLEMENT_DISPUTE_CATEGORY_OPTIONS/.test(detail)) {
    problems.push(`${DETAIL}: must render SETTLEMENT_DISPUTE_CATEGORY_OPTIONS`);
  }

  // LST-F5182 — disputes list reverse filter must be EntityPicker + URL sync.
  const tab = readRel(root, TAB);
  if (!tab) problems.push(`missing ${TAB}`);
  else if (
    !/dataTestId="settlement-disputes-filter-driver"/.test(tab) ||
    !/kind="driver"/.test(tab) ||
    !/allowCreate=\{false\}/.test(tab) ||
    !/searchParams\.get\("driver_id"\)/.test(tab) ||
    !/setSearchParams/.test(tab)
  ) {
    problems.push(`${TAB}: must render EntityPicker driver filter (allowCreate=false) synced to ?driver_id=`);
  }
  return problems;
}
if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(LABEL, baseline);
    process.exit(1);
  }
  const stubRoot = fs.mkdtempSync(path.join(ROOT, ".tmp-dispute-drv-"));
  try {
    const dir = path.join(stubRoot, "apps/frontend/src/pages/drivers");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "SettlementDisputeModal.tsx"),
      `listDrivers({ limit: 200 })\n<Combobox options={driverOptions} />\nconst DISPUTE_TYPES = [];\n`
    );
    if (!collectProblems(stubRoot).length) {
      console.error("plant miss");
      process.exit(1);
    }
  } finally {
    fs.rmSync(stubRoot, { recursive: true, force: true });
  }
  console.log(LABEL, "SELFTEST OK");
} else {
  const problems = collectProblems();
  if (problems.length) {
    console.error(LABEL, problems);
    process.exit(1);
  }
  console.log(LABEL, "OK");
}
