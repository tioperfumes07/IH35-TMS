#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, "db", "migrations");
const MIGRATION_FILENAME_REGEX = /^(\d{4}[a-z]?)_(.+\.sql)$/i;
const ALLOWED_DUPLICATE_MIGRATION_PAIRS = new Set([
  "0237_accounting_ar_collection_tasks.sql::0238_accounting_ar_collection_tasks.sql",
]);

function pairKey(sortedPair) {
  return `${sortedPair[0]}::${sortedPair[1]}`;
}

export function parseMigrationFilename(file) {
  const match = file.match(MIGRATION_FILENAME_REGEX);
  if (!match) return null;
  return { sequence: match[1], slug: match[2] };
}

export function findDuplicateMigrationSlugs(files) {
  const filesBySlug = new Map();
  for (const file of files) {
    const parsed = parseMigrationFilename(file);
    if (!parsed) continue;
    const list = filesBySlug.get(parsed.slug) ?? [];
    list.push(file);
    filesBySlug.set(parsed.slug, list);
  }

  return [...filesBySlug.entries()]
    .map(([slug, values]) => ({ slug, files: values.sort((a, b) => a.localeCompare(b)) }))
    .filter((entry) => entry.files.length > 1)
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export function validateDuplicateMigrationSlugs(duplicates) {
  const disallowed = [];
  for (const duplicate of duplicates) {
    const files = duplicate.files;
    if (files.length !== 2) {
      disallowed.push(duplicate);
      continue;
    }
    if (!ALLOWED_DUPLICATE_MIGRATION_PAIRS.has(pairKey(files))) {
      disallowed.push(duplicate);
    }
  }
  return disallowed;
}

function fail(message, lines = []) {
  console.error(`verify:no-duplicate-migrations FAILED\n- ${message}`);
  for (const line of lines) console.error(`  ${line}`);
  process.exit(1);
}

export function run(options = {}) {
  const migrationsDir = options.migrationsDir ?? MIGRATIONS_DIR;
  if (!fs.existsSync(migrationsDir)) {
    fail(`missing migrations directory: ${path.relative(ROOT, migrationsDir)}`);
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((name) => MIGRATION_FILENAME_REGEX.test(name))
    .sort((a, b) => a.localeCompare(b));

  const duplicates = findDuplicateMigrationSlugs(files);
  const disallowed = validateDuplicateMigrationSlugs(duplicates);
  if (disallowed.length > 0) {
    fail(
      "found duplicate migration slugs outside the historical allowlist",
      disallowed.map((entry) => `${entry.slug}: ${entry.files.join(", ")}`),
    );
  }

  console.log(
    JSON.stringify({
      event: "verify_no_duplicate_migrations_ok",
      scanned: files.length,
      allowlisted_duplicates: duplicates.length,
    }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run();
}
