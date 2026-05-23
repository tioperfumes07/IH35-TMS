#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");
const SQL_EXTENSION = ".sql";
const POSTGIS_EXTENSION_PATTERN = /create\s+extension[\s\S]*postgis/i;
const GEOGRAPHY_TYPE_PATTERN = /geography\s*\(/i;

function listMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Missing migrations directory: ${MIGRATIONS_DIR}`);
  }
  return fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(SQL_EXTENSION))
    .map((entry) => path.join(MIGRATIONS_DIR, entry.name))
    .sort();
}

const violations = [];
for (const filePath of listMigrationFiles()) {
  const content = fs.readFileSync(filePath, "utf8");
  if (POSTGIS_EXTENSION_PATTERN.test(content)) {
    violations.push(`${path.relative(process.cwd(), filePath)}: CREATE EXTENSION ... postgis`);
  }
  if (GEOGRAPHY_TYPE_PATTERN.test(content)) {
    violations.push(`${path.relative(process.cwd(), filePath)}: geography(...) type usage`);
  }
}

if (violations.length > 0) {
  console.error("verify-migrations-no-postgis-dependency: failed");
  console.error("PostGIS dependency is disallowed; use plain Postgres types and application-side geometry logic.");
  for (const violation of violations) {
    console.error(` - ${violation}`);
  }
  process.exit(1);
}

console.log("verify-migrations-no-postgis-dependency: ok");
