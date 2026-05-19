#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MIGRATIONS_DIR = path.join(ROOT, "db", "migrations");
const BACKEND_SRC_DIR = path.join(ROOT, "apps", "backend", "src");

function walk(dir, predicate, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, predicate, out);
    } else if (predicate(full)) {
      out.push(full);
    }
  }
  return out;
}

function rel(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

const migrationFiles = walk(MIGRATIONS_DIR, (f) => f.endsWith(".sql")).sort((a, b) =>
  path.basename(a).localeCompare(path.basename(b))
);
const migrationText = migrationFiles.map((f) => fs.readFileSync(f, "utf8")).join("\n\n");

const preferredNotNull =
  /ALTER\s+TABLE\s+identity\.users[\s\S]*?ALTER\s+COLUMN\s+preferred_language\s+SET\s+NOT\s+NULL/i.test(migrationText) ||
  /preferred_language\s+text[\s\S]*?\bNOT\s+NULL\b/i.test(migrationText);

const preferredHasDefault =
  /ALTER\s+TABLE\s+identity\.users[\s\S]*?ALTER\s+COLUMN\s+preferred_language\s+SET\s+DEFAULT\s+'[^']+'/i.test(migrationText) ||
  /preferred_language\s+text[^\n,]*\bDEFAULT\b/i.test(migrationText);

const sourceFiles = walk(BACKEND_SRC_DIR, (f) => f.endsWith(".ts"));
const insertRegex = /INSERT\s+INTO\s+identity\.users\s*\(([\s\S]*?)\)\s*VALUES/gi;

const insertsMissingPreferred = [];
for (const file of sourceFiles) {
  const text = fs.readFileSync(file, "utf8");
  let match;
  insertRegex.lastIndex = 0;
  while ((match = insertRegex.exec(text))) {
    const columnsRaw = match[1];
    if (columnsRaw.includes("${")) continue;
    const cols = columnsRaw
      .split(",")
      .map((c) => c.trim().replace(/^"/, "").replace(/"$/, "").toLowerCase())
      .filter(Boolean);
    if (!cols.includes("preferred_language")) {
      insertsMissingPreferred.push(rel(file));
    }
  }
}

if (preferredNotNull && !preferredHasDefault && insertsMissingPreferred.length > 0) {
  console.error("verify:identity-users-preferred-language — FAILED");
  console.error("identity.users.preferred_language is NOT NULL without a default, and INSERT paths omit preferred_language:");
  for (const file of [...new Set(insertsMissingPreferred)].sort()) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

console.log("verify:identity-users-preferred-language — OK");
