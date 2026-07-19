#!/usr/bin/env node
// verify:reports-library-routes-no-any-client
// Guard: reports/library.routes.ts relationExists/columnExists must not use client: any.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/backend/src/reports/library.routes.ts";

if (process.argv.includes("--selftest")) {
  const planted = "async function relationExists(client: any, qualifiedName: string) {}";
  if (!/client:\s*any/.test(planted)) {
    console.error("selftest FAIL");
    process.exit(1);
  }
  console.log("verify:reports-library-routes-no-any-client --selftest PASS");
  process.exit(0);
}

const src = fs.readFileSync(path.join(ROOT, FILE), "utf8");
const failures = [];
if (/\(.*client:\s*any[\s,)]/.test(src) || /async function \w+\(client:\s*any/.test(src)) {
  failures.push("library.routes.ts must not declare helpers with client: any");
}
if (!/type Queryable\s*=/.test(src)) {
  failures.push("library.routes.ts must declare a Queryable type for DB helpers");
}
if (!/relationExists\(client:\s*Queryable/.test(src) || !/columnExists\(client:\s*Queryable/.test(src)) {
  failures.push("relationExists and columnExists must take Queryable");
}

if (failures.length > 0) {
  console.error("verify:reports-library-routes-no-any-client FAIL:");
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log("verify:reports-library-routes-no-any-client PASS");
