#!/usr/bin/env node
// MATRIX-BUILT-OPTIONAL — CI-registration infrastructure; does not claim product Built credit.
import { classifyGuards } from "./verify-guard-wired.mjs";

const LABEL = "verify-cursor-picker-chrome-orphan-guard-registry-batch";
/** 91 orphans on handoff minus these 14 Cursor picker/chrome/surface-bar guards. */
const MAX_REMAINING = 77;
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
  const out = REQUIRED.filter((guard) => !wired.has(guard)).map((guard) => `${guard} is not executed by CI`);
  if (classification.unaccounted.length > MAX_REMAINING) {
    out.push(`unaccounted guard census ${classification.unaccounted.length} exceeds ${MAX_REMAINING}`);
  }
  return out;
}

if (process.argv.includes("--selftest")) {
  const baseline = {
    fullyWired: [...REQUIRED],
    unaccounted: Array.from({ length: MAX_REMAINING }, (_, i) => `other-${i}.mjs`),
  };
  const mutations = [
    { name: "required guard removed", value: { ...baseline, fullyWired: REQUIRED.slice(1) } },
    { name: "orphan census regresses", value: { ...baseline, unaccounted: [...baseline.unaccounted, "regression.mjs"] } },
  ];
  for (const mutation of mutations) {
    if (!failures(mutation.value).length) throw new Error(`${mutation.name} was not rejected`);
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}

const problems = failures(classifyGuards());
if (problems.length) {
  console.error(`${LABEL} FAIL\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
  process.exit(1);
}
console.log(
  `${LABEL} PASS — ${REQUIRED.length} Cursor picker/chrome/surface-bar guards execute in CI; orphan census ratcheted at <=${MAX_REMAINING}`,
);
