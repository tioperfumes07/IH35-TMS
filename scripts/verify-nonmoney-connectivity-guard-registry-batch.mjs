#!/usr/bin/env node
// MATRIX-BUILT-OPTIONAL — CI-registration infrastructure; does not claim product Built credit.
import { classifyGuards } from "./verify-guard-wired.mjs";

const LABEL = "verify-nonmoney-connectivity-guard-registry-batch";
const MAX_REMAINING = 102;
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
  "verify-reports-runner-canonical-aliases.mjs",
  "verify-reports-saved-preset-connectivity.mjs",
  "verify-safety-eld-audit-connectivity.mjs",
  "verify-system-program-config-connectivity.mjs",
];

function failures(classification) {
  const wired = new Set(classification.fullyWired);
  const out = REQUIRED.filter((guard) => !wired.has(guard)).map((guard) => `${guard} is not executed by CI`);
  if (classification.unaccounted.length > MAX_REMAINING) out.push(`unaccounted guard census ${classification.unaccounted.length} exceeds ${MAX_REMAINING}`);
  return out;
}

if (process.argv.includes("--selftest")) {
  const baseline = { fullyWired: [...REQUIRED], unaccounted: Array.from({ length: MAX_REMAINING }, (_, i) => `other-${i}.mjs`) };
  for (const value of [{ ...baseline, fullyWired: REQUIRED.slice(1) }, { ...baseline, unaccounted: [...baseline.unaccounted, "regression.mjs"] }]) {
    if (!failures(value).length) throw new Error("planted defect escaped");
  }
  console.log(`${LABEL} SELFTEST PASS — 2/2 planted defects rejected`);
  process.exit(0);
}

const problems = failures(classifyGuards());
if (problems.length) {
  console.error(`${LABEL} FAIL\n${problems.join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — 15 non-money connectivity guards execute in CI; orphan census ratcheted at <=${MAX_REMAINING}`);
