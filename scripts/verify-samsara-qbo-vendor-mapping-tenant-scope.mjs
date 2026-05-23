#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGET = path.join(ROOT, "apps", "backend", "src", "integrations", "samsara", "vendor-mapping.routes.ts");

function fail(message) {
  console.error(`verify:samsara-qbo-vendor-mapping-tenant-scope — FAILED\n- ${message}`);
  process.exit(1);
}

if (!fs.existsSync(TARGET)) {
  fail("apps/backend/src/integrations/samsara/vendor-mapping.routes.ts not found");
}

const text = fs.readFileSync(TARGET, "utf8");

if (!text.includes("withCompanyScope(user.uuid, parsed.data.operating_company_id")) {
  fail("route must execute inside withCompanyScope using operating_company_id");
}

const queryRegex = /client\.query(?:<[^>]+>)?\(\s*`([\s\S]*?)`/g;
const sqlBlocks = [];
let match;
while ((match = queryRegex.exec(text)) !== null) {
  sqlBlocks.push(match[1]);
}

if (sqlBlocks.length === 0) {
  fail("no SQL query blocks found");
}

for (const [idx, sql] of sqlBlocks.entries()) {
  const delegates = /\bto_regclass\(/.test(sql);
  if (!delegates && !/operating_company_id/.test(sql)) {
    fail(`SQL block #${idx + 1} must include operating_company_id tenant filter`);
  }
}

if (!text.includes("sd.operating_company_id = $1::uuid")) {
  fail("samsara_drivers source must filter by sd.operating_company_id = $1::uuid");
}
if (!text.includes("md.operating_company_id = $1::uuid")) {
  fail("mdata.drivers joins must filter by md.operating_company_id = $1::uuid");
}
if (!text.includes("qv.operating_company_id = $1::uuid")) {
  fail("mdata.qbo_vendors joins must filter by qv.operating_company_id = $1::uuid");
}
if (!text.includes("sd.operating_company_id = md.operating_company_id")) {
  fail("duplicate mapping join must enforce sd.operating_company_id = md.operating_company_id");
}

console.log("verify:samsara-qbo-vendor-mapping-tenant-scope — OK");
