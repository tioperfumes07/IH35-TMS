#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";

const routePath = "apps/backend/src/mdata/units.routes.ts";
let source = fs.readFileSync(routePath, "utf8");
const checks = [
  ["create", /appendCrudAudit\(client, authUser\.uuid, "mdata\.units\.created", \{\s*operating_company_id: operatingCompanyId,/],
  ["edit\/status", /appendCrudAudit\(client, authUser\.uuid, auditAction, \{\s*operating_company_id: scopedCompanyId,/],
  ["deactivate", /"mdata\.units\.deactivated",\s*\{\s*operating_company_id: scopedCompanyId,/],
  ["quick availability", /"mdata\.unit\.quick_availability_changed",\s*\{\s*operating_company_id: scopedCompanyId,\s*resource_id: row\.id,\s*resource_type: "mdata\.units",/],
];
if (process.argv.includes("--selftest")) {
  source = source.replace("operating_company_id: operatingCompanyId,", "");
  if (checks[0][1].test(source)) process.exit(1);
  console.log("PASS selftest: planted create-audit company-scope defect detected");
  process.exit(0);
}
const failures = checks.filter(([, pattern]) => !pattern.test(source)).map(([name]) => name);
if (failures.length) {
  console.error(`FAIL unit lifecycle audit company scope: ${failures.join(", ")}`);
  process.exit(1);
}
console.log(`PASS unit lifecycle audit company scope ${checks.length}/${checks.length}`);
