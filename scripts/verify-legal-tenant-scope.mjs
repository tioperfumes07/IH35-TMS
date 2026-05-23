#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGETS = [
  "apps/backend/src/legal/matters.routes.ts",
  "apps/backend/src/legal/contracts.routes.ts",
  "apps/backend/src/legal/templates.routes.ts",
];

function fail(message) {
  console.error(`verify:legal-tenant-scope — FAILED\n- ${message}`);
  process.exit(1);
}

for (const rel of TARGETS) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) fail(`missing required route file: ${rel}`);
  const text = fs.readFileSync(abs, "utf8");
  if (!text.includes("operating_company_id")) {
    fail(`${rel} must reference operating_company_id for tenant scoping`);
  }
}

console.log("verify:legal-tenant-scope — OK");
