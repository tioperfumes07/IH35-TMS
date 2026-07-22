#!/usr/bin/env node
/**
 * verify-startup-drift-guard-exempts-held — both boot drift guards must treat a HELD +
 * unledgered migration as expected-pending, never as drift.
 *
 * WHY: a HELD migration is deliberately left UNLEDGERED on prod. scripts/db-migrate.mjs
 * (shouldSkipHeldOnProd) HELD-SKIPs it so a "DO NOT RUN ON PROD" migration cannot fire on a deploy;
 * the owner hand-applies on a Neon branch and ledger-backfills. If a boot guard then reads that
 * honest pending state as drift, it process.exit(1)s and the deploy fails
 * (2026-07-13 incident: 202607370000_driver_payment_methods).
 *
 * `lib/migration-status.ts` (assertMigrationDriftBootGuard) already excluded held.
 * `db/startup-migration-drift-guard.ts` did NOT — it survived only because its
 * MIGRATION_FILE_PATTERN requires exactly four leading digits and every held migration happens to
 * be timestamp-style, so the pattern matched 0 of 72. A held migration named 0XXX_*.sql would have
 * exited the backend on prod. This guard pins the exemption in BOTH files so the safety no longer
 * depends on a naming convention.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-startup-drift-guard-exempts-held";

const FILES = [
  "apps/backend/src/db/startup-migration-drift-guard.ts",
  "apps/backend/src/lib/migration-status.ts",
];

function checkSource(src, file) {
  const errors = [];
  if (!src.includes("loadHeldMigrationSet")) {
    errors.push(`${file}: must call loadHeldMigrationSet — a held+unledgered migration is not drift`);
  }
  // The exclusion must actually filter the set that drives the failure path, not merely be logged.
  const filtersByHeld =
    /\.filter\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*!\s*heldSet\.has\(\s*\1\s*\)\s*\)/.test(src) ||
    /!\s*heldSet\.has\(/.test(src);
  if (!filtersByHeld) {
    errors.push(`${file}: must EXCLUDE heldSet members from the drift/missing set (not just log them)`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { loadHeldMigrationSet } from "./held-migrations.js";
    const heldSet = loadHeldMigrationSet(opts.repoRoot);
    const missing = unledgered.filter((name) => !heldSet.has(name));
    if (missing.length > 0) { process.exit(1); }
  `;
  const bad = `
    const missing = repoMigrations.filter((name) => !sysLedger.has(name) || !appLedger.has(name));
    if (missing.length > 0) { process.exit(1); }
  `;
  const loggedOnly = `
    import { loadHeldMigrationSet } from "./held-migrations.js";
    const heldSet = loadHeldMigrationSet(opts.repoRoot);
    console.warn("held pending", heldSet.size);
    const missing = repoMigrations.filter((name) => !sysLedger.has(name));
    if (missing.length > 0) { process.exit(1); }
  `;
  const errs = [];
  if (checkSource(good, "good").length !== 0) errs.push("good fixture must pass");
  if (checkSource(bad, "bad").length === 0) errs.push("a guard with NO held exemption must fail");
  if (checkSource(loggedOnly, "loggedOnly").length === 0) {
    errs.push("logging held without excluding it from the failure set must fail");
  }
  if (errs.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const e of errs) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
}

function main() {
  const errors = [];
  for (const f of FILES) {
    const abs = path.join(ROOT, f);
    let src;
    try {
      src = fs.readFileSync(abs, "utf8");
    } catch (err) {
      if (err && err.code === "ENOENT") {
        errors.push(`${f}: missing — boot drift guard must exist`);
        continue;
      }
      throw err;
    }
    errors.push(...checkSource(src, f));
  }
  if (errors.length) {
    console.error(`FAIL ${LABEL}:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`OK ${LABEL}: both boot drift guards exclude HELD migrations from drift.`);
}

if (process.argv.includes("--selftest")) selftest();
else main();
