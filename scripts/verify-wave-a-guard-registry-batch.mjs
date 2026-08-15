#!/usr/bin/env node
// MATRIX-BUILT-OPTIONAL — CI-registration infrastructure; does not claim product Built credit.
import { classifyGuards } from "./verify-guard-wired.mjs";

const LABEL = "verify-wave-a-guard-registry-batch";
const MAX_REMAINING = 280;
const REQUIRED = [
  "verify-customer-column-remaining-modules.mjs",
  "verify-driver-column-remaining-modules.mjs",
  "verify-unit-column-remaining-modules.mjs",
  "verify-vendor-column-remaining-modules.mjs",
  "verify-wave-a-customer-all-modules.mjs",
  "verify-wave-a-customer-column.mjs",
  "verify-wave-a-customer-remainder-column.mjs",
  "verify-wave-a-driver-all-modules.mjs",
  "verify-wave-a-driver-column.mjs",
  "verify-wave-a-lists-driver-column.mjs",
  "verify-wave-a-load-all-modules.mjs",
  "verify-wave-a-load-column.mjs",
  "verify-wave-a-load-remainder.mjs",
  "verify-wave-a-trailer-all-modules.mjs",
  "verify-wave-a-trailer-column.mjs",
  "verify-wave-a-unit-all-modules.mjs",
  "verify-wave-a-unit-column.mjs",
  "verify-wave-a-vendor-all-modules.mjs",
  "verify-wave-a-vendor-column.mjs",
];

function failures(classification) {
  const wired = new Set(classification.fullyWired);
  const missing = REQUIRED.filter((guard) => !wired.has(guard));
  const out = missing.map((guard) => `${guard} is not executed by CI`);
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
    {
      name: "orphan census regresses",
      value: { ...baseline, unaccounted: [...baseline.unaccounted, "regression.mjs"] },
    },
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
console.log(`${LABEL} PASS — 19 Wave A vertical guards execute in CI; orphan census ratcheted at <=${MAX_REMAINING}`);
