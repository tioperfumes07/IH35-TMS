#!/usr/bin/env node
// MATRIX-BUILT-OPTIONAL — CI-registration infrastructure; does not claim product Built credit.
import { classifyGuards } from "./verify-guard-wired.mjs";
const LABEL = "verify-trailer-column-guard-registry-batch";
const MAX_REMAINING = 154;
const REQUIRED = [
  "verify-dispatch-trailer-drawer-assign-transfer.mjs", "verify-equipment-transfer-trailer-linkage.mjs",
  "verify-fleet-roster-trailer-edit-and-transfer-link.mjs", "verify-fleet-roster-trailer-kind-wiring.mjs",
  "verify-fleet-trailer-modals-and-reefer.mjs", "verify-fuel-insurance-maintenance-trailer-create.mjs",
  "verify-legal-matter-trailer-linkage.mjs", "verify-quick-assign-trailer-linkage.mjs",
  "verify-safety-trailer-incident-wiring.mjs", "verify-trailer-oem-reference-applicability.mjs",
  "verify-trailer-profile-page-self-referential.mjs", "verify-trailer-tire-program-linkage.mjs",
];
function failures(classification) {
  const wired = new Set(classification.fullyWired);
  const out = REQUIRED.filter((guard) => !wired.has(guard)).map((guard) => `${guard} is not executed by CI`);
  if (classification.unaccounted.length > MAX_REMAINING) out.push(`unaccounted guard census ${classification.unaccounted.length} exceeds ${MAX_REMAINING}`);
  return out;
}
if (process.argv.includes("--selftest")) {
  const baseline = { fullyWired: [...REQUIRED], unaccounted: Array.from({ length: MAX_REMAINING }, (_, i) => `other-${i}.mjs`) };
  for (const value of [{ ...baseline, fullyWired: REQUIRED.slice(1) }, { ...baseline, unaccounted: [...baseline.unaccounted, "regression.mjs"] }]) if (!failures(value).length) throw new Error("planted defect escaped");
  console.log(`${LABEL} SELFTEST PASS — 2/2 planted defects rejected`); process.exit(0);
}
const problems = failures(classifyGuards());
if (problems.length) { console.error(`${LABEL} FAIL\n${problems.join("\n")}`); process.exit(1); }
console.log(`${LABEL} PASS — 12 trailer-column guards execute in CI; orphan census ratcheted at <=${MAX_REMAINING}`);
