#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const packagePath = path.join(root, "package.json");
const scriptPath = path.join(root, "scripts/db-verify-live-schema.mjs");

function fail(message) {
  console.error(`verify:live-db-schema-script-wiring — FAILED\n- ${message}`);
  process.exit(1);
}

if (!fs.existsSync(packagePath)) fail("package.json missing");
if (!fs.existsSync(scriptPath)) fail("scripts/db-verify-live-schema.mjs missing");

const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
if (!pkg.scripts || typeof pkg.scripts !== "object") {
  fail("package.json scripts section missing");
}
if (pkg.scripts["db:verify:live-schema"] !== "node scripts/db-verify-live-schema.mjs") {
  fail("package.json must expose db:verify:live-schema script");
}

const scriptSource = fs.readFileSync(scriptPath, "utf8");
if (!scriptSource.includes("_system._schema_migrations") || !scriptSource.includes("ih35_migrations.applied_migrations")) {
  fail("live-schema script must validate both migration ledgers");
}
if (!scriptSource.includes("REQUIRED_TABLES") || !scriptSource.includes("REQUIRED_COLUMNS")) {
  fail("live-schema script must define required tables/columns contracts");
}

console.log("verify:live-db-schema-script-wiring — OK");
