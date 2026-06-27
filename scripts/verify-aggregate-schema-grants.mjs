#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "apps/backend/src");
const MIGRATIONS = path.join(ROOT, "db/migrations");
const RUNTIME_ROLE = "ih35_app";
const SKIP_SCHEMAS = new Set([
  "information_schema",
  "pg_catalog",
  "_system",
  "ih35_migrations",
  "public",
  "views",
]);

function walkTs(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walkTs(p, out);
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

const migrationSql = fs
  .readdirSync(MIGRATIONS)
  .filter((n) => n.endsWith(".sql"))
  .map((n) => fs.readFileSync(path.join(MIGRATIONS, n), "utf8"))
  .join("\n");

const schemas = new Set();
for (const file of walkTs(SRC)) {
  const src = fs.readFileSync(file, "utf8");
  for (const m of src.matchAll(/\bFROM\s+([a-z_][a-z0-9_]*)\./gi)) {
    schemas.add(m[1].toLowerCase());
  }
  for (const m of src.matchAll(/\bJOIN\s+([a-z_][a-z0-9_]*)\./gi)) {
    schemas.add(m[1].toLowerCase());
  }
}

function hasSchemaGrant(schema, sql) {
  if (new RegExp(`GRANT\\s+USAGE\\s+ON\\s+SCHEMA\\s+${schema}\\s+TO\\s+${RUNTIME_ROLE}`, "i").test(sql)) {
    return true;
  }
  if (
    new RegExp(`'${schema}'`, "i").test(sql) &&
    /GRANT\s+USAGE\s+ON\s+SCHEMA\s+%I/i.test(sql)
  ) {
    return true;
  }
  return false;
}

const SQL_FALSE_SCHEMAS = new Set([
  "excluded",
  "agg",
  "load_scope",
  "pay",
  "maint",
  "miles",
  "per_unit",
  "bounds",
  "bp",
  "qa",
  "qi",
  "qc",
  "qv",
  "process",
  "q",
]);

const missing = [];
for (const schema of [...schemas].sort()) {
  if (SKIP_SCHEMAS.has(schema) || SQL_FALSE_SCHEMAS.has(schema)) continue;
  if (!hasSchemaGrant(schema, migrationSql)) missing.push(schema);
}

if (missing.length > 0) {
  console.error(`verify:aggregate-schema-grants FAIL — no GRANT USAGE ON SCHEMA … TO ${RUNTIME_ROLE} in db/migrations for:`);
  for (const s of missing) console.error(`  ${s}`);
  process.exit(1);
}

console.log(`verify:aggregate-schema-grants PASS (${schemas.size} schemas scanned, ${missing.length} missing)`);
