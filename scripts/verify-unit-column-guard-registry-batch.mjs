#!/usr/bin/env node
// MATRIX-BUILT-OPTIONAL — CI-registration infrastructure; does not claim product Built credit.
import { classifyGuards } from "./verify-guard-wired.mjs";

const LABEL = "verify-unit-column-guard-registry-batch";
const REQUIRED = [
  "verify-border-crossing-unit-linkage.mjs", "verify-compliance-tax-filings-unit-reverse.mjs",
  "verify-compliance-unit-wiring.mjs", "verify-default-truck-unit-reverse.mjs",
  "verify-dispatch-unit-wiring.mjs", "verify-docs-unit-wiring.mjs",
  "verify-fleet-unit-profile-edit-detail.mjs", "verify-fleet-unit-roster-modals.mjs",
  "verify-hos-unit-entitylink.mjs", "verify-insurance-policy-unit-double-route.mjs",
  "verify-insurance-unit-wiring.mjs", "verify-intransit-issue-unit-linkage.mjs",
  "verify-legal-matter-unit-linkage.mjs", "verify-load-create-modal-asset-unit-link.mjs",
  "verify-maintenance-inspection-unit-linkage.mjs", "verify-maintenance-unit-wiring.mjs",
  "verify-pm-schedule-unit-linkage.mjs", "verify-quick-assign-unit-linkage.mjs",
  "verify-reports-unit-wiring.mjs", "verify-safety-permit-unit-picker.mjs",
  "verify-safety-permit-unit-reverse.mjs", "verify-safety-unit-wiring.mjs",
  "verify-severe-repair-unit-reverse.mjs", "verify-tasks-unit-wiring.mjs",
  "verify-temp-cover-unit-linkage.mjs", "verify-tire-program-unit-reverse.mjs",
  "verify-unit-hidden-surface-reverse-links.mjs", "verify-unit-inline-surface-linkage.mjs",
  "verify-unit-oem-reference-applicability.mjs", "verify-unit-task-reverse-drill.mjs",
];

function failures(classification) {
  const wired = new Set(classification.fullyWired);
  const out = REQUIRED.filter((guard) => !wired.has(guard)).map((guard) => `${guard} is not executed by CI`);
  return out;
}

if (process.argv.includes("--selftest")) {
  const baseline = { fullyWired: [...REQUIRED], unaccounted: ["unrelated.mjs"] };
  const mutations = [
    { name: "required guard removed", value: { ...baseline, fullyWired: REQUIRED.slice(1) } },
  ];
  for (const mutation of mutations) if (!failures(mutation.value).length) throw new Error(`${mutation.name} was not rejected`);
  if (failures({ ...baseline, unaccounted: [...baseline.unaccounted, "another-unrelated.mjs"] }).length) throw new Error("unrelated census growth failed focused registry");
  console.log(`${LABEL} SELFTEST PASS — owned removal rejected; unrelated census growth accepted`);
  process.exit(0);
}

const problems = failures(classifyGuards());
if (problems.length) {
  console.error(`${LABEL} FAIL\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — ${REQUIRED.length} exact unit-column guards execute in CI`);
