#!/usr/bin/env node
// INV-1 CI guard — no hard DELETE on mdata.load_stops.
//
// Invariant (CLAUDE.md §2, Ch.11): mdata.load_stops are POD/stop evidence.
// They must never be physically deleted — only soft-deleted via soft_deleted_at.
//
// This guard scans all runtime source files under apps/ and packages/ for a hard
// `DELETE FROM [mdata.]load_stops` and fails if found — G10-H2 broadened it from a
// single-directory (apps/backend/src) scan so the invariant holds in ANY runtime file
// (backend, PWA, workers, packages), and to also catch the unqualified `load_stops`
// form and the optional-schema/quoted variants.
//
// Run: node scripts/verify-inv1-no-hard-delete-load-stops.mjs

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (msg) => { console.error(`FAIL verify-inv1-no-hard-delete-load-stops: ${msg}`); process.exit(1); };

// Hard DELETE against load_stops, schema optional (mdata.) and identifiers optionally quoted.
const PATTERN = /DELETE\s+FROM\s+(?:"?mdata"?\.)?"?load_stops"?/i;

function walkDir(dir, exts, results = []) {
  if (!existsSync(dir)) return results;
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

// Scan runtime source across ALL apps + packages (not just apps/backend/src) so a hard
// DELETE anywhere in the codebase is caught. SQL migrations are intentionally NOT scanned —
// they may reference these table names in comments documenting the fix and are not runtime
// DELETE callers (INV-1 is a void-never-delete runtime invariant).
const SCAN_ROOTS = ["apps", "packages"];
const SCAN_EXTS = [".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"];
const allFiles = SCAN_ROOTS.flatMap((r) => walkDir(join(root, r), SCAN_EXTS, []));

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
