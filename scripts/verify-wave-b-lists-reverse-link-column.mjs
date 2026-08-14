#!/usr/bin/env node
import fs from "node:fs";

const checks = [
  ["apps/frontend/src/pages/lists/names/NamesMasterHub.tsx", /LINKABLE_NAME_KINDS[\s\S]*customer:\s*"customer"[\s\S]*vendor:\s*"vendor"[\s\S]*driver:\s*"driver"/],
  // Allow attrs (data-testid / className / multiline) between EntityLink and kind/id/label.
  [
    "apps/frontend/src/pages/lists/names/NamesMasterHub.tsx",
    /<EntityLink[\s\S]{0,160}kind=\{kind\}[\s\S]{0,80}id=\{row\.entity_id\}[\s\S]{0,80}label=\{row\.display_name\}/,
  ],
  [
    "apps/frontend/src/pages/lists/names/BrokersListPage.tsx",
    /<EntityLink[\s\S]{0,120}kind="customer"[\s\S]{0,80}id=\{row\.id\}[\s\S]{0,80}label=\{row\.name\}/,
  ],
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
