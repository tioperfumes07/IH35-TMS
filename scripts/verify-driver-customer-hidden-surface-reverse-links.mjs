#!/usr/bin/env node
/** @matrix-built {"modules":["fleet"],"cols":["reverse_link"],"leafRe":"^unit\.profile\.driver_assign$","task":"LINK-F5123-HIDDEN-SURFACE-REVERSE","vertical":"class-sweep"} */
/** @matrix-built {"modules":["compliance"],"cols":["reverse_link"],"leafRe":"^(tab\.hos_tracker|fleet\.hos_board)$","task":"LINK-F5123-HIDDEN-SURFACE-REVERSE","vertical":"class-sweep"} */
/** @matrix-built {"modules":["reports"],"cols":["reverse_link"],"leafRe":"^report\.customer_profitability$","task":"LINK-F5123-HIDDEN-SURFACE-REVERSE","vertical":"class-sweep"} */

import fs from "node:fs";

const sources = {
  fleet: fs.readFileSync("apps/frontend/src/pages/units/UnitDriverHistoryStrip.tsx", "utf8"),
  compliance: fs.readFileSync("apps/frontend/src/pages/compliance/HosTrackerSection.tsx", "utf8"),
  eld: fs.readFileSync("apps/frontend/src/pages/eld/tabs/LiveDutyTab.tsx", "utf8"),
  reports: fs.readFileSync("apps/frontend/src/pages/reports/CustomerProfitabilityPage.tsx", "utf8"),
  entityLink: fs.readFileSync("apps/frontend/src/components/shared/EntityLink.tsx", "utf8"),
};

const checks = [
  ["fleet", /kind="driver" id=\{row\.driver_id\}/, "unit assignment history drills to its driver"],
  ["compliance", /kind="driver" id=\{selectedDriver\.driver_id\}/, "HOS detail drawer drills to its driver"],
  ["eld", /kind="driver" id=\{row\.driver_id\}/, "ELD live-duty roster drills to its driver"],
  ["reports", /kind="customer" id=\{r\.customer_id\}/, "customer profitability drills to its customer"],
  ["entityLink", /case "driver":[\s\S]*?return `\/drivers\/\$\{id\}`/, "driver links resolve to the mounted profile"],
  ["entityLink", /case "customer":[\s\S]*?return `\/customers\/\$\{id\}`/, "customer links resolve to the mounted profile"],
];

const failures = (candidate) => checks
  .filter(([key, pattern]) => !pattern.test(candidate[key]))
  .map(([, , label]) => label);

const found = failures(sources);
if (found.length) {
  console.error(`verify-driver-customer-hidden-surface-reverse-links: FAIL — ${found.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--self-test")) {
  for (const [key, pattern, label] of checks) {
    const mutant = { ...sources, [key]: sources[key].replace(pattern, "/* planted defect */") };
    if (!failures(mutant).includes(label)) {
      console.error(`verify-driver-customer-hidden-surface-reverse-links: SELF-TEST FAIL — ${label}`);
      process.exit(1);
    }
  }
  console.log(`verify-driver-customer-hidden-surface-reverse-links: SELF-TEST PASS — ${checks.length} planted defects rejected`);
}

console.log(`verify-driver-customer-hidden-surface-reverse-links: PASS — ${checks.length} cross-module reverse-link invariants`);
