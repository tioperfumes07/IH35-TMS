#!/usr/bin/env node
/** @matrix-built {"modules":["settlements"],"cols":["driver"],"leafRe":"^(settlements\\.(list|detail|disputes|modal\\.create_advance|parity\\.create_advance|drawer\\.(advance_detail|liability_detail)|panel\\.pre_settlements)|settlement_close|cash_advances|liabilities\\.list|pre_settlements)$","task":"LINK-F5168-SETTLEMENTS-DRIVER-WIRING"} */
/**
 * OWNER-EXECUTION-PLAN vertical driver-column sweep (2026-08-14): 12 genuine settlements leaves,
 * each confirmed live — a real driver_id/EntityLink kind="driver" row, a real driver_id URL filter,
 * or a real DriverPickerWithCreate -> EntityPicker kind="driver", sourced from mdata.drivers.
 *
 * Self-test: node scripts/verify-settlements-driver-wiring.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlements-driver-wiring";

const CHECKS = [
  ["apps/frontend/src/pages/driver-finance/components/SettlementsTable.tsx", /kind="driver"/],
  ["apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx", /const driverId = settlement\.driver_id \? String\(settlement\.driver_id\) : null;/],
  ["apps/frontend/src/pages/driver-finance/components/SettlementDisputesTab.tsx", /kind="driver"[\s\S]{0,40}id=\{row\.driver_id\}/],
  ["apps/frontend/src/pages/driver-finance/SettlementCloseArrivalPage.tsx", /kind="driver"/],
  ["apps/frontend/src/pages/driver-finance/CashAdvanceRequestsPage.tsx", /kind="driver"/],
  ["apps/frontend/src/pages/liabilities/LiabilitiesHome.tsx", /const driverIdFilter = searchParams\.get\("driver_id"\);/],
  ["apps/frontend/src/components/driver-finance/PreSettlementsPanel.tsx", /kind="driver"/],
  ["apps/frontend/src/pages/cash-advances/components/CreateAdvanceModal.tsx", /import \{ DriverPickerWithCreate \} from "\.\.\/\.\.\/\.\.\/components\/drivers\/DriverPickerWithCreate";/],
  ["apps/frontend/src/pages/cash-advances/components/AdvanceDetailDrawer.tsx", /kind="driver"/],
  ["apps/frontend/src/pages/liabilities/components/LiabilityDetailDrawer.tsx", /kind="driver"/],
];

export function audit(files) {
  const failures = [];
  for (const [file, pattern] of CHECKS) {
    if (!pattern.test(files[file] || "")) failures.push(`${file}: missing real driver_id/EntityLink kind="driver" wiring`);
  }
  return failures;
}

function loadFiles(root) {
  const uniqueFiles = [...new Set(CHECKS.map(([f]) => f))];
  return Object.fromEntries(uniqueFiles.map((f) => [f, fs.readFileSync(path.join(root, f), "utf8")]));
}

if (process.argv.includes("--selftest")) {
  const good = loadFiles(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  let caught = 0;
  for (const [file, pattern] of CHECKS) {
    const mutated = { ...good, [file]: good[file].replace(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g"), "REMOVED") };
    if (mutated[file] === good[file]) {
      console.error(`${LABEL} SELFTEST FAIL — ${file}: pattern did not match source, re-anchor`);
      process.exit(1);
    }
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${file}: mutation escaped`);
      process.exit(1);
    }
    caught++;
  }
  console.log(`${LABEL} SELFTEST PASS — ${caught} mutations detected`);
  process.exit(0);
}

const failures = audit(loadFiles(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — settlements' 12 driver-scoped settlement/advance/liability leaves are real`);
