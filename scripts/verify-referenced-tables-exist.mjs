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

const tables = new Set();
for (const file of SRC_FILES) {
  const src = fs.readFileSync(file, "utf8");
  for (const m of src.matchAll(/\b(?:FROM|JOIN)\s+([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\b/gi)) {
    tables.add(`${m[1].toLowerCase()}.${m[2].toLowerCase()}`);
  }
}

const missing = [];
for (const qualified of [...tables].sort()) {
  const [schema, table] = qualified.split(".");
  if (SKIP_SCHEMAS.has(schema)) continue;
  const createRe = new RegExp(
    `CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:TABLE|VIEW)\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:${schema}\\.)?${table}\\b`,
    "i"
  );
  if (!createRe.test(migrationSql)) missing.push(qualified);
}

if (missing.length > 0) {
  console.error("verify:referenced-tables-exist FAIL — no CREATE TABLE in db/migrations for:");
  for (const t of missing) console.error(`  ${t}`);
  process.exit(1);
}

console.log(`verify:referenced-tables-exist PASS (${tables.size} qualified refs, ${missing.length} missing)`);
