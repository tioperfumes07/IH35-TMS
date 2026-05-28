#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGET = path.join(ROOT, "apps/backend/src/docs/docs.routes.ts");

function fail(message) {
  console.error(`verify:docs-tenant-scope — FAILED\n- ${message}`);
  process.exit(1);
}

if (!fs.existsSync(TARGET)) fail("apps/backend/src/docs/docs.routes.ts not found");

const text = fs.readFileSync(TARGET, "utf8");
const listRoute = text.match(/app\.get\("\/api\/v1\/docs"[\s\S]*?\n  \}\);/m);
if (!listRoute) fail("could not locate /api/v1/docs list route");
if (!listRoute[0].includes("operating_company_id")) {
  fail("list route must include operating_company_id tenant scope filter");
}

const detailRoute = text.match(/app\.get\("\/api\/v1\/docs\/:id"[\s\S]*?\n  \}\);/m);
if (!detailRoute) fail("could not locate /api/v1/docs/:id detail route");
if (!detailRoute[0].includes("operating_company_id")) {
  fail("detail route must include operating_company_id tenant scope filter");
}

if (!text.includes("resolveOperatingCompanyId")) {
  fail("routes file must resolve company context from authenticated user");
}

console.log("verify:docs-tenant-scope — OK");
