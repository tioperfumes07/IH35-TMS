#!/usr/bin/env node
// @matrix-built {"modules":["maintenance"],"cols":["driver","unit","connectivity"],"leaves":["maintenance.modal.create_work_order"],"task":"MAINTENANCE-WO-IDENTITY-READ-FAILURE-TRUTH"}
import fs from "node:fs";

const FILES = {
  section: "apps/frontend/src/pages/maintenance/components/CreateWOSectionIdentification.tsx",
  modal: "apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx",
};
const CHECKS = [
  ["unit:blocked", "section", /Boolean\(unitId\) && \(selectedUnitQuery\.isPending \|\| selectedUnitQuery\.isError\)/],
  ["driver:blocked", "section", /Boolean\(driverId\) && \(selectedDriverQuery\.isPending \|\| selectedDriverQuery\.isError\)/],
  ["class:fail-closed", "section", /if \(identityReadBlocked\) return;/],
  ["unit:visible-retry", "section", /selectedUnitQuery\.isError[\s\S]{0,300}selectedUnitQuery\.refetch[\s\S]{0,160}Selected unit couldn't be loaded — retry/],
  ["driver:visible-retry", "section", /selectedDriverQuery\.isError[\s\S]{0,300}selectedDriverQuery\.refetch[\s\S]{0,160}Selected driver couldn't be loaded — retry/],
  ["state:threaded", "modal", /onIdentityReadStateChange=\{setIdentityReadsBlocked\}/],
  ["submit:fail-closed", "modal", /label: "Selected unit and driver details loaded", ok: !identityReadsBlocked/],
];

function readSources() {
  return Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
}
function problems(sources) {
  return CHECKS.filter(([, key, pattern]) => !pattern.test(sources[key])).map(([id]) => id);
}

const baseline = readSources();
if (process.argv.includes("--selftest")) {
  const missed = [];
  for (const [id, key, pattern] of CHECKS) {
    const mutated = { ...baseline, [key]: baseline[key].replace(pattern, "__PLANTED_DEFECT__") };
    if (!problems(mutated).includes(id)) missed.push(id);
  }
  if (missed.length) throw new Error(`selftest missed: ${missed.join(", ")}`);
  console.log(`verify-maintenance-wo-identity-read-failure-truth --selftest ${CHECKS.length}/${CHECKS.length}`);
} else {
  const found = problems(baseline);
  if (found.length) {
    console.error(`verify-maintenance-wo-identity-read-failure-truth FAILED:\n${found.map((id) => ` - ${id}`).join("\n")}`);
    process.exit(1);
  }
  console.log("verify-maintenance-wo-identity-read-failure-truth PASS — selected unit/driver reads fail visibly and block class/save until recovered");
}
