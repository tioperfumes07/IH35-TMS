#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_FILES = [
  path.join(ROOT, "apps/backend/src/mdata/unit-aggregate.service.ts"),
  path.join(ROOT, "apps/backend/src/mdata/unit-financial.service.ts"),
];
const MIGRATIONS = path.join(ROOT, "db/migrations");

const SKIP_SCHEMAS = new Set(["information_schema", "pg_catalog", "_system", "ih35_migrations", "public"]);

const migrationSql = fs
  .readdirSync(MIGRATIONS)
  .filter((n) => n.endsWith(".sql"))
  .map((n) => fs.readFileSync(path.join(MIGRATIONS, n), "utf8"))
  .join("\n");

// `FROM mdata.get_customer_same_company(l.customer_id, l.operating_company_id) scoped_customer`
// (unit-aggregate.service.ts:482) is a table-valued FUNCTION call in a FROM clause — legitimate,
// common Postgres — not a table/view reference at all. The regex below (deliberately, same as
// every other qualified-ref guard in this repo) can't distinguish `FROM schema.name` from
// `FROM schema.name(...)`; it matched `mdata.get_customer_same_company` / `mdata.get_vendor_same_company`
// and demanded a `CREATE TABLE`/`CREATE VIEW` for names that were always `CREATE OR REPLACE
// FUNCTION mdata.get_customer_same_company(...)` (202613060000) / `...get_vendor_same_company(...)`
// (202613040000) instead. Recording whether EVERY occurrence of a qualified name is immediately
// followed by `(` lets a function-shaped name additionally satisfy the check via `CREATE FUNCTION`
// — a name with even one bare (non-call) occurrence still requires the original TABLE/VIEW proof,
// so this cannot mask a genuinely missing table that merely happens to share a name pattern.
const occurrences = new Map(); // qualified name -> { anyBare: boolean, anyCall: boolean }
for (const file of SRC_FILES) {
  const src = fs.readFileSync(file, "utf8");
  for (const m of src.matchAll(/\b(?:FROM|JOIN)\s+([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\s*(\()?/gi)) {
    const qualified = `${m[1].toLowerCase()}.${m[2].toLowerCase()}`;
    const entry = occurrences.get(qualified) ?? { anyBare: false, anyCall: false };
    if (m[3] === "(") entry.anyCall = true;
    else entry.anyBare = true;
    occurrences.set(qualified, entry);
  }
}

const missing = [];
for (const qualified of [...occurrences.keys()].sort()) {
  const [schema, table] = qualified.split(".");
  if (SKIP_SCHEMAS.has(schema)) continue;
  const { anyBare, anyCall } = occurrences.get(qualified);
  const createTableViewRe = new RegExp(
    `CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:TABLE|VIEW)\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:${schema}\\.)?${table}\\b`,
    "i"
  );
  if (createTableViewRe.test(migrationSql)) continue;
  if (!anyBare && anyCall) {
    const createFunctionRe = new RegExp(
      `CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:${schema}\\.)?${table}\\b`,
      "i"
    );
    if (createFunctionRe.test(migrationSql)) continue;
  }
  missing.push(qualified);
}

if (missing.length > 0) {
  console.error("verify:referenced-tables-exist FAIL — no CREATE TABLE in db/migrations for:");
  for (const t of missing) console.error(`  ${t}`);
  process.exit(1);
}

console.log(`verify:referenced-tables-exist PASS (${occurrences.size} qualified refs, ${missing.length} missing)`);
