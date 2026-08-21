#!/usr/bin/env node
/**
 * verify-refuse-load-soft-delete-open-driver-bill.mjs
 *
 * ACCT-F5683 — static guard for the systemic half of ACCT-F214: no application code path was
 * ever found that sets mdata.loads.soft_deleted_at, so an application-layer check cannot stop a
 * load from being soft-deleted while it still carries an open driver_finance.driver_bills row.
 * The fix is a database trigger (migration 202612870000) that refuses the transition regardless
 * of writer. This guard locks the migration's shape: the trigger function only fires on the
 * NULL->non-NULL soft_deleted_at transition, scopes to status='open' only (never 'paid'/'void'),
 * and never touches the pre-existing historical orphan row (no UPDATE/backfill statement).
 *
 * Static-only: no DB connection, so this cannot prove the trigger fires live on prod — that was
 * proven separately via Neon-branch rehearsal before merge (documented in the PR body).
 */
import { readFileSync } from "node:fs";

const migrationPath = "db/migrations/202612870000_acct_f5683_refuse_load_soft_delete_with_open_driver_bill.sql";
const src = readFileSync(migrationPath, "utf8");

function analyze(src) {
  const failures = [];

  if (!/CREATE OR REPLACE FUNCTION mdata\.refuse_load_soft_delete_with_open_driver_bill/.test(src)) {
    failures.push("trigger function refuse_load_soft_delete_with_open_driver_bill not found");
  }

  // Must scope to the specific transition (NULL -> non-NULL), not every UPDATE of soft_deleted_at.
  if (!/NEW\.soft_deleted_at IS NOT NULL AND OLD\.soft_deleted_at IS NULL/.test(src)) {
    failures.push("function does not scope to the NULL->non-NULL soft_deleted_at transition");
  }

  // Must scope to status = 'open' only — never treat 'paid' or 'void' bills as blocking.
  if (!/db\.status = 'open'/.test(src)) {
    failures.push("function does not scope the open-bill check to status = 'open'");
  }
  if (/db\.status\s*(!=|<>)\s*'void'/.test(src) || /db\.status\s+IN\s*\(\s*'open'\s*,\s*'paid'\s*\)/.test(src)) {
    failures.push("function appears to over-scope beyond status='open' (would wrongly block on paid bills)");
  }

  if (!/RAISE EXCEPTION/.test(src)) {
    failures.push("function does not RAISE EXCEPTION on a blocked transition — would silently allow it");
  }

  if (!/BEFORE UPDATE OF soft_deleted_at ON mdata\.loads/.test(src)) {
    failures.push("trigger is not scoped to BEFORE UPDATE OF soft_deleted_at ON mdata.loads");
  }

  // Idempotency: trigger creation must be guarded by an existence check.
  if (!/NOT EXISTS\s*\(\s*SELECT 1\s+FROM pg_trigger/s.test(src)) {
    failures.push("trigger creation is not guarded by a pg_trigger existence check (not idempotent)");
  }

  // Must never touch the pre-existing historical orphan row — no data-mutating statement against
  // driver_bills or loads (only the trigger/function DDL is allowed).
  if (/UPDATE\s+driver_finance\.driver_bills/i.test(src) || /UPDATE\s+mdata\.loads/i.test(src)) {
    failures.push("migration contains a data-mutating UPDATE — must not touch the existing historical orphan row");
  }

  return failures;
}

function selftest() {
  const good = analyze(src);
  if (good.length > 0) {
    console.error("verify-refuse-load-soft-delete-open-driver-bill --selftest: FAIL on the real (good) file");
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  // Mutation 1: drop the transition scoping (would refuse a restore or a no-op soft_deleted_at
  // update, and more importantly loses the intended narrow scope).
  const mutated1 = src.replace(
    "IF NEW.soft_deleted_at IS NOT NULL AND OLD.soft_deleted_at IS NULL THEN",
    "IF NEW.soft_deleted_at IS NOT NULL THEN"
  );
  const failures1 = analyze(mutated1);
  if (failures1.length === 0) {
    console.error("verify-refuse-load-soft-delete-open-driver-bill --selftest: mutation 1 (drop transition scoping) was not caught");
    process.exit(1);
  }

  // Mutation 2: widen the status scope to also block on 'paid' bills.
  const mutated2 = src.replace(
    "AND db.status = 'open';",
    "AND db.status IN ('open', 'paid');"
  );
  const failures2 = analyze(mutated2);
  if (failures2.length === 0) {
    console.error("verify-refuse-load-soft-delete-open-driver-bill --selftest: mutation 2 (widen to paid bills) was not caught");
    process.exit(1);
  }

  console.log("verify-refuse-load-soft-delete-open-driver-bill --selftest: OK (good file clean, both targeted mutations caught)");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const failures = analyze(src);
  if (failures.length > 0) {
    console.error("verify-refuse-load-soft-delete-open-driver-bill: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("verify-refuse-load-soft-delete-open-driver-bill: OK — trigger scoped to NULL->non-NULL transition, status='open' only, idempotent, no historical data touched");
}
