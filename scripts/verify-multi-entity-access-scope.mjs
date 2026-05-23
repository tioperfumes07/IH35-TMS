#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const routePath = path.join(repoRoot, "apps/backend/src/accounting/multi-entity/routes.ts");

function fail(message) {
  console.error("verify:multi-entity-access-scope — FAILED");
  console.error(`- ${message}`);
  process.exit(1);
}

if (!fs.existsSync(routePath)) {
  fail("missing apps/backend/src/accounting/multi-entity/routes.ts");
}

const source = fs.readFileSync(routePath, "utf8");
if (!/org\.user_company_access/.test(source)) {
  fail("multi-entity route must validate requested companies via org.user_company_access");
}
if (!/forbidden_company_scope/.test(source)) {
  fail("multi-entity route must block unauthorized company scopes");
}
if (!/withCurrentUser/.test(source)) {
  fail("multi-entity route must execute inside withCurrentUser context");
}

console.log("verify:multi-entity-access-scope — OK");
