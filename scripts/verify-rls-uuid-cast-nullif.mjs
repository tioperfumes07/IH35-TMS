#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(ROOT, "db/migrations");
const BARE_CAST = /current_setting\([^)]+\)\s*::\s*uuid/i;
const NULLIF_WRAP = /NULLIF\s*\(\s*current_setting\([^)]+\)\s*,\s*''\s*\)\s*::\s*uuid/i;
const ALLOW_TAG = /ALLOW_BARE_UUID_CAST/;

function migrationNumber(fileName) {
  const match = /^(\d+)_/.exec(fileName);
  return match ? Number.parseInt(match[1], 10) : 0;
}

function findFixMigrationNumber() {
  const files = fs.readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"));
  const fix = files.find((name) => /rls_uuid_cast_defensive/.test(name));
  return fix ? migrationNumber(fix) : null;
}

function main() {
  const fixMigrationNum = findFixMigrationNumber();
  if (fixMigrationNum === null) {
    console.error("verify:rls-uuid-cast-nullif FAIL: missing *_rls_uuid_cast_defensive.sql migration");
    process.exit(1);
  }

  const failures = [];
  const files = fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const fileName of files) {
    const fileNum = migrationNumber(fileName);
    const isFixMigration = /rls_uuid_cast_defensive/.test(fileName);
    const filePath = path.join(migrationsDir, fileName);
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (isFixMigration) continue;
      if (/^\s*--/.test(line)) continue;
      if (!BARE_CAST.test(line)) continue;
      if (NULLIF_WRAP.test(line) || ALLOW_TAG.test(line)) continue;
      if (fileNum < fixMigrationNum) continue;

      failures.push(`${fileName}:${i + 1}: bare current_setting()::uuid without NULLIF wrap`);
    }
  }

  const fixMigration = files.find((name) => /rls_uuid_cast_defensive/.test(name)) ?? "";
  const fixSql = fs.readFileSync(path.join(migrationsDir, fixMigration), "utf8");
  if (!/ALTER POLICY|regexp_replace/.test(fixSql)) {
    failures.push(`${fixMigration}: must ALTER POLICY expressions with NULLIF wrap`);
  }

  if (failures.length > 0) {
    console.error("verify:rls-uuid-cast-nullif FAIL");
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
  }

  console.log(`verify:rls-uuid-cast-nullif PASS (fix migration ${fixMigrationNum})`);
}

main();
