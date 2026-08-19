#!/usr/bin/env node
/** @matrix-built {"modules":["lists","safety"],"cols":["customer"],"leafRe":"^(hub\\.names_search|cargo_claims\\.(list|create)|complaints\\.list)$","task":"WAVE-A-customer-remainder-exact-surfaces","vertical":"column-wave"} */
import fs from "node:fs";

const LABEL = "verify-wave-a-customer-remainder-column";
const checks = [
  { file: "apps/frontend/src/pages/lists/names/NamesMasterHub.tsx", pattern: /customer:\s*"customer"/, label: "names kind mapping" },
  // Independently converged fix (CC-2 had the same re-anchor; kept this already-integrated,
  // slightly more general version) — LV-LISTS-NAMES-MASTER-DEAD-TOMBSTONE-LINK honesty refactor.
  { file: "apps/frontend/src/pages/lists/names/NamesMasterHub.tsx", pattern: /<EntityLink[\s\S]{0,200}kind=\{kind\}[\s\S]{0,80}id=\{row\.entity_id\}/, label: "names canonical drill" },
  { file: "apps/frontend/src/pages/lists/names/BrokersListPage.tsx", pattern: /<EntityLink kind="customer" id=\{row\.id\}/, label: "broker customer drill" },
  { file: "apps/frontend/src/pages/safety/tabs/ComplaintsTab.tsx", pattern: /<EntityLink[\s\S]*kind="customer"[\s\S]*id=\{String\(row\.complainant_customer_id\)\}/, label: "complaint customer drill" },
  { file: "apps/frontend/src/pages/safety/tabs/ComplaintsTab.tsx", pattern: /body\[complainantIdentityKey\]\s*=\s*complainantIdentityValue/, label: "complaint customer payload" },
  { file: "apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx", pattern: /claimant_customer_id:\s*form\.claimantCustomerId\s*\|\|\s*null/, label: "cargo customer payload" },
  { file: "apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx", pattern: /<EntityLink[\s\S]*kind="customer"[\s\S]*id=\{String\(detail\.claimant_customer_id\)\}/, label: "cargo customer drill" },
  { file: "apps/frontend/src/pages/safety/tabs/GeofenceBreachesTab.tsx", pattern: /<EntityLink kind="customer" id=\{event\.customer_id\}/, label: "geofence customer drill" },
];

const sourceFiles = [...new Set(checks.map(({ file }) => file))];
const loadSources = () => Object.fromEntries(sourceFiles.map((file) => [file, fs.readFileSync(file, "utf8")]));

function audit(sources) {
  return checks
    .filter(({ file, pattern }) => !pattern.test(sources[file]))
    .map(({ file, label }) => `${label}: ${file}: customer FK/link contract missing`);
}

const sources = loadSources();
if (process.argv.includes("--selftest")) {
  for (const check of checks) {
    const match = sources[check.file].match(check.pattern);
    if (!match?.[0]) {
      console.error(`${LABEL} SELFTEST FAIL — ${check.label}: mutation anchor missing`);
      process.exit(1);
    }
    const mutated = { ...sources, [check.file]: sources[check.file].replace(match[0], "__PLANTED_CUSTOMER_CONTRACT_REMOVED__") };
    if (!audit(mutated).some((failure) => failure.startsWith(`${check.label}:`))) {
      console.error(`${LABEL} SELFTEST FAIL — ${check.label}: mutation escaped`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${checks.length}/${checks.length} exact customer mutations detected`);
  process.exit(0);
}

const failures = audit(sources);
if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — Lists and Safety customer FKs and reverse links ratcheted`);
