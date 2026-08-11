#!/usr/bin/env node
/**
 * LV-BILL-VOID-MARKERS-ARE-DISJOINT — accounting.bills carries TWO void marker sets
 * (voided_at/voided_by_user_id/void_reason and revoked_at/revoked_by_user_id/revoked_reason).
 * The ACCT-F142 dedup MIGRATION wrote the first; all four app void paths write the second. A KPI
 * filtering one predicate disagreed with a KPI filtering the other — measured $1,766.66 / 79% A/P
 * overstatement on prod.
 *
 * The fix is a BEFORE INSERT OR UPDATE trigger on accounting.bills, NOT four patched call sites,
 * because a migration is itself one of the two writers and application code cannot reach the next
 * one. This guard therefore asserts the TRIGGER exists — the single point that covers app,
 * governance, bulk and future-SQL writers alike — plus the one-time reconciliation of history.
 *
 * It also asserts the reconciliation stays NON-ECONOMIC: scoped to rows already status='void', and
 * touching no amount column. A future edit that widened it into an amount write is exactly the
 * change that must not pass silently.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "3021-verify-bill-void-markers-agree";
const MIGRATION = path.join(ROOT, "db/migrations/202612480900_bills_sync_void_markers.sql");

const AMOUNT_COLUMNS = ["amount_cents", "paid_cents", "total_amount", "paid_amount"];

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

/**
 * Comments must be stripped before ANY assertion. Found by this guard's own selftest: the
 * "one-way fill only" mutation commented out `NEW.revoked_at :=` and the naive regex still matched
 * the commented line, so the guard passed a migration that had lost half the fix. A guard that reads
 * commented-out SQL as live SQL is worse than no guard — it certifies the defect.
 */
function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

function audit() {
  const problems = [];
  if (!fs.existsSync(MIGRATION)) {
    problems.push(`missing migration ${path.relative(ROOT, MIGRATION)}`);
    return problems;
  }
  const sql = stripSqlComments(fs.readFileSync(MIGRATION, "utf8"));

  if (!/CREATE OR REPLACE FUNCTION\s+accounting\.sync_bill_void_markers\s*\(/i.test(sql)) {
    problems.push("migration must CREATE OR REPLACE FUNCTION accounting.sync_bill_void_markers()");
  }

  // The trigger is the whole fix. Without it the four app writers and every future migration go
  // straight back to writing one marker set.
  if (!/CREATE TRIGGER\s+trg_bills_sync_void_markers/i.test(sql)) {
    problems.push("migration must CREATE TRIGGER trg_bills_sync_void_markers");
  }
  if (!/BEFORE\s+INSERT\s+OR\s+UPDATE\s+ON\s+accounting\.bills/i.test(sql)) {
    problems.push("trigger must be BEFORE INSERT OR UPDATE ON accounting.bills (AFTER cannot rewrite NEW)");
  }

  // Both directions. Filling only one way leaves the other predicate wrong and rebuilds the defect.
  for (const [assigned, from] of [
    ["voided_at", "revoked_at"],
    ["revoked_at", "voided_at"],
  ]) {
    const re = new RegExp(`NEW\\.${assigned}\\s*:=`, "i");
    if (!re.test(sql)) problems.push(`trigger must assign NEW.${assigned} (mirrored from ${from})`);
  }
  for (const col of ["voided_by_user_id", "revoked_by_user_id", "void_reason", "revoked_reason"]) {
    if (!new RegExp(`NEW\\.${col}\\s*:=`, "i").test(sql)) {
      problems.push(`trigger must assign NEW.${col} — actor/reason must not stay half-populated`);
    }
  }

  // Historical reconciliation, owner-authorized 2026-08-11.
  const updateMatch = sql.match(/UPDATE\s+accounting\.bills[\s\S]*?;/i);
  if (!updateMatch) {
    problems.push("migration must reconcile existing rows with an UPDATE accounting.bills");
  } else {
    const stmt = updateMatch[0];
    if (!/WHERE\s+status\s*=\s*'void'/i.test(stmt)) {
      problems.push("reconciliation UPDATE must be scoped WHERE status = 'void' — it may never touch a live bill");
    }
    for (const col of AMOUNT_COLUMNS) {
      if (new RegExp(`\\b${col}\\s*=`, "i").test(stmt)) {
        problems.push(`reconciliation UPDATE writes ${col} — it is marker-only and must touch NO amount column`);
      }
    }
  }

  // Void-not-delete.
  if (/DELETE\s+FROM\s+accounting\.bills/i.test(sql)) {
    problems.push("migration must never DELETE FROM accounting.bills (void-not-delete)");
  }

  return problems;
}

function selftest() {
  const original = fs.readFileSync(MIGRATION, "utf8");
  let planted = 0;

  // Each mutation is a real way this fix could be silently undone by a later edit.
  const mutations = [
    ["trigger removed", (s) => s.replace(/CREATE TRIGGER\s+trg_bills_sync_void_markers/i, "CREATE TRIGGER trg_disabled")],
    ["one-way fill only", (s) => s.replace(/NEW\.revoked_at\s*:=/i, "-- NEW.revoked_at :=")],
    ["actor left half-populated", (s) => s.replace(/NEW\.revoked_by_user_id\s*:=/i, "-- NEW.revoked_by_user_id :=")],
    [
      "reconciliation widened past status='void'",
      (s) => s.replace(/WHERE\s+status\s*=\s*'void'/i, "WHERE true = true"),
    ],
    [
      "reconciliation turned economic",
      (s) => s.replace(/SET voided_at\s*=/i, "SET paid_cents = 0,\n    voided_at ="),
    ],
    ["AFTER instead of BEFORE", (s) => s.replace(/BEFORE\s+INSERT\s+OR\s+UPDATE/i, "AFTER INSERT OR UPDATE")],
  ];

  for (const [name, mutate] of mutations) {
    const broken = mutate(original);
    if (broken === original) fail(`selftest INERT: mutation "${name}" did not apply — the guard proves nothing`);

    // Restore BEFORE failing, never in a finally: fail() calls process.exit(), which does NOT run
    // finally blocks. The first version of this selftest left a mutated migration on disk when it
    // tripped — a guard that corrupts the file it protects when it fails is its own defect.
    fs.writeFileSync(MIGRATION, broken);
    const caught = audit().length === 0 ? `selftest: expected FAIL after mutation "${name}"` : null;
    fs.writeFileSync(MIGRATION, original);
    if (caught) fail(caught);
    planted += 1;
  }

  const clean = audit();
  if (clean.length) fail(`selftest cleanup still red: ${clean.join("; ")}`);
  console.log(`[${LABEL}] SELFTEST PASS (${planted} planted failures detected)`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const problems = audit();
  if (problems.length) {
    for (const p of problems) console.error(` - ${p}`);
    fail(`${problems.length} problem(s)`);
  }
  console.log(`[${LABEL}] PASS`);
}
