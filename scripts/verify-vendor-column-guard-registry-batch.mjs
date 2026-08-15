#!/usr/bin/env node
// MATRIX-BUILT-OPTIONAL — CI-registration infrastructure; does not claim product Built credit.
import { classifyGuards } from "./verify-guard-wired.mjs";

const LABEL = "verify-vendor-column-guard-registry-batch";
const MAX_REMAINING = 188;
const REQUIRED = [
  "verify-insurance-policy-vendor-reverse.mjs", "verify-inventory-vendor-parts.mjs",
  "verify-legal-vendor-contract-reverse.mjs", "verify-legal-vendor-signer-creators.mjs",
  "verify-lists-vendor-search-and-create.mjs", "verify-maintenance-vendor-ap-reverse.mjs",
  "verify-maintenance-vendor-wiring.mjs", "verify-parts-inventory-vendor-reverse.mjs",
  "verify-vendor-detail-page-self-referential.mjs", "verify-vendor-inline-surface-linkage.mjs",
  "verify-vendor-master-detail-reverse-link.mjs", "verify-vendor-parts-history-linkage.mjs",
  "verify-vendor-preferred-parts-linkage.mjs", "verify-vendors-list-master-detail.mjs",
  "verify-vendors-reverse-link-detail-ap.mjs",
];

function failures(classification) {
  const wired = new Set(classification.fullyWired);
  const out = REQUIRED.filter((guard) => !wired.has(guard)).map((guard) => `${guard} is not executed by CI`);
  if (classification.unaccounted.length > MAX_REMAINING) out.push(`unaccounted guard census ${classification.unaccounted.length} exceeds ${MAX_REMAINING}`);
  return out;
}

if (process.argv.includes("--selftest")) {
  const baseline = { fullyWired: [...REQUIRED], unaccounted: Array.from({ length: MAX_REMAINING }, (_, i) => `other-${i}.mjs`) };
  const mutations = [
    { value: { ...baseline, fullyWired: REQUIRED.slice(1) } },
    { value: { ...baseline, unaccounted: [...baseline.unaccounted, "regression.mjs"] } },
  ];
  for (const mutation of mutations) if (!failures(mutation.value).length) throw new Error("planted defect escaped");
  console.log(`${LABEL} SELFTEST PASS — 2/2 planted defects rejected`);
  process.exit(0);
}
const problems = failures(classifyGuards());
if (problems.length) { console.error(`${LABEL} FAIL\n${problems.join("\n")}`); process.exit(1); }
console.log(`${LABEL} PASS — 15 vendor-column guards execute in CI; orphan census ratcheted at <=${MAX_REMAINING}`);
