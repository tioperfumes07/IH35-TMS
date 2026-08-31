#!/usr/bin/env node
/**
 * INV-OPEN-VOID-01 (owner-verified live 2026-09-01, worsening in real time: 41 voided invoices /
 * $72,237.34 phantom open A/R, was 33 / $45,837.34 four hours earlier). accounting.invoices.
 * amount_open_cents, accounting.payments.amount_unapplied_cents, and accounting.vendor_credits.
 * amount_unapplied_cents were GENERATED ALWAYS AS columns blind to voided_at / status='voided' --
 * voiding a document INCREASED phantom open A/R by its full face value instead of zeroing it. This
 * guard locks the migration that fixes all three at once (db/migrations/
 * 202613310300_inv_open_void_amount_columns_respect_void.sql) and does not regress: each generated
 * expression must gate on the entity's own void marker, the dependent view + index the ALTER forces
 * to drop must be recreated, and a sanity block must fail loud if any voided row still reports a
 * nonzero balance.
 *
 *   node scripts/verify-inv-open-void-respects-void.mjs
 *   node scripts/verify-inv-open-void-respects-void.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-inv-open-void-respects-void";
const FILE = "db/migrations/202613310300_inv_open_void_amount_columns_respect_void.sql";

function read(rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

export function assertGuard(src) {
  const errs = [];
  if (!src) return [`${FILE}: missing`];

  if (!/CASE WHEN voided_at IS NOT NULL THEN 0 ELSE total_cents - amount_paid_cents END/.test(src)) {
    errs.push(`${FILE}: accounting.invoices.amount_open_cents must gate on voided_at, not just total_cents - amount_paid_cents`);
  }
  if (!/CASE WHEN voided_at IS NOT NULL THEN 0 ELSE amount_cents - amount_applied_cents END/.test(src)) {
    errs.push(`${FILE}: accounting.payments.amount_unapplied_cents must gate on voided_at`);
  }
  if (!/CASE WHEN status = 'voided' THEN 0 ELSE amount_cents - amount_applied_cents END/.test(src)) {
    errs.push(`${FILE}: accounting.vendor_credits.amount_unapplied_cents must gate on status='voided' (this table has no voided_at column)`);
  }
  if (!/DROP VIEW IF EXISTS views\.ar_aging/.test(src) || !/CREATE VIEW views\.ar_aging\b/.test(src)) {
    errs.push(`${FILE}: views.ar_aging depends on invoices.amount_open_cents and must be dropped and recreated around the ALTER`);
  }
  // ih35-migration-guard review (2026-09-01): pg_get_viewdef() only prints the SELECT body, never
  // reloptions or grants -- a naive drop+recreate silently drops WITH (security_invoker = true),
  // which removes RLS enforcement from the view (accounting.invoices/payments/vendor_credits do not
  // carry FORCE ROW LEVEL SECURITY, so the view would then read as its OWNER, bypassing entity
  // scoping entirely), and silently widens the grant from ih35_app to whatever the recreate states.
  // Both must be asserted explicitly, not inferred from "a CREATE VIEW statement exists somewhere".
  if (!/CREATE VIEW views\.ar_aging\s+WITH\s*\(\s*security_invoker\s*=\s*true\s*\)/.test(src)) {
    errs.push(`${FILE}: recreated views.ar_aging must restore WITH (security_invoker = true) -- dropping it removes RLS enforcement from the view (the view's owner reads unscoped once the option is gone)`);
  }
  if (!/GRANT SELECT ON views\.ar_aging TO ih35_app/.test(src)) {
    errs.push(`${FILE}: recreated views.ar_aging must be granted back to ih35_app specifically -- DROP VIEW destroys its ACL, and granting TO PUBLIC instead would widen A/R aging read access to every role in the database`);
  }
  if (!/DROP INDEX IF EXISTS accounting\.idx_payments_unapplied/.test(src) || !/CREATE INDEX IF NOT EXISTS idx_payments_unapplied/.test(src)) {
    errs.push(`${FILE}: idx_payments_unapplied is a partial index on payments.amount_unapplied_cents and must be dropped and recreated around the ALTER`);
  }
  if (!/RAISE EXCEPTION 'INV-OPEN-VOID-01 sanity failed: % voided invoices/.test(src)) {
    errs.push(`${FILE}: must fail loud (RAISE EXCEPTION) if any voided invoice still reports nonzero amount_open_cents after the migration, not just alter the column silently`);
  }
  if (!/RAISE EXCEPTION 'INV-OPEN-VOID-01 sanity failed: % voided payments/.test(src)) {
    errs.push(`${FILE}: must fail loud if any voided payment still reports nonzero amount_unapplied_cents`);
  }
  if (!/RAISE EXCEPTION 'INV-OPEN-VOID-01 sanity failed: % voided vendor_credits/.test(src)) {
    errs.push(`${FILE}: must fail loud if any voided vendor_credit still reports nonzero amount_unapplied_cents`);
  }
  if (!/BEGIN;[\s\S]*COMMIT;/.test(src)) {
    errs.push(`${FILE}: must run as a single transaction (BEGIN/COMMIT) so the drop+recreate of dependents is atomic with the column fix`);
  }

  return errs;
}

function selftest() {
  const good = read(FILE) ?? "";
  const goodErrs = assertGuard(good);
  if (goodErrs.length) {
    console.error(`${LABEL} --selftest FAIL good (${goodErrs.length}): ${goodErrs.join("; ")}`);
    process.exit(1);
  }

  const mutations = [
    ["bad1-invoices-not-gated", good.replace("CASE WHEN voided_at IS NOT NULL THEN 0 ELSE total_cents - amount_paid_cents END", "total_cents - amount_paid_cents")],
    ["bad2-payments-not-gated", good.replace("CASE WHEN voided_at IS NOT NULL THEN 0 ELSE amount_cents - amount_applied_cents END", "amount_cents - amount_applied_cents")],
    ["bad3-vendor-credits-not-gated", good.replace("CASE WHEN status = 'voided' THEN 0 ELSE amount_cents - amount_applied_cents END", "amount_cents - amount_applied_cents")],
    ["bad4-view-not-recreated", good.replace(/CREATE VIEW views\.ar_aging/g, "-- REMOVED")],
    ["bad5-index-not-recreated", good.replace(/CREATE INDEX IF NOT EXISTS idx_payments_unapplied/g, "-- REMOVED")],
    ["bad6-no-invoice-sanity", good.replace(/RAISE EXCEPTION 'INV-OPEN-VOID-01 sanity failed: % voided invoices[^']*', v_bad_invoices;/, "NULL;")],
    ["bad7-no-transaction", good.replace("BEGIN;", "-- no txn").replace("COMMIT;", "-- no txn")],
    // ih35-migration-guard review (2026-09-01): the two silent-drop findings.
    ["bad8-security-invoker-dropped", good.replace("WITH (security_invoker = true)\n", "")],
    ["bad9-grant-widened-to-public", good.replace("GRANT SELECT ON views.ar_aging TO ih35_app;", "GRANT SELECT ON views.ar_aging TO PUBLIC;")],
  ];

  for (const [name, mutated] of mutations) {
    const res = assertGuard(mutated);
    if (res.length === 0) {
      console.error(`${LABEL} --selftest FAIL ${name}: mutation not caught`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS ${mutations.length}/${mutations.length} mutations caught`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errs = assertGuard(read(FILE));
if (errs.length) {
  console.error(`[${LABEL}] FAILED — ${errs.length} issue(s):`);
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — amount_open_cents / amount_unapplied_cents (x2) all gate on the entity's own void marker, dependent view+index recreated, fail-loud sanity block present`);
