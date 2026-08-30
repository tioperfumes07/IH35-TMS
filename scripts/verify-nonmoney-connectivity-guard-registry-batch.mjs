#!/usr/bin/env node
// MATRIX-BUILT-OPTIONAL — CI-registration infrastructure; does not claim product Built credit.
import { classifyGuards } from "./verify-guard-wired.mjs";

const LABEL = "verify-nonmoney-connectivity-guard-registry-batch";
const REQUIRED = [
  "verify-inventory-purchase-hold-connectivity.mjs",
  "verify-maintenance-damage-intake-connectivity.mjs",
  "verify-maintenance-severe-repair-connectivity.mjs",
  "verify-maintenance-tire-creators-connectivity.mjs",
  "verify-maintenance-work-order-create-modal-connectivity.mjs",
  "verify-reports-detention-claims-connectivity.mjs",
  "verify-reports-dot-audit-pack-connectivity.mjs",
  "verify-reports-fleet-utilization-connectivity.mjs",
  "verify-reports-fuel-price-variance-connectivity.mjs",
  "verify-reports-hos-violations-connectivity.mjs",
  "verify-reports-hub-connectivity.mjs",
  "verify-reports-maint-cost-runner-unit-linkage.mjs",
  "verify-reports-audit-customer-vendor-subject-links.mjs",
  "verify-reports-runner-canonical-aliases.mjs",
  "verify-reports-runner-entity-link-vertical.mjs",
  "verify-reports-saved-preset-connectivity.mjs",
  "verify-safety-eld-audit-connectivity.mjs",
  "verify-system-program-config-connectivity.mjs",
];

function failures(classification) {
  const wired = new Set(classification.fullyWired);
  const out = REQUIRED.filter((guard) => !wired.has(guard)).map((guard) => `${guard} is not executed by CI`);
  return out;
}

if (process.argv.includes("--selftest")) {
  const baseline = { fullyWired: [...REQUIRED], unaccounted: ["unrelated-repository-guard.mjs"] };
  if (!failures({ ...baseline, fullyWired: REQUIRED.slice(1) }).length) throw new Error("owned guard removal escaped");
  if (failures({ ...baseline, unaccounted: [...baseline.unaccounted, "another-unrelated-guard.mjs"] }).length) {
    throw new Error("unrelated repository growth failed focused registry");
  }
  console.log(`${LABEL} SELFTEST PASS — owned removal rejected; unrelated census growth accepted`);
  process.exit(0);
}

const problems = failures(classifyGuards());
if (problems.length) {
  console.error(`${LABEL} FAIL\n${problems.join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — ${REQUIRED.length} exact non-money connectivity guards execute in CI`);
