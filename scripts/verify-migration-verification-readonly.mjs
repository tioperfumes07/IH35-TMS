#!/usr/bin/env node
import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync(
  new URL("../apps/backend/src/lib/migration-verification.ts", import.meta.url),
  "utf8",
);

function verify(text) {
  assert.match(text, /SELECT to_regclass\('_system\._schema_migrations'\)/);
  assert.doesNotMatch(text, /CREATE\s+SCHEMA/i);
  assert.doesNotMatch(text, /CREATE\s+TABLE/i);
}

verify(source);
if (process.argv.includes("--selftest")) {
  for (const mutation of [
    source.replace("const exists =", "await client.query(`CREATE SCHEMA IF NOT EXISTS _system`);\n    const exists ="),
    source.replace("const exists =", "await client.query(`CREATE TABLE _system.x(id int)`);\n    const exists ="),
    source.replace("SELECT to_regclass('_system._schema_migrations')", "SELECT false"),
  ]) assert.throws(() => verify(mutation));
  console.log("verify-migration-verification-readonly selftest: PASS (3 mutations rejected)");
} else {
  console.log("verify-migration-verification-readonly: PASS");
}
