#!/usr/bin/env node
/** @matrix-built {"modules":["home"],"cols":["reverse_link"],"leafRe":"^role\\.(owner|default)$","task":"HOME-DRIVER-REVERSE-LEAVES","vertical":"column-wave"} */
/** @matrix-built {"modules":["drivers"],"cols":["reverse_link"],"leafRe":"^profiles\\.detail$","task":"HOME-DRIVER-REVERSE-LEAVES","vertical":"column-wave"} */

import fs from "node:fs";

const sources = {
  card: fs.readFileSync("apps/frontend/src/components/home/DriverDaySummaryCard.tsx", "utf8"),
  owner: fs.readFileSync("apps/frontend/src/pages/home/OwnerHome.tsx", "utf8"),
  fallback: fs.readFileSync("apps/frontend/src/pages/home/roles/DefaultHome.tsx", "utf8"),
  api: fs.readFileSync("apps/frontend/src/api/home.ts", "utf8"),
  route: fs.readFileSync("apps/backend/src/telematics/driver-day-summary.routes.ts", "utf8"),
};

const checks = [
  ["card", /fetchDriverDaySummary\(operatingCompanyId \?\? "", date\)/, "driver summary passes company scope"],
  ["card", /kind="driver"[\s\S]*id=\{row\.driver_id\}/, "driver summary rows drill to driver"],
  ["card", /Couldn't load summary right now\.[\s\S]*query\.refetch\(\)/, "driver summary error is retryable"],
  ["owner", /listPendingOwnerApproval\(selectedCompanyId!\)/, "owner approvals read is company-scoped"],
  ["owner", /kind="driver"[\s\S]*id=\{String\(r\.driver_id \?\? ""\)\}/, "owner approval rows drill to driver"],
  ["fallback", /listPendingOwnerApproval\(selectedCompanyId!\)/, "default owner view read is company-scoped"],
  ["fallback", /kind="driver"[\s\S]*id=\{String\(r\.driver_id \?\? ""\)\}/, "default owner rows drill to driver"],
  ["api", /withCompany\(`\/api\/v1\/telematics\/driver-day-summary\?date=\$\{encodeURIComponent\(date\)\}`,[ ]*companyId\)/, "driver summary request carries company"],
  ["route", /setScopedCompanyContext\(client, user\.uuid, operatingCompanyId\)/, "driver summary backend installs company scope"],
  ["route", /DRIVER_DAY_SUMMARY_SQL, \[operatingCompanyId, serviceDate\]/, "driver summary query binds company"],
];

const failures = (candidate) => checks
  .filter(([key, pattern]) => !pattern.test(candidate[key]))
  .map(([, , label]) => label);

const found = failures(sources);
if (found.length) {
  console.error(`verify-home-driver-reverse-leaves: FAIL — ${found.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--self-test")) {
  for (const [key, pattern, label] of checks) {
    const mutant = { ...sources, [key]: sources[key].replace(new RegExp(pattern.source, `${pattern.flags}g`), "/* planted defect */") };
    if (!failures(mutant).includes(label)) {
      console.error(`verify-home-driver-reverse-leaves: SELF-TEST FAIL — ${label}`);
      process.exit(1);
    }
  }
  console.log(`verify-home-driver-reverse-leaves: SELF-TEST PASS — ${checks.length} planted defects rejected`);
}

console.log(`verify-home-driver-reverse-leaves: PASS — ${checks.length} home/driver reverse invariants`);
