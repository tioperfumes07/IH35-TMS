#!/usr/bin/env node
/**
 * Guard: identity/auth backend SQL must not reference columns absent from migrations.
 * Catches P0-USERS-500 drift (last_login_at selected before migration existed).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = path.join(ROOT, "db", "migrations");

const SCAN_ROOTS = [
  path.join(ROOT, "apps/backend/src/identity"),
  path.join(ROOT, "apps/backend/src/auth"),
];

const TABLE_ALIASES = new Map([["identity.users", new Set(["u", "users"])]]);

function walk(dir, predicate, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, predicate, out);
    else if (predicate(full)) out.push(full);
  }
  return out;
}

function rel(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

function collectMigrationColumns(tableName) {
  const [schema, table] = tableName.split(".");
  const columns = new Set();
  const migrationFiles = walk(MIGRATIONS_DIR, (f) => f.endsWith(".sql")).sort();

  for (const file of migrationFiles) {
    const sql = fs.readFileSync(file, "utf8");

    const createRe = new RegExp(
      `CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:${schema}\\.)?${table}\\s*\\(([^;]+?)\\);`,
      "gis"
    );
    for (const match of sql.matchAll(createRe)) {
      for (const line of match[1].split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("--") || trimmed.startsWith("CONSTRAINT")) continue;
        const col = trimmed.split(/\s+/)[0]?.replace(/,$/, "").replace(/^"/, "").replace(/"$/, "");
        if (col && /^[a-z_][a-z0-9_]*$/i.test(col)) columns.add(col.toLowerCase());
      }
    }

    const addRe = /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?("?[a-z_][a-z0-9_]*"?)/gi;
    const renameRe =
      /RENAME\s+COLUMN\s+("?[a-z_][a-z0-9_]*"?)\s+TO\s+("?[a-z_][a-z0-9_]*"?)/gi;
    const alterBlocks = sql.split(new RegExp(`(?=ALTER\\s+TABLE\\s+(?:ONLY\\s+)?(?:${schema}\\.)?${table}\\b)`, "gi"));
    for (const block of alterBlocks) {
      if (!new RegExp(`^ALTER\\s+TABLE\\s+(?:ONLY\\s+)?(?:${schema}\\.)?${table}\\b`, "i").test(block)) continue;
      for (const match of block.matchAll(addRe)) {
        columns.add(match[1].replace(/"/g, "").toLowerCase());
      }
      for (const match of block.matchAll(renameRe)) {
        columns.delete(match[1].replace(/"/g, "").toLowerCase());
        columns.add(match[2].replace(/"/g, "").toLowerCase());
      }
    }
  }

  return columns;
}

function extractSqlLiterals(source) {
  const chunks = [];
  const backtickRe = /`([^`\\]|\\.)*`/gs;
  for (const match of source.matchAll(backtickRe)) {
    chunks.push(match[0].slice(1, -1));
  }
  return chunks;
}

function referencedColumnsInSql(sql, tableName, aliases) {
  const found = new Set();
  if (!/\bidentity\.users\b/i.test(sql) && !/\bFROM\s+identity\.users\s+\w+/i.test(sql)) {
    return found;
  }

  const [, table] = tableName.split(".");
  const aliasPattern = [...aliases, table]
    .map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");

  const qualifiedRe = new RegExp(`\\b${tableName.replace(".", "\\.")}\\.(\\w+)\\b`, "gi");
  for (const match of sql.matchAll(qualifiedRe)) {
    found.add(match[1].toLowerCase());
  }

  const aliasRe = new RegExp(`\\b(?:${aliasPattern})\\.(\\w+)\\b`, "gi");
  for (const match of sql.matchAll(aliasRe)) {
    found.add(match[1].toLowerCase());
  }

  return found;
}

const migrationColumns = new Map();
for (const tableName of TABLE_ALIASES.keys()) {
  migrationColumns.set(tableName, collectMigrationColumns(tableName));
}

const failures = [];
const sourceFiles = [];
for (const root of SCAN_ROOTS) {
  sourceFiles.push(...walk(root, (f) => f.endsWith(".ts") && !f.endsWith(".test.ts")));
}

for (const file of sourceFiles) {
  const source = fs.readFileSync(file, "utf8");
  for (const chunk of extractSqlLiterals(source)) {
    for (const [tableName, aliases] of TABLE_ALIASES) {
      const refs = referencedColumnsInSql(chunk, tableName, aliases);
      const known = migrationColumns.get(tableName) ?? new Set();
      for (const col of refs) {
        if (known.has(col)) continue;
        failures.push(`${rel(file)} references ${tableName}.${col} with no migration ADD/CREATE column`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error("verify:backend-column-references — FAILED");
  for (const line of [...new Set(failures)].sort()) console.error(`- ${line}`);
  process.exit(1);
}

console.log("verify:backend-column-references — OK");
