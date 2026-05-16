#!/usr/bin/env node
/**
 * WARNING-only: scan backend TS for qualified SQL table refs schema.table and report
 * tables never introduced by CREATE TABLE in db/migrations/*.sql (static parse).
 * Does not understand views, temp tables, or dynamic SQL — conservative omissions expected.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MIG_DIR = path.join(ROOT, "db", "migrations");
const BACKEND_SRC = path.join(ROOT, "apps", "backend", "src");

function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

function collectCreatedTables(sql) {
  const set = new Set();
  const re =
    /CREATE\s+(?:OR\s+REPLACE\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)/gi;
  let m;
  while ((m = re.exec(sql))) {
    set.add(m[1].toLowerCase());
  }
  return set;
}

function walkTs(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith(".") || ent.name === "node_modules") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkTs(p));
    else if (/\.(ts|tsx)$/.test(ent.name)) out.push(p);
  }
  return out;
}

function main() {
  const migFiles = fs.readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql"));
  let union = new Set();
  for (const f of migFiles) {
    const sql = stripComments(fs.readFileSync(path.join(MIG_DIR, f), "utf8"));
    union = new Set([...union, ...collectCreatedTables(sql)]);
  }

  const refs = new Map();
  const sqlHint =
    /(?:FROM|JOIN|INTO|UPDATE)\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\b/gi;

  for (const fp of walkTs(BACKEND_SRC)) {
    const text = fs.readFileSync(fp, "utf8");
    let m;
    sqlHint.lastIndex = 0;
    while ((m = sqlHint.exec(text))) {
      const fq = m[1].toLowerCase();
      if (union.has(fq)) continue;
      const rel = path.relative(ROOT, fp);
      if (!refs.has(fq)) refs.set(fq, new Set());
      refs.get(fq).add(rel);
    }
  }

  if (refs.size === 0) {
    console.log(
      "db:verify:backend-contract — OK (no qualified schema.table refs missing CREATE TABLE in migrations)",
    );
    process.exit(0);
    return;
  }

  console.warn(
    "\ndb:verify:backend-contract — WARNING (tables referenced in backend TS without static CREATE TABLE in migrations):\n",
  );
  for (const [fq, files] of [...refs.entries()].sort((a, b) =>
    a[0] < b[0] ? -1 : 1,
  )) {
    console.warn(`  ${fq}`);
    for (const f of [...files].sort()) console.warn(`    ← ${f}`);
  }
  console.warn(
    `\nTotal distinct tables: ${refs.size} (informational only; exit 0)\n`,
  );
  process.exit(0);
}

main();
