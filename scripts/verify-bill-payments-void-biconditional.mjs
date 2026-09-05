#!/usr/bin/env node
/**
 * verify-bill-payments-void-biconditional — STANDING-DIRECTIVES-2026-09-05.md §CC-1 item 3
 * ("bill_payments dual-void mirror... reconcile guard voided_at IS NOT NULL ⟺ revoked_at IS NOT NULL").
 *
 * ACCT-F5862 (PR #20638, this session) made voidBillPaymentInClientTx write voided_at/void_reason/
 * voided_by_user_id in the SAME UPDATE statement as the pre-existing, functionally-canonical
 * revoked_at/revoked_by_user_id/revoked_reason triplet. That PR's own test asserts the SQL text does
 * both in one statement — this guard is the missing LIVE-DATA half: proving the biconditional actually
 * holds on real rows, not just that the writer's source code looks right, and that it keeps holding as
 * more bill_payments get voided over time (a regression here would mean some OTHER write path bypassed
 * the shared voidBillPaymentInClientTx function).
 *
 * revoked_at stays the functional/read-path truth (posting-engine.service.ts's GL-exemption check) --
 * this guard does not change that. It only asserts the mirror is honest: wherever one is set, the
 * other must be too.
 *
 * DEGRADE-SAFE — matches verify-gl-posting-coverage.mjs's established pattern: no reachable database
 * is a SKIP + exit 0, never a FAIL.
 */
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const LABEL = "verify-bill-payments-void-biconditional";

const QUERY = `
  SELECT id::text, voided_at IS NOT NULL AS has_voided_at, revoked_at IS NOT NULL AS has_revoked_at
  FROM accounting.bill_payments
  WHERE (voided_at IS NOT NULL) IS DISTINCT FROM (revoked_at IS NOT NULL)
`;

const COUNT_QUERY = `SELECT count(*)::int AS total FROM accounting.bill_payments`;

function selftest() {
  // Structural half — no DB needed, runs unconditionally in CI. Asserts the query shape: it must
  // compare voided_at and revoked_at NULL-ness directly against each other (the biconditional), not a
  // one-sided "voided_at required" rule (which would false-positive on rows only ever touched by an
  // older writer, if one existed) and not scoped to any status literal (a void can be represented
  // several ways historically; the two timestamp columns are the real signal here).
  const failures = [];
  if (!/voided_at IS NOT NULL\)\s+IS DISTINCT FROM\s+\(revoked_at IS NOT NULL\)/.test(QUERY)) {
    failures.push("query does not assert the voided_at/revoked_at NULL-ness biconditional");
  }
  if (!/FROM accounting\.bill_payments/.test(QUERY)) failures.push("query does not read accounting.bill_payments");
  if (failures.length) {
    for (const f of failures) console.error(`${LABEL} --selftest FAIL — ${f}`);
    return 1;
  }
  console.log(`${LABEL} --selftest PASS — query shape correct (voided_at<=>revoked_at biconditional on accounting.bill_payments)`);
  return 0;
}

async function main() {
  if (process.argv.includes("--selftest")) return selftest();

  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.log(`${LABEL} SKIP — no DATABASE_URL/DATABASE_DIRECT_URL; live reconciliation cannot be asserted here.`);
    return 0;
  }

  const liveRequested = process.env.BILL_PAYMENTS_VOID_RECONCILE_LIVE === "1";
  if (!liveRequested && (process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true")) {
    console.log(
      `${LABEL} SKIP (live half) — CI's database is a fixture playground, not the books; run with ` +
        `BILL_PAYMENTS_VOID_RECONCILE_LIVE=1 against prod.`
    );
    return 0;
  }

  const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
  const pg = require("pg");
  const client = new pg.Client(buildPgClientConfig(connectionString));

  try {
    await client.connect();
  } catch (error) {
    console.log(`${LABEL} SKIP — database unreachable (${error.code ?? error.message}); live assertion not possible here.`);
    await client.end().catch(() => {});
    return 0;
  }

  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    const total = (await client.query(COUNT_QUERY)).rows[0]?.total ?? 0;
    const mismatched = (await client.query(QUERY)).rows;
    await client.query("COMMIT");

    if (Number(total) === 0) {
      console.log(`${LABEL} SKIP — 0 accounting.bill_payments rows exist; nothing to reconcile.`);
      return 0;
    }

    if (mismatched.length > 0) {
      console.error(`${LABEL} FAIL — ${mismatched.length} of ${total} bill_payments row(s) have voided_at and revoked_at disagreeing on NULL-ness:`);
      for (const r of mismatched.slice(0, 20)) console.error(`  - id=${r.id} has_voided_at=${r.has_voided_at} has_revoked_at=${r.has_revoked_at}`);
      console.error(`  Both must be set together (or both null) — a mismatch means some write path bypassed voidBillPaymentInClientTx's shared mirror.`);
      return 1;
    }

    console.log(`${LABEL} PASS — ${total} accounting.bill_payments row(s) checked, voided_at <=> revoked_at biconditional holds for all.`);
    return 0;
  } finally {
    await client.end().catch(() => {});
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await main());
}
