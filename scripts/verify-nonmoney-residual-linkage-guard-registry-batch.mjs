#!/usr/bin/env node
// MATRIX-BUILT-OPTIONAL — CI-registration infrastructure; does not claim product Built credit.
import { classifyGuards } from "./verify-guard-wired.mjs";

const LABEL = "verify-nonmoney-residual-linkage-guard-registry-batch";
const REQUIRED = [
  "verify-dispatch-required-scenario-maint-honest.mjs",
  "verify-dispatch-reverse-link-queues.mjs",
  "verify-existing-fk-reverse-drills.mjs",
  "verify-inventory-inline-surface-applicability.mjs",
  "verify-safety-profile-error-contract.mjs",
  "verify-work-order-col-remainder.mjs",
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
console.log(`${LABEL} PASS — six exact residual non-money linkage guards execute in CI`);
