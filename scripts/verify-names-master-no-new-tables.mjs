#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  console.error(`verify:names-master-no-new-tables FAIL: ${message}`);
  process.exit(1);
}

const routes = fs.readFileSync(path.join(ROOT, "apps/backend/src/lists/names-master.routes.ts"), "utf8");
if (/CREATE\s+TABLE/i.test(routes)) fail("names-master.routes.ts must not CREATE TABLE");

const migrations = path.join(ROOT, "db/migrations");
if (fs.existsSync(migrations)) {
  for (const file of fs.readdirSync(migrations)) {
    if (!file.endsWith(".sql")) continue;
    if (/names[_-]?master/i.test(file)) {
      fail(`unexpected names master migration ${file}`);
    }
  }
}

console.log("verify:names-master-no-new-tables PASS");
