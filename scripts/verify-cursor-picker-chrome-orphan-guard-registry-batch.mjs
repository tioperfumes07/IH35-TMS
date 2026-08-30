#!/usr/bin/env node
// MATRIX-BUILT-OPTIONAL — CI-registration infrastructure; does not claim product Built credit.
import { classifyGuards } from "./verify-guard-wired.mjs";

const LABEL = "verify-cursor-picker-chrome-orphan-guard-registry-batch";
const REQUIRED = [
  "verify-collapsed-list-filters-apply.mjs",
  "verify-dispatch-picker-law-queues.mjs",
  "verify-factoring-qbo-chrome-surfaces.mjs",
  "verify-fleet-picker-law-edit.mjs",
  "verify-liability-chrome-honest-2.mjs",
  "verify-maintenance-picker-law-queues.mjs",
  "verify-picker-law-built-match-cap.mjs",
  "verify-picker-law-remainder-batch.mjs",
  "verify-pm-alert-work-order-picker.mjs",
  "verify-safety-picker-law-lists.mjs",
  "verify-secondary-picker-law-batch.mjs",
  "verify-surface-bar-create-drawer-inventory.mjs",
  "verify-surface-bar-toolbar-leaf-inventory.mjs",
  "verify-surface-bar-wizard-inventory.mjs",
];

function failures(classification) {
  const wired = new Set(classification.fullyWired);
  return REQUIRED.filter((guard) => !wired.has(guard)).map((guard) => `${guard} is not executed by CI`);
}

if (process.argv.includes("--selftest")) {
  const baseline = {
    fullyWired: [...REQUIRED],
    unaccounted: ["unrelated-repository-guard.mjs"],
  };
  if (!failures({ ...baseline, fullyWired: REQUIRED.slice(1) }).length) {
    throw new Error("required guard removal was not rejected");
  }
  if (failures({ ...baseline, unaccounted: [...baseline.unaccounted, "another-unrelated-guard.mjs"] }).length) {
    throw new Error("unrelated repository guard growth incorrectly failed the focused picker/chrome registry");
  }
  console.log(`${LABEL} SELFTEST PASS — owned removal rejected; unrelated census growth accepted`);
  process.exit(0);
}

const problems = failures(classifyGuards());
if (problems.length) {
  console.error(`${LABEL} FAIL\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
  process.exit(1);
}
console.log(
  `${LABEL} PASS — ${REQUIRED.length} exact Cursor picker/chrome/surface-bar guards execute in CI`,
);
