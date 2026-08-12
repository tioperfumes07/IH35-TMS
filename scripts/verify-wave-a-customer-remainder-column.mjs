#!/usr/bin/env node
/** @matrix-built {"modules":["lists","safety"],"cols":["customer"],"leafRe":".*","task":"WAVE-A-customer-remainder","vertical":"column-wave"} */
import fs from "node:fs";

const checks = [
  ["apps/frontend/src/pages/lists/names/NamesMasterHub.tsx", /customer:\s*"customer"/],
  ["apps/frontend/src/pages/lists/names/NamesMasterHub.tsx", /<EntityLink kind=\{kind\} id=\{row\.entity_id\}/],
  ["apps/frontend/src/pages/lists/names/BrokersListPage.tsx", /<EntityLink kind="customer" id=\{row\.id\}/],
  ["apps/frontend/src/pages/safety/tabs/ComplaintsTab.tsx", /<EntityLink[\s\S]*kind="customer"[\s\S]*id=\{String\(row\.complainant_customer_id\)\}/],
  ["apps/frontend/src/pages/safety/tabs/ComplaintsTab.tsx", /body\[complainantIdentityKey\]\s*=\s*complainantIdentityValue/],
  ["apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx", /claimant_customer_id:\s*form\.claimantCustomerId\s*\|\|\s*null/],
  ["apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx", /<EntityLink[\s\S]*kind="customer"[\s\S]*id=\{String\(detail\.claimant_customer_id\)\}/],
  ["apps/frontend/src/pages/safety/tabs/GeofenceBreachesTab.tsx", /<EntityLink kind="customer" id=\{event\.customer_id\}/],
];

const failures = checks
  .filter(([file, pattern]) => !pattern.test(fs.readFileSync(file, "utf8")))
  .map(([file]) => `${file}: customer FK/link contract missing`);

if (failures.length) {
  console.error(`verify-wave-a-customer-remainder-column FAIL:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`);
  process.exit(1);
}

console.log("verify-wave-a-customer-remainder-column PASS — Lists and Safety customer FKs and reverse links ratcheted");
