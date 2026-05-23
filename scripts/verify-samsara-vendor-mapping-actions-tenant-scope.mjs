#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGET = path.join(ROOT, "apps", "backend", "src", "integrations", "samsara", "vendor-mapping-actions.routes.ts");

function fail(message) {
  console.error(`verify:samsara-vendor-mapping-actions-tenant-scope — FAILED\n- ${message}`);
  process.exit(1);
}

if (!fs.existsSync(TARGET)) {
  fail("apps/backend/src/integrations/samsara/vendor-mapping-actions.routes.ts not found");
}

const text = fs.readFileSync(TARGET, "utf8");

const requiredRoutes = [
  "/api/v1/samsara/vendor-mapping/link",
  "/api/v1/samsara/vendor-mapping/dedupe",
  "/api/v1/samsara/vendor-mapping/confirm-mismatch",
];
for (const route of requiredRoutes) {
  if (!text.includes(`app.post("${route}"`)) fail(`missing POST route: ${route}`);
}

if (!text.includes("withCompanyScope(user.uuid, parsed.data.operating_company_id")) {
  fail("all endpoints must execute inside withCompanyScope using operating_company_id");
}
if (!text.includes("hasCompanyAccess")) {
  fail("cross-tenant refusal check is required (hasCompanyAccess)");
}
if (!text.includes("company_id = $2::uuid")) {
  fail("company access query must be tenant-scoped by company_id");
}

const sqlBlocks = [];
const queryRegex = /client\.query(?:<[^>]+>)?\(\s*`([\s\S]*?)`/g;
let match;
while ((match = queryRegex.exec(text)) !== null) {
  sqlBlocks.push(match[1]);
}
if (sqlBlocks.length === 0) fail("no SQL query blocks found");

for (const [idx, sql] of sqlBlocks.entries()) {
  const allowsTenantless = /audit\.append_event|org\.user_company_access/.test(sql);
  if (!allowsTenantless && !/operating_company_id/.test(sql)) {
    fail(`SQL block #${idx + 1} must include operating_company_id tenant scoping`);
  }
}

const auditWrites = (text.match(/audit\.append_event/g) ?? []).length;
if (auditWrites < 1) fail("audit.append_event must be used for mutations");
if (!text.includes('"vendor_mapping_resolution"') || !text.includes('"info"')) {
  fail("audit event_class=vendor_mapping_resolution and severity=info are required");
}

if (!text.includes("sd.operating_company_id = $1::uuid")) {
  fail("samsara_drivers usage must include sd.operating_company_id = $1::uuid");
}
if (!text.includes("md.operating_company_id = $1::uuid")) {
  fail("mdata.drivers usage must include md.operating_company_id = $1::uuid");
}
if (!text.includes("qv.operating_company_id = $1::uuid")) {
  fail("mdata.qbo_vendors usage must include qv.operating_company_id = $1::uuid");
}

console.log("verify:samsara-vendor-mapping-actions-tenant-scope — OK");
