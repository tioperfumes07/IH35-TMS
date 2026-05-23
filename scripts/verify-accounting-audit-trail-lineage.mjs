#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const routePath = path.join(process.cwd(), "apps/backend/src/accounting/audit-trail/routes.ts");
const servicePath = path.join(process.cwd(), "apps/backend/src/accounting/audit-trail/service.ts");
const pagePath = path.join(process.cwd(), "apps/frontend/src/pages/accounting/AccountingAuditTrailPage.tsx");

function fail(message) {
  console.error(`verify:accounting-audit-trail-lineage — FAILED\n- ${message}`);
  process.exit(1);
}

for (const file of [routePath, servicePath, pagePath]) {
  if (!fs.existsSync(file)) fail(`missing required file: ${file}`);
}

const routeSource = fs.readFileSync(routePath, "utf8");
const serviceSource = fs.readFileSync(servicePath, "utf8");
const pageSource = fs.readFileSync(pagePath, "utf8");

if (!routeSource.includes("/api/v1/accounting/audit-trail/source-lineage")) {
  fail("source-lineage endpoint must be registered");
}
if (!/jp\.source_transaction_type = \$2::text/.test(serviceSource)) {
  fail("lineage query must filter by source_transaction_type");
}
if (!/jp\.source_transaction_id = \$3::text/.test(serviceSource)) {
  fail("lineage query must filter by source_transaction_id");
}
if (!serviceSource.includes("accounting.transaction_source_links")) {
  fail("lineage query must include transaction_source_links join");
}
if (!pageSource.includes("Source lineage")) {
  fail("audit trail page must expose source lineage action");
}

console.log("verify:accounting-audit-trail-lineage — OK");
