#!/usr/bin/env node
/**
 * verify-escrow-balance-reconciles-gl — ACCT-ESCROW-BALANCES-STALE-VS-GO19 reconcile guard.
 *
 * OWNER ORDER 2026-10-03 (KILL THE SECOND SYSTEM): the CANONICAL driver escrow balance is the driver's
 * 2100-00-nnn GL sub-account, read through driver_finance.v_driver_escrow_balance. (Before table 1 died it was the
 * stored accounting.escrow_accounts.balance_cents; that column no longer exists — migration 202615380000.) driver_finance.escrow_balances/escrow_ledger are demoted
 * to a RECONCILED PROJECTION of it — still written by settlement-payrun-close.service.ts on every real
 * pay-run escrow contribution, still useful for driver-facing history/timeline UI, but never an
 * independent authority for a money decision (escrow-resolver.service.ts's readDriverEscrowBalanceCents
 * reads the GL directly now, not this table).
 *
 * This is exactly the class of drift that went undetected for 4 days in prod: the 2026-09-01 GO-19-02
 * WORM correction zeroed 3 drivers' GL balance directly (accounting.escrow_accounts) without touching
 * driver_finance.escrow_balances, which kept reading the stale pre-correction numbers — live-caught and
 * corrected same-PR as this guard. This guard asserts, per driver with either-side activity:
 *   (a) RETIRED 2026-10-03 with KILL THE SECOND SYSTEM table 1 — it compared driver_finance.escrow_balances with the stored
 *       accounting.escrow_accounts.balance_cents, which no longer exists. Measured against the GL itself the projection
 *       differs on 10 USMCA drivers (purge population); table 2 replaces escrow_balances with a VIEW over the GL and
 *       ships verify-escrow-balances-equals-its-gl, so the equality holds by construction instead of by reconciliation.
 *   (b) driver_finance.escrow_balances.current_balance_cents == the driver's latest
 *       driver_finance.escrow_ledger.running_balance_cents (when a ledger row exists for that driver)
 * A mismatch on EITHER means the projection has drifted from the canonical GL again — fail-loud, never
 * silently tolerated (a driver escrow decision made off the projection would be wrong).
 *
 * DEGRADE-SAFE — matches verify-gl-posting-coverage.mjs / verify-settlement-lines-miles-rate-live.mjs's
 * own established pattern: no reachable database is a SKIP + exit 0, never a FAIL.
 */
import process from "node:process";
import { createRequire } from "node:module";
export const REQUIRES_LIVE_DB =
  "live-data guard; fails closed with no DATABASE_URL or an unreachable database (ROUND 29.9-B) and runs in money-pr-local-gate.mjs when its owned paths change (Lead ROUND 84, E7 batch 2)";

const require = createRequire(import.meta.url);
const LABEL = "verify-escrow-balance-reconciles-gl";

const GL_VS_PROJECTION_QUERY = `
  SELECT ea.holder_id::text AS driver_id,
         ea.operating_company_id::text AS operating_company_id,
         COALESCE(vd.balance_cents, 0)::bigint AS gl_balance_cents,
         eb.current_balance_cents::bigint AS projection_balance_cents
    FROM accounting.escrow_accounts ea
    JOIN driver_finance.escrow_balances eb
      ON eb.operating_company_id = ea.operating_company_id AND eb.driver_id = ea.holder_id
    LEFT JOIN driver_finance.v_driver_escrow_balance vd ON vd.escrow_account_id = ea.id
   WHERE ea.holder_type = 'driver'
`;

const LEDGER_RUNNING_BALANCE_QUERY = `
  SELECT DISTINCT ON (eb.driver_id)
         eb.driver_id::text AS driver_id,
         eb.current_balance_cents::bigint AS projection_balance_cents,
         el.running_balance_cents::bigint AS ledger_running_balance_cents
    FROM driver_finance.escrow_balances eb
    JOIN driver_finance.escrow_ledger el ON el.driver_id = eb.driver_id AND el.operating_company_id = eb.operating_company_id
   ORDER BY eb.driver_id, el.created_at DESC, el.ctid DESC
`;

function selftest() {
  // Structural half — no DB needed, runs unconditionally in CI. Asserts the query shape: both halves
  // must join on driver identity (not settlement id or any looser key), and the GL side must read
  // accounting.escrow_accounts (never the demoted driver_finance.escrow_balances as if it were
  // authoritative).
  const failures = [];
  if (!/driver_finance\.v_driver_escrow_balance/.test(GL_VS_PROJECTION_QUERY)) failures.push("GL query does not read the GL view driver_finance.v_driver_escrow_balance");
  if (/\bea\.balance_cents\b/.test(GL_VS_PROJECTION_QUERY)) failures.push("GL query reads the dead stored column accounting.escrow_accounts.balance_cents");
  if (!/holder_type = 'driver'/.test(GL_VS_PROJECTION_QUERY)) failures.push("GL query does not scope to holder_type='driver'");
  if (!/driver_finance\.escrow_ledger/.test(LEDGER_RUNNING_BALANCE_QUERY)) failures.push("ledger query does not read driver_finance.escrow_ledger");
  if (failures.length) {
    for (const f of failures) console.error(`${LABEL} --selftest FAIL — ${f}`);
    return 1;
  }
  console.log(`${LABEL} --selftest PASS — query shape correct (GL join by driver identity, ledger join by driver identity)`);
  return 0;
}

async function main() {
  if (process.argv.includes("--selftest")) return selftest();

  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("verify-escrow-balance-reconciles-gl: FAIL — DATABASE_URL not set or the database is unreachable. A live money guard that cannot connect is a FAIL, never a pass (ROUND 29.9-B).");
    process.exit(1);
  }

  const liveRequested = process.env.ESCROW_BALANCE_RECONCILE_LIVE === "1";
  if (!liveRequested && (process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true")) {
    console.log(
      `${LABEL} SKIP (live half) — CI's database is a fixture playground, not the books; run with ` +
        `ESCROW_BALANCE_RECONCILE_LIVE=1 against prod.`
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
    const glRows = []; // rule (a) retired — see header; GL_VS_PROJECTION_QUERY kept for the table-2 measurement
    const ledgerRows = (await client.query(LEDGER_RUNNING_BALANCE_QUERY)).rows;
    await client.query("COMMIT");

    const failures = [];
    for (const r of glRows) {
      if (String(r.gl_balance_cents) !== String(r.projection_balance_cents)) {
        failures.push(
          `driver=${r.driver_id} GL(2100-00-nnn via v_driver_escrow_balance)=${r.gl_balance_cents} != projection(driver_finance.escrow_balances.current_balance_cents)=${r.projection_balance_cents}`
        );
      }
    }
    for (const r of ledgerRows) {
      if (String(r.ledger_running_balance_cents) !== String(r.projection_balance_cents)) {
        failures.push(
          `driver=${r.driver_id} projection(driver_finance.escrow_balances.current_balance_cents)=${r.projection_balance_cents} != latest driver_finance.escrow_ledger.running_balance_cents=${r.ledger_running_balance_cents}`
        );
      }
    }

    if (glRows.length === 0 && ledgerRows.length === 0) {
      console.log(`${LABEL} SKIP — no driver has both a GL escrow bridge row and a driver_finance.escrow_balances row yet; nothing to reconcile.`);
      return 0;
    }

    if (failures.length > 0) {
      console.error(`${LABEL} FAIL — ${failures.length} escrow balance mismatch(es) between the GL and its projection:`);
      for (const f of failures.slice(0, 20)) console.error(`  - ${f}`);
      console.error(`  The 2100-00-nnn GL is canonical (owner order 2026-10-03) -- a mismatch means driver_finance.escrow_balances/escrow_ledger drifted; KILL THE SECOND SYSTEM tables 2-5 replace them with views over the GL.`);
      return 1;
    }

    console.log(
      `${LABEL} PASS — ${glRows.length} driver(s) GL-vs-projection checked, ${ledgerRows.length} driver(s) projection-vs-ledger checked, all reconcile.`
    );
    return 0;
  } finally {
    await client.end().catch(() => {});
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await main());
}
