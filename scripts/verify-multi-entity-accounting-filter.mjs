#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const routePath = path.join(repoRoot, "apps/backend/src/accounting/multi-entity/routes.ts");

function fail(message) {
  console.error("verify:multi-entity-accounting-filter — FAILED");
  console.error(`- ${message}`);
  process.exit(1);
}

if (!fs.existsSync(routePath)) {
  fail("missing apps/backend/src/accounting/multi-entity/routes.ts");
}

const source = fs.readFileSync(routePath, "utf8");
if (!/operating_company_id = ANY\(\$1::uuid\[\]\)/.test(source)) {
  fail("consolidated queries must filter accounting rows by requested operating_company_ids");
}
if (!/entry_date BETWEEN \$2::date AND \$3::date/.test(source)) {
  fail("consolidated queries must apply requested date range");
}

console.log("verify:multi-entity-accounting-filter — OK");
