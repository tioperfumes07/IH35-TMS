#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.VERIFY_SAFETY_EVENTS_AUDIT_ROOT ?? process.cwd();
const routeFiles = [
  "apps/backend/src/safety/accidents.routes.ts",
  "apps/backend/src/safety/citations.routes.ts",
  "apps/backend/src/safety/violations.routes.ts",
  "apps/backend/src/safety/roadside.routes.ts",
  "apps/backend/src/safety/fmcsa.routes.ts",
  "apps/backend/src/safety/event-documents.routes.ts",
].map((file) => path.resolve(ROOT, file));

function read(filePath) {
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf8");
}

function main() {
  const source = routeFiles.map((file) => read(file)).join("\n");
  const failures = [];

  const checks = [
    { id: "append-crud-audit-used", pattern: /appendCrudAudit\(/ },
    { id: "company-scope-used", pattern: /withCompanyScope\(/ },
    { id: "operating-company-id-audit", pattern: /operating_company_id/ },
    { id: "before-after-audit", pattern: /before:\s*null[\s\S]*after:/ },
  ];

  for (const check of checks) {
    if (!check.pattern.test(source)) failures.push(`missing_pattern:${check.id}`);
  }

  const auditCount = (source.match(/appendCrudAudit\(/g) ?? []).length;
  if (auditCount < routeFiles.length) {
    failures.push("insufficient_audit_emissions");
  }

  if (failures.length > 0) {
    console.error("verify:safety-events-audit-chain FAILED");
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
  }

  console.log("verify:safety-events-audit-chain OK");
}

main();
