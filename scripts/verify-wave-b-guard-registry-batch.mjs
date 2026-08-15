#!/usr/bin/env node
// MATRIX-BUILT-OPTIONAL — CI-registration infrastructure; does not claim product Built credit.
import { classifyGuards } from "./verify-guard-wired.mjs";

const LABEL = "verify-wave-b-guard-registry-batch";
const MAX_REMAINING = 266;
const REQUIRED = [
  "verify-wave-b-acct-conn-closeout.mjs",
  "verify-wave-b-acct-conn-hub-audit.mjs",
  "verify-wave-b-acct-connectivity-remainder.mjs",
  "verify-wave-b-connectivity-all-modules.mjs",
  "verify-wave-b-dispatch-connectivity-remainder.mjs",
  "verify-wave-b-factoring-banking-drivers-connectivity.mjs",
  "verify-wave-b-lists-reverse-link-column.mjs",
  "verify-wave-b-lists-reverse-link.mjs",
  "verify-wave-b-reverse-link-all-modules.mjs",
  "verify-wave-b-reverse-link-column.mjs",
  "verify-wave-b-safety-connectivity-lists.mjs",
  "verify-wave-b-safety-connectivity-remainder-a.mjs",
  "verify-wave-b-safety-connectivity-remainder-b.mjs",
  "verify-wave-b-safety-connectivity-remainder-c.mjs",
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
console.log(`${LABEL} PASS — 14 Wave B vertical guards execute in CI; orphan census ratcheted at <=${MAX_REMAINING}`);
