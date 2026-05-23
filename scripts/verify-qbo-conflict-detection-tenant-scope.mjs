#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGET = path.join(ROOT, "apps", "backend", "src", "qbo", "sync-conflict-detection.routes.ts");

function fail(message) {
  console.error(`verify:qbo-conflict-detection-tenant-scope — FAILED\n- ${message}`);
  process.exit(1);
}

if (!fs.existsSync(TARGET)) {
  fail("apps/backend/src/qbo/sync-conflict-detection.routes.ts not found");
}

const text = fs.readFileSync(TARGET, "utf8");
const routeMatch = text.match(/app\.get\("\/api\/v1\/qbo\/sync-conflicts"[\s\S]*?\n  \}\);/m);
if (!routeMatch) {
  fail("could not locate /api/v1/qbo/sync-conflicts route");
}

const routeBlock = routeMatch[0];

if (!/operating_company_id:\s*z\.string\(\)\.uuid\(\)/.test(text)) {
  fail("query schema must require operating_company_id uuid");
}
if (!/limit:\s*z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(50\)/.test(text)) {
  fail("limit must be capped at 50");
}
if (/OFFSET/i.test(routeBlock)) {
  fail("cursor pagination required; OFFSET is not allowed");
}
if (!/cursor:\s*z\.string\(\)\.optional\(\)/.test(text) || !/parseCursor/.test(routeBlock)) {
  fail("route must support and parse cursor");
}
if ((text.match(/m\.operating_company_id\s*=\s*\$1::uuid/g) ?? []).length < 4) {
  fail("entity queries must filter by operating_company_id");
}
if (!/ORDER BY COALESCE\(m\.last_seen_at, m\.mirrored_at, m\.updated_at, m\.created_at\) DESC, m\.id DESC/.test(routeBlock)) {
  fail("query must use keyset order for cursor pagination");
}

console.log("verify:qbo-conflict-detection-tenant-scope — OK");
