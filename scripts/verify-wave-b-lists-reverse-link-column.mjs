#!/usr/bin/env node
import fs from "node:fs";

const checks = [
  ["apps/frontend/src/pages/lists/names/NamesMasterHub.tsx", /LINKABLE_NAME_KINDS[\s\S]*customer:\s*"customer"[\s\S]*vendor:\s*"vendor"[\s\S]*driver:\s*"driver"/],
  ["apps/frontend/src/pages/lists/names/NamesMasterHub.tsx", /<EntityLink kind=\{kind\} id=\{row\.entity_id\} label=\{row\.display_name\}/],
  ["apps/frontend/src/pages/lists/names/BrokersListPage.tsx", /<EntityLink kind="customer" id=\{row\.id\} label=\{row\.name\}/],
  ["apps/frontend/src/pages/lists/names/BrokersListPage.tsx", /onRowClick=\{\(row\) => navigate\(`\/customers\/\$\{row\.id\}`\)\}/],
];

const failures = checks
  .filter(([file, pattern]) => !pattern.test(fs.readFileSync(file, "utf8")))
  .map(([file]) => `${file}: canonical lists reverse link missing`);

if (failures.length) {
  console.error(`verify-wave-b-lists-reverse-link-column FAIL:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`);
  process.exit(1);
}

console.log("verify-wave-b-lists-reverse-link-column PASS — Names Master and Brokers drill through canonical entity routes");
