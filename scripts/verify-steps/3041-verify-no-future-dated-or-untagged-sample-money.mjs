#!/usr/bin/env node
/**
 * OWNER-VOID-ALL-USMCA-2026-08-11 step 4 — the ratchet that makes the purge stick.
 *
 * What actually happened: USMCA carried 14 bank transactions dated 2027-01-05 → 2027-07-05 and 24
 * SAMPLE-marked bank rows, plus 32 test bills flagged `is_sample_data = false` — roughly $4.8k of fake
 * payables reading as real. NOTHING detected it. The owner found the 2027 dates BY EYE. Every guard in
 * the suite was green the whole time.
 *
 * Two distinct hazards, deliberately guarded separately:
 *
 *   1. FUTURE-DATED money. A bank transaction dated months ahead is never legitimate operational data —
 *      it is a test fixture or a typo, and it silently corrupts every period report it lands in.
 *   2. TEST-NAMED money that is NOT sample-flagged. A row called SAMPLE-…/CC3-…/GATEB-… with
 *      `is_sample_data = false` is indistinguishable from real money to every report, because no report
 *      reads names — which is exactly how $4,800.87 of fake A/P sat in live books.
 *
 * This guard is DB-BACKED (needs DATABASE_URL). Per the false-empty law it will not report a clean
 * result from a zero it cannot corroborate: every count is paired with a completeness discriminator on
 * the SAME table, and a total of 0 rows means "cannot verify", not "clean".
 *
 * Skips cleanly with an explicit SKIP line when no database is reachable (verify:static runs with a
 * dead-port sentinel), so it never fakes green in a no-DB context.
 *
 * CI-3041-BANK-TXNS-SCHEMA-CI (2026-08-11): `build-typecheck`'s ephemeral CI Postgres IS reachable —
 * DATABASE_URL points at a live service container — but this guard runs early in the verify-step sweep
 * against whatever schema state exists at that point, and `banking.bank_transactions` was undefined
 * there: a genuine "relation does not exist" (Postgres 42P01), not a query bug. The old catch-all
 * treated that identically to a real assertion failure and hard-FAILed every PR, including ones that
 * never touched banking or accounting. This guard's whole PURPOSE is reading LIVE production-shaped
 * data (see false-empty law above) — a throwaway DB missing the schema it needs is the exact same
 * "cannot verify" case as an unreachable database, not a "verified and it's dirty" case. Fixed by
 * classifying 42P01 on one of THIS guard's own tables as SKIP, same as the two existing no-DB SKIPs.
 * Any other error (syntax, permission, connection reset mid-query, a column that vanished) still FAILs
 * loud — only "the specific relation this guard reads doesn't exist yet" is treated as unverifiable.
 */
import pg from "pg";

const LABEL = "3041-verify-no-future-dated-or-untagged-sample-money";
const FUTURE_DAYS = 30;
const TEST_NAME_RE = "(SAMPLE|CC3-|GATEB|REPROVE|USMCA_GATEB_SAMPLE)";
const GUARDED_RELATIONS = ["banking.bank_transactions", "accounting.bills", "accounting.invoices"];

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

/**
 * True when `err` is Postgres 42P01 (undefined_table) on one of the tables THIS guard reads — i.e. the
 * schema this guard depends on simply isn't provisioned in the current DB context. Scoped to
 * GUARDED_RELATIONS on purpose: an undefined-table error on some unrelated relation should still FAIL
 * loud rather than be waved through as "just a missing schema".
 */
export function isMissingGuardedRelation(err) {
  if (!err || err.code !== "42P01") return false;
  const msg = String(err.message ?? "");
  return GUARDED_RELATIONS.some((rel) => msg.includes(rel) || msg.includes(rel.split(".")[1]));
}

if (process.argv.includes("--selftest")) {
  const missing = { code: "42P01", message: 'relation "banking.bank_transactions" does not exist' };
  const missingOther = { code: "42P01", message: 'relation "accounting.invoices" does not exist' };
  const unrelatedTable = { code: "42P01", message: 'relation "foo.bar_widgets" does not exist' };
  const syntaxError = { code: "42601", message: "syntax error at or near" };
  const connReset = { code: "08006", message: "connection reset by peer" };
  if (!isMissingGuardedRelation(missing)) fail("selftest: 42P01 on banking.bank_transactions must classify as SKIP");
  if (!isMissingGuardedRelation(missingOther)) fail("selftest: 42P01 on accounting.invoices must classify as SKIP");
  if (isMissingGuardedRelation(unrelatedTable)) fail("selftest: 42P01 on an unrelated relation must NOT classify as SKIP — over-broad");
  if (isMissingGuardedRelation(syntaxError)) fail("selftest: a syntax error must NOT classify as SKIP");
  if (isMissingGuardedRelation(connReset)) fail("selftest: a connection error must NOT classify as SKIP");
  console.log(`[${LABEL}] selftest: PASS — 42P01 on a guarded relation SKIPs; every other error still FAILs`);
  process.exit(0);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.log(`[${LABEL}] SKIP — no DATABASE_URL (static context); this guard is DB-backed by design`);
  process.exit(0);
}

const pool = new pg.Pool({ connectionString: url, ssl: url.includes("localhost") ? false : { rejectUnauthorized: false } });
let client;
try {
  client = await pool.connect();
} catch {
  console.log(`[${LABEL}] SKIP — database unreachable (static context)`);
  process.exit(0);
}

try {
  await client.query("BEGIN");
  // RLS is FORCED on banking.* / accounting.*: without this, every count reads 0 and the guard would
  // certify a clean ledger it never actually looked at. SET LOCAL inside the txn — a bare SET does not
  // reliably persist on a pooled connection (learned executing this purge: a masked 0 read exactly like
  // a finished job).
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");

  const { rows } = await client.query(
    `
      SELECT
        (SELECT count(*) FROM banking.bank_transactions) AS bank_total,
        (SELECT count(*) FROM banking.bank_transactions
          WHERE voided_at IS NULL AND transaction_date > current_date + ($1 || ' days')::interval) AS bank_future,
        (SELECT count(*) FROM accounting.bills) AS bills_total,
        (SELECT count(*) FROM accounting.bills
          WHERE revoked_at IS NULL AND voided_at IS NULL
            AND COALESCE(bill_number,'') ~* $2
            AND COALESCE(is_sample_data,false) = false) AS bills_test_untagged,
        (SELECT count(*) FROM accounting.invoices) AS invoices_total,
        (SELECT count(*) FROM accounting.invoices
          WHERE status <> 'void' AND voided_at IS NULL
            AND COALESCE(internal_notes,'') ~* $2
            AND COALESCE(is_sample_data,false) = false) AS invoices_test_untagged
    `,
    [String(FUTURE_DAYS), TEST_NAME_RE]
  );
  await client.query("COMMIT");

  const r = rows[0] ?? {};
  const n = (k) => Number(r[k] ?? 0);
  const problems = [];

  // Completeness discriminator: a 0 on an EMPTY table proves nothing.
  if (n("bank_total") === 0 && n("bills_total") === 0 && n("invoices_total") === 0) {
    fail(
      "every source table read 0 rows — that is an unverifiable read (RLS mask or empty DB), not a clean result. Re-run against a database with data."
    );
  }

  if (n("bank_future") > 0) {
    problems.push(
      `${n("bank_future")} active bank transaction(s) dated more than ${FUTURE_DAYS} days in the future (of ${n("bank_total")} total). Future-dated money is a test fixture or a typo — it corrupts every period report it lands in. This is the exact defect the owner found by eye on 2026-08-11 (14 rows dated 2027).`
    );
  }
  if (n("bills_test_untagged") > 0) {
    problems.push(
      `${n("bills_test_untagged")} open bill(s) carry a test marker in bill_number but is_sample_data=false (of ${n("bills_total")} total). No report reads names, so these are indistinguishable from real A/P — $4,800.87 sat in live books this way.`
    );
  }
  if (n("invoices_test_untagged") > 0) {
    problems.push(
      `${n("invoices_test_untagged")} open invoice(s) carry a test marker but is_sample_data=false (of ${n("invoices_total")} total). Same class as the bills above, on the A/R side.`
    );
  }

  if (problems.length) {
    for (const p of problems) console.error(` - ${p}`);
    fail(`${problems.length} problem(s) — test/future-dated money is live in the ledger`);
  }

  console.log(
    `[${LABEL}] PASS — 0 future-dated (>${FUTURE_DAYS}d) active bank txns of ${n("bank_total")}; 0 untagged test bills of ${n("bills_total")}; 0 untagged test invoices of ${n("invoices_total")}`
  );
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  if (isMissingGuardedRelation(err)) {
    // Same posture as the no-DATABASE_URL / unreachable-DB SKIPs above: the process is exiting either
    // way, so no cleanup dance — just report and go, matching this file's own established style.
    console.log(
      `[${LABEL}] SKIP — ${err.message} (schema not provisioned in this DB context; this guard is DB-backed by design, same class as no-DATABASE_URL / unreachable-DB)`
    );
    process.exit(0);
  }
  fail(`query failed: ${err?.message ?? err}`);
} finally {
  client.release();
  await pool.end();
}
