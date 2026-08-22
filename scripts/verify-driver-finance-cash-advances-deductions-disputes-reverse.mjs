#!/usr/bin/env node
/** @matrix-built {"modules":["drivers"],"cols":["reverse_link"],"leafRe":"^(cash_advances|deductions|disputes)$","task":"DRV-F001-drivers-driver-finance-reverse-remainder"} */
/**
 * GUARD: drivers:cash_advances / drivers:deductions / drivers:disputes (canonical
 * driver_finance.* — cash advances, settlement deductions, settlement disputes) all have
 * required reverse_link but nothing claimed exact ownership of them (found via
 * verify-codex-vertical-nonmoney-zero-remainder census, 2026-08-22).
 *
 * cash_advances and disputes were already correctly wired (driver+liability / driver+settlement
 * EntityLink drills) — this guard is their first exact-leaf assertion. deductions had a real gap:
 * the API row already carries load_id/load_number and applied_to_settlement_id/_display_id
 * (SettlementDeductionListRow) but PendingSettlementDeductionsPanel discarded both, so a
 * deduction never drilled back to the load that caused it or the settlement it landed on — fixed
 * in the same PR as this guard.
 *
 * Self-test: node scripts/verify-driver-finance-cash-advances-deductions-disputes-reverse.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-finance-cash-advances-deductions-disputes-reverse";
const DRIVERS_PAGE = "apps/frontend/src/pages/Drivers.tsx";
const DEDUCTIONS_PANEL = "apps/frontend/src/pages/drivers/PendingSettlementDeductionsPanel.tsx";
const DISPUTES_LIST = "apps/frontend/src/pages/drivers/SettlementDisputeList.tsx";
const MATRIX = "docs/specs/scoreboard/modules/drivers.required.json";
const FILES = [DRIVERS_PAGE, DEDUCTIONS_PANEL, DISPUTES_LIST, MATRIX];
const LEAVES = ["cash_advances", "deductions", "disputes"];

const CHECKS = [
  { name: "cash_advances driver drill", file: DRIVERS_PAGE, pattern: /debtAlertColumns[\s\S]{0,300}kind="driver"/ },
  { name: "cash_advances liability drill", file: DRIVERS_PAGE, pattern: /debtAlertColumns[\s\S]{0,900}kind="liability"/ },
  { name: "deductions driver drill", file: DEDUCTIONS_PANEL, pattern: /rows\.map[\s\S]{0,300}kind="driver"/ },
  { name: "deductions load reverse drill", file: DEDUCTIONS_PANEL, pattern: /row\.load_id[\s\S]{0,120}kind="load"/ },
  { name: "deductions settlement reverse drill", file: DEDUCTIONS_PANEL, pattern: /row\.applied_to_settlement_id[\s\S]{0,180}kind="settlement"/ },
  { name: "disputes driver drill", file: DISPUTES_LIST, pattern: /kind="driver"[\s\S]{0,60}id=\{row\.driver_id\}/ },
  { name: "disputes settlement drill", file: DISPUTES_LIST, pattern: /kind="settlement"[\s\S]{0,60}id=\{row\.settlement_id\}/ },
];

function readSources() {
  return Object.fromEntries(FILES.map((file) => [file, fs.readFileSync(path.join(ROOT, file), "utf8")]));
}

function run(sources) {
  const failures = CHECKS.filter((check) => !check.pattern.test(sources[check.file])).map((check) => check.name);
  try {
    const matrix = JSON.parse(sources[MATRIX]);
    for (const id of LEAVES) {
      const leaf = matrix.leaves?.find((item) => item.id === id);
      if (!leaf?.required?.includes("reverse_link")) failures.push(`${MATRIX}: exact Required ownership missing ${id}:reverse_link`);
    }
  } catch {
    failures.push(`${MATRIX}: drivers Required matrix must parse`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const live = readSources();
  const liveFailures = run(live);
  if (liveFailures.length) {
    console.error(`${LABEL} SELFTEST FAIL live:\n- ${liveFailures.join("\n- ")}`);
    process.exit(1);
  }
  for (const check of CHECKS) {
    const flags = check.pattern.flags.includes("g") ? check.pattern.flags : `${check.pattern.flags}g`;
    const planted = live[check.file].replace(new RegExp(check.pattern.source, flags), "/* planted driver-finance reverse defect */");
    if (planted === live[check.file] || !run({ ...live, [check.file]: planted }).includes(check.name)) {
      console.error(`${LABEL} SELFTEST FAIL — planted defect stayed green: ${check.name}`);
      process.exit(1);
    }
  }
  for (const id of LEAVES) {
    const plantedMatrix = live[MATRIX].replace(`"id": "${id}"`, `"id": "${id}.removed"`);
    if (plantedMatrix === live[MATRIX] || !run({ ...live, [MATRIX]: plantedMatrix }).includes(`${MATRIX}: exact Required ownership missing ${id}:reverse_link`)) {
      console.error(`${LABEL} SELFTEST FAIL — exact leaf ownership stayed green: ${id}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${CHECKS.length + LEAVES.length}/${CHECKS.length + LEAVES.length} planted defects rejected`);
  process.exit(0);
}

const failures = run(readSources());
if (failures.length) {
  console.error(`${LABEL} FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — drivers cash_advances/deductions/disputes reverse_link ratcheted`);
