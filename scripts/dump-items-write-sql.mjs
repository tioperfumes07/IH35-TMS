#!/usr/bin/env node
/**
 * ACCT-F83 — print the EXACT SQL the items reconciler executes, so it can be run verbatim against a
 * fork of prod instead of hand-copied. A hand-copy proves the copy, not the code.
 *
 * Usage:
 *   node scripts/dump-items-write-sql.mjs heal     # HEAL_ITEM_DRIFT_SQL
 *   node scripts/dump-items-write-sql.mjs create    # CREATE_MISSING_ITEMS_SQL
 *   node scripts/dump-items-write-sql.mjs conflicts # COUNT_NAME_CONFLICTS_SQL
 *   node scripts/dump-items-write-sql.mjs puller    # PULLER_UPSERT_ITEM_SQL
 *
 * $1/$2 placeholders are left intact; pass --opco=<uuid> to inline them for a psql/console paste.
 * Read-only: this script prints SQL and never connects to a database.
 */
import { build } from "esbuild";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Resolved from THIS file, not the caller's cwd — the earlier cwd-relative version failed the moment
// it was run from anywhere but the repo root, which is exactly when a verification script gets skipped.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "apps/backend/src/qbo-sync/items-write-sql.ts");
const which = (process.argv[2] ?? "heal").toLowerCase();
const opcoArg = process.argv.find((a) => a.startsWith("--opco="));
const opco = opcoArg ? opcoArg.slice("--opco=".length) : null;

const KEYS = {
  heal: "HEAL_ITEM_DRIFT_SQL",
  create: "CREATE_MISSING_ITEMS_SQL",
  conflicts: "COUNT_NAME_CONFLICTS_SQL",
  puller: "PULLER_UPSERT_ITEM_SQL",
};
const key = KEYS[which];
if (!key) {
  console.error(`unknown target '${which}' — expected one of: ${Object.keys(KEYS).join(", ")}`);
  process.exit(2);
}

// items-write-sql.ts has NO runtime imports by design, so it bundles standalone.
// Same CodeQL js/insecure-temporary-file class as the guard: a predictable path in world-writable
// /tmp is symlink-attackable, and this script IMPORTS what it writes. mkdtempSync gives a 0700
// directory with an unpredictable suffix, so the write and the import stay inside a directory only
// this process owns.
const outDir = mkdtempSync(join(tmpdir(), "ih35-items-write-sql-dump-"));
const out = join(outDir, "items-write-sql.mjs");
let mod;
try {
  await build({ entryPoints: [SRC], outfile: out, format: "esm", bundle: true, platform: "node", logLevel: "silent" });
  mod = await import(`file://${out}`);
} finally {
  rmSync(outDir, { force: true, recursive: true });
}

let sql = mod[key];
if (typeof sql !== "string") {
  console.error(`${key} is not exported from ${SRC}`);
  process.exit(1);
}
if (opco) {
  sql = sql.replaceAll("$1", `'${opco}'`).replaceAll("$2", `'Reconciled from QBO mirror (${opco})'`);
}
process.stdout.write(sql.trimEnd() + "\n");

// Guard against silently dumping a stale build: the source must still contain the constant name.
if (!readFileSync(SRC, "utf8").includes(`export const ${key}`)) {
  console.error(`\n[warn] ${key} not found as an export in ${SRC} — output may be stale`);
  process.exit(1);
}
