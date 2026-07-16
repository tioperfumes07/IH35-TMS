#!/usr/bin/env node
/**
 * QBO collapse Step-2 guard: live (non-test) code must not INSERT/UPDATE the RETIRE mirrors
 * accounting.qbo_accounts|customers|vendors. Canonical = mdata.qbo_*.
 *
 * Allows: comments, strings in docs, test fixtures, archived paths, remote_count* (different tables).
 * Self-test: --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-accounting-qbo-writes";
const TABLES = ["accounts", "customers", "vendors"];
const WRITE_RE = new RegExp(
  String.raw`(?:INSERT\s+INTO|UPDATE)\s+accounting\.qbo_(?:${TABLES.join("|")})\b`,
  "i"
);
const SKIP_DIR = new Set(["node_modules", "dist", "coverage", ".git", "__tests__", "tests"]);
const SKIP_FILE_RE = /\.(test|spec)\.(ts|tsx|js|mjs)$|README|\.md$/i;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(ent.name) && !SKIP_FILE_RE.test(ent.name)) out.push(p);
  }
  return out;
}

export function findWrites(files, read = (f) => fs.readFileSync(f, "utf8")) {
  const hits = [];
  for (const f of files) {
    const src = read(f);
    const lines = src.split("\n");
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
      if (WRITE_RE.test(line)) hits.push(`${path.relative(ROOT, f)}:${i + 1}: ${trimmed.slice(0, 120)}`);
    });
  }
  return hits;
}

if (process.argv.includes("--selftest")) {
  const good = findWrites(["x.ts"], () => `UPDATE mdata.qbo_accounts SET sync_status = 'ok'`);
  const bad = findWrites(["x.ts"], () => `UPDATE accounting.qbo_accounts SET sync_status = 'ok'`);
  if (good.length !== 0 || bad.length !== 1) {
    console.error(`${LABEL} --selftest FAILED`, { good, bad });
    process.exit(1);
  }
  console.log(`${LABEL} --selftest — OK`);
  process.exit(0);
}

const srcRoot = path.join(ROOT, "apps/backend/src");
const hits = findWrites(walk(srcRoot));
if (hits.length) {
  console.error(`${LABEL} — FAILED (accounting.qbo_* writes still present; canonical is mdata.qbo_*):`);
  for (const h of hits) console.error(" - " + h);
  process.exit(1);
}
console.log(`${LABEL} — OK (no INSERT/UPDATE to accounting.qbo_{accounts,customers,vendors} in live backend src)`);
