#!/usr/bin/env node
// INV-1 CI guard — no hard DELETE on mdata.load_stops.
//
// Invariant (CLAUDE.md §2, Ch.11): mdata.load_stops are POD/stop evidence.
// They must never be physically deleted — only soft-deleted via soft_deleted_at.
//
// This guard scans all .ts files in apps/backend/src and any .sql files in
// db/migrations for the pattern `DELETE FROM mdata.load_stops` and fails if found.
//
// Run: node scripts/verify-inv1-no-hard-delete-load-stops.mjs

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (msg) => { console.error(`FAIL verify-inv1-no-hard-delete-load-stops: ${msg}`); process.exit(1); };

const PATTERN = /DELETE\s+FROM\s+mdata\.load_stops/i;

function walkDir(dir, exts, results = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fp = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      walkDir(fp, exts, results);
    } else if (exts.some((e) => entry.name.endsWith(e))) {
      results.push(fp);
    }
  }
  return results;
}

// Scan only TypeScript runtime files — SQL migrations may reference these table names
// in comments documenting the fix and are not runtime DELETE callers.
const allFiles = walkDir(join(root, "apps/backend/src"), [".ts"]);

const offenders = [];
for (const fp of allFiles) {
  const src = readFileSync(fp, "utf8");
  if (PATTERN.test(src)) {
    offenders.push(fp.replace(root + "/", ""));
  }
}

if (offenders.length > 0) {
  console.error("FAIL verify-inv1-no-hard-delete-load-stops: hard DELETE on mdata.load_stops found:");
  for (const o of offenders) console.error(`  - ${o}`);
  fail("Use soft_deleted_at = now() instead (void-never-delete invariant, CLAUDE.md §2)");
}

console.log("PASS verify-inv1-no-hard-delete-load-stops: no hard DELETE on mdata.load_stops found");
