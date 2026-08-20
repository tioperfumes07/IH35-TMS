#!/usr/bin/env node
// MATRIX-BUILT-OPTIONAL — CI-registration infrastructure; does not claim product Built credit.
import { classifyGuards } from "./verify-guard-wired.mjs";

const LABEL = "verify-nonmoney-reverse-link-guard-registry-batch";
const MAX_REMAINING = 117;
const REQUIRED = [
  "verify-arriving-soon-work-order-reverse.mjs", "verify-border-crossing-broker-linkage.mjs",
  "verify-complaint-linkage.mjs", "verify-docs-module-reverse-link-wired.mjs",
  "verify-entity-tasks-reverse-leaves.mjs", "verify-equipment-transfer-human-label.mjs",
  "verify-fleet-trailer-transfer-record-reverse.mjs",
  "verify-fleet-reverse-link-remainder.mjs", "verify-fleet-reverse-link-transfers.mjs",
  "verify-geofence-entitylink-drill.mjs", "verify-hos-violation-linkage.mjs",
  "verify-inline-surface-connectivity-routes.mjs", "verify-insurance-coi-policy-reverse.mjs",
  "verify-insurance-lawsuit-policy-reverse.mjs", "verify-insurance-policy-reverse-leaves.mjs",
  "verify-insurance-profile-reverse.mjs", "verify-insurance-reverse-link-detail-surfaces.mjs",
  "verify-legal-fuel-reverse-link-remainder.mjs", "verify-legal-matter-claim-linkage.mjs",
  "verify-legal-matter-lawsuit-writer-reverse.mjs", "verify-lists-reverse-link-remainder.mjs",
  "verify-maintenance-hidden-surface-reverse-links.mjs", "verify-maintenance-reverse-link-remainder.mjs",
  "verify-maintenance-source-work-order-reverse.mjs", "verify-maintenance-work-order-entity-drills.mjs",
  "verify-master-detail-reverse-leaves.mjs", "verify-profile-report-safety-reverse-drills.mjs",
  "verify-reports-reverse-link-batch.mjs", "verify-roster-reverse-link-leaves.mjs",
  "verify-safety-alert-profile-reverse.mjs", "verify-safety-incidents-reverse-link-wired.mjs",
  "verify-safety-reverse-link-list-surfaces.mjs", "verify-secondary-reverse-link-batch.mjs",
  "verify-system-audit-record-reverse.mjs", "verify-user-reverse-link-detail-sweep.mjs",
  "verify-user-reverse-link-vertical-sweep.mjs", "verify-warranty-claim-linkage.mjs",
  "verify-work-order-parts-history-linkage.mjs",
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
console.log(`${LABEL} PASS — 38 non-money reverse-link guards execute in CI; orphan census ratcheted at <=${MAX_REMAINING}`);
