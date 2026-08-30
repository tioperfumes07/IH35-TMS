#!/usr/bin/env node
// MATRIX-BUILT-OPTIONAL — CI-registration infrastructure; does not claim product Built credit.
import { classifyGuards } from "./verify-guard-wired.mjs";
const LABEL = "verify-trailer-column-guard-registry-batch";
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
  return out;
}
if (process.argv.includes("--selftest")) {
  const baseline = { fullyWired: [...REQUIRED], unaccounted: ["unrelated.mjs"] };
  if (!failures({ ...baseline, fullyWired: REQUIRED.slice(1) }).length) throw new Error("required-member mutation escaped");
  if (failures({ ...baseline, unaccounted: [...baseline.unaccounted, "another-unrelated.mjs"] }).length) throw new Error("unrelated census growth failed focused registry");
  console.log(`${LABEL} SELFTEST PASS — owned removal rejected; unrelated census growth accepted`); process.exit(0);
}
const problems = failures(classifyGuards());
if (problems.length) { console.error(`${LABEL} FAIL\n${problems.join("\n")}`); process.exit(1); }
console.log(`${LABEL} PASS — ${REQUIRED.length} exact trailer-column guards execute in CI`);
