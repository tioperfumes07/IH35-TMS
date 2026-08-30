#!/usr/bin/env node
// MATRIX-BUILT-OPTIONAL — CI-registration infrastructure; does not claim product Built credit.
import { classifyGuards } from "./verify-guard-wired.mjs";

const LABEL = "verify-driver-column-guard-registry-batch";
const REQUIRED = [
  "verify-accident-driver-reverse.mjs", "verify-border-crossing-driver-linkage.mjs",
  "verify-cash-forecast-driver-linkage.mjs", "verify-compliance-driver-wiring.mjs",
  "verify-da-test-driver-linkage.mjs", "verify-dispatch-driver-wiring.mjs",
  "verify-driver-compliance-history-double-route.mjs", "verify-driver-customer-hidden-surface-reverse-links.mjs",
  "verify-driver-edit-save-reload-cache-key.mjs",
  "verify-driver-incidents-reverse.mjs", "verify-driver-load-reverse-link-wired.mjs",
  "verify-driver-report-driver-reverse.mjs", "verify-driver-report-load-reverse.mjs",
  "verify-driver-team-profile-reverse.mjs", "verify-driver-team-split-config-reverse.mjs",
  "verify-drivers-module-driver-wiring.mjs", "verify-drivers-pay-rate-templates-connectivity.mjs",
  "verify-equipment-transfer-driver-reverse.mjs", "verify-fleet-driver-wiring.mjs", "verify-fleet-unit-patch-company-scope.mjs",
  "verify-fuel-planner-unit-driver-entitylink.mjs", "verify-home-driver-reverse-leaves.mjs",
  "verify-hos-violation-driver-reverse.mjs", "verify-insurance-driver-wiring.mjs",
  "verify-intransit-issue-driver-linkage.mjs", "verify-legal-matter-driver-linkage.mjs",
  "verify-lists-driver-search-and-teams.mjs", "verify-load-driver-pay-bill-entitylink.mjs",
  "verify-maintenance-driver-wiring.mjs", "verify-reports-driver-wiring.mjs",
  "verify-road-service-driver-picker.mjs", "verify-road-service-driver-reverse.mjs",
  "verify-safety-driver-profile-connectivity.mjs", "verify-safety-driver-wiring.mjs",
  "verify-temp-cover-driver-linkage.mjs",
];

function failures(classification) {
  const wired = new Set(classification.fullyWired);
  return REQUIRED.filter((guard) => !wired.has(guard)).map((guard) => `${guard} is not executed by CI`);
}

if (process.argv.includes("--selftest")) {
  const baseline = { fullyWired: [...REQUIRED], unaccounted: ["unrelated-repository-guard.mjs"] };
  const mutations = [
    { name: "required guard removed", value: { ...baseline, fullyWired: REQUIRED.slice(1) } },
  ];
  for (const mutation of mutations) if (!failures(mutation.value).length) throw new Error(`${mutation.name} was not rejected`);
  if (failures({ ...baseline, unaccounted: [...baseline.unaccounted, "another-unrelated-guard.mjs"] }).length) {
    throw new Error("unrelated repository guard growth incorrectly failed the driver-column registry");
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}

const problems = failures(classifyGuards());
if (problems.length) {
  console.error(`${LABEL} FAIL\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — ${REQUIRED.length} exact driver-column guards execute in CI`);
