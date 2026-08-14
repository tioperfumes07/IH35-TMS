#!/usr/bin/env node
/** @matrix-built {"modules":["accounting"],"cols":["settlement"],"leafRe":"^accounting\\.modal\\.decide$","task":"VERTICAL-SETTLEMENT-INLINE-SURFACES"} */
import fs from "node:fs";

const dispute = fs.readFileSync("apps/frontend/src/pages/accounting/DisputeQueuePage.tsx", "utf8");
const readMatrix = (module) => JSON.parse(fs.readFileSync(`docs/specs/scoreboard/modules/${module}.required.json`, "utf8"));
const hasColumn = (matrix, leafId, column) => matrix.leaves.find((leaf) => leaf.id === leafId)?.required?.includes(column) === true;

function failures(disputeSource = dispute, drivers = readMatrix("drivers"), settlements = readMatrix("settlements")) {
  return [
    ["decision modal settlement drill", disputeSource.includes('<EntityLink kind="settlement" id={row.settlement_id}') && disputeSource.includes("row.settlement_display_id")],
    ["auto-deduction policy settlement N/A", !hasColumn(drivers, "drivers.panel.auto_deduction_policies", "settlement")],
    ["open driver bills settlement N/A", !hasColumn(settlements, "settlements.panel.open_driver_bills", "settlement")],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  if (!failures(dispute.replaceAll('<EntityLink kind="settlement" id={row.settlement_id}', '<EntityLink kind="broken" id={row.settlement_id}')).includes("decision modal settlement drill")) process.exit(1);
  const drivers = readMatrix("drivers");
  drivers.leaves.find((leaf) => leaf.id === "drivers.panel.auto_deduction_policies").required.push("settlement");
  if (!failures(dispute, drivers).includes("auto-deduction policy settlement N/A")) process.exit(1);
  console.log("verify-settlement-inline-surface-linkage selftest PASS — drill and applicability mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-settlement-inline-surface-linkage FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-settlement-inline-surface-linkage PASS — decision modal settlement drill built; future-policy/open-bill claims N/A");
