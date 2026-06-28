#!/usr/bin/env node
/**
 * verify-single-migration-dir — STRUCTURAL GATE: the migration runner (scripts/db-migrate.mjs,
 * MIGRATIONS_DIR=db/migrations) applies ONLY db/migrations/. Files in any other "migrations" dir
 * (apps/backend/src/migrations/, apps/backend/migrations/, …) are NEVER applied → their tables are
 * phantom on every real DB (the 2026-06-28 "5 missing tables" defect). This guard makes that class
 * impossible to GROW: a ratchet allowlist of the CURRENTLY-orphaned files (may only SHRINK); any
 * NEW .sql in a non-canonical migrations dir fails CI. It does NOT move/delete anything — relocation
 * is CC-05 (Tier-1). When CC-05 empties the dirs, the allowlist shrinks to zero.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CANONICAL = "db/migrations";
const ALLOW_FILE = path.join(ROOT, "scripts/single-migration-dir-allowlist.json");
const WRITE = process.argv.includes("--write-baseline");

// find every directory literally named "migrations" except the canonical one, and list its *.sql
function findOrphanSql(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".") || e.name === "dist") continue;
    if (e.name === "__tests__" || e.name === "fixtures") continue; // test fixtures aren't real migrations
    const full = path.join(dir, e.name);
    if (!e.isDirectory()) continue;
    const relDir = path.relative(ROOT, full).split(path.sep).join("/");
    if (e.name === "migrations" && relDir !== CANONICAL) {
      for (const f of fs.readdirSync(full)) {
        if (f.endsWith(".sql")) out.push(relDir + "/" + f);
      }
    }
    findOrphanSql(full, out);
  }
  return out;
}

const found = findOrphanSql(ROOT).sort();

if (WRITE) {
  fs.writeFileSync(ALLOW_FILE, JSON.stringify({ note: "Known orphaned migration files outside db/migrations (ratchet — may only shrink; CC-05 relocates them).", allow: found }, null, 2) + "\n");
  console.log(`verify-single-migration-dir: wrote allowlist with ${found.length} orphaned file(s) → ${path.relative(ROOT, ALLOW_FILE)}`);
  process.exit(0);
}

let allow = new Set();
try { allow = new Set(JSON.parse(fs.readFileSync(ALLOW_FILE, "utf8")).allow); } catch { /* none → any orphan is new */ }
const neu = found.filter((f) => !allow.has(f));
const fixed = [...allow].filter((a) => !found.includes(a));

if (fixed.length) {
  console.log(`verify-single-migration-dir: ${fixed.length} orphaned file(s) relocated/removed — drop them from the allowlist (it must shrink):`);
  for (const f of fixed) console.log("  ✓ cleared: " + f);
}
if (neu.length) {
  console.error("verify-single-migration-dir FAILED:");
  console.error(`  ${neu.length} NEW migration file(s) in a non-canonical dir — the runner only applies ${CANONICAL}/. Put migrations there:`);
  for (const f of neu) console.error("  " + f);
  process.exit(1);
}
console.log(found.length
  ? `verify-single-migration-dir OK — no NEW orphaned migrations. ${found.length} pre-existing (allowlisted; CC-05 relocates).`
  : `verify-single-migration-dir OK — db/migrations/ is the only migrations dir.`);
