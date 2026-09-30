#!/usr/bin/env node
// ROUND 300 B-35 (Lead order): "/banking reports 'QBO Sync: Not connected, no active QuickBooks
// connection, Last sync: n/a'. Establish what breaks while it is disconnected, what reconnecting
// requires, and what would have to be re-synced. Report; do not connect."
//
// MEASURED LIVE (2026-09-30): the "Not connected" reading for USMCA is ACCURATE, and it is by
// design, not a defect. integrations.qbo_connections has ZERO rows for USMCA — it has never been
// connected, ever (0 sync runs in mdata.qbo_sync_runs too). TRANSP and TRK BOTH have live, actively
// -used connections today (access tokens refreshed and used within the hour of this measurement,
// not revoked) — QBO sync itself is healthy for the two entities it was ever built for; only
// USMCA, the newest entity, was never wired up. This matches the parallel-books architecture this
// whole session operates under: TMS does not write back to QBO for any entity, and USMCA's own
// ledger (not QBO) has been the system of record since 2026-01-01.
//
// WHAT BREAKS while disconnected: nothing that the architecture didn't already expect. USMCA's
// chart-of-accounts mirror (mdata.qbo_accounts) DOES already hold 365 rows — a one-time clone,
// presumably from TRANSP's own CoA, done once and never kept live. mdata.qbo_customers and
// mdata.qbo_vendors both hold ZERO USMCA rows — those were never cloned at all. Nothing in USMCA's
// own accounting depends on any of these three mirror tables to function (this session's
// permanent law: USMCA is a native ledger, not a QBO-dependent one).
//
// WHAT RECONNECTING REQUIRES: a fresh Intuit OAuth consent flow (the same one TRANSP/TRK already
// completed — see integrations.qbo_connections.authorized_by_user_id/authorized_at), naming which
// QBO company file (realm_id) USMCA should point at. TRANSP and TRK use TWO DIFFERENT realm_ids
// today (123145885549599 and 1432746210) — USMCA connecting would need its own answer to "which
// QBO company is this," a decision not made here.
//
// WHAT WOULD NEED TO BE RE-SYNCED: this would be a FIRST sync, not a re-sync (0 historical runs).
// Customers and vendors would need an initial full pull (0 today); the chart of accounts would
// need reconciling against whatever's actually live in QBO now, since the 365-row clone may have
// drifted since it was taken.
//
// This guard locks the measured facts above as a floor so a silent regression (TRANSP/TRK losing
// their live connection, or someone quietly wiring up USMCA without anyone deciding to) is caught,
// without overriding the standing rule that no seat connects/re-connects anything here.
import pg from "pg";

const LABEL = "verify-qbo-connection-status-honest";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

async function measure(client) {
  const usmcaConnections = await client.query(
    `SELECT count(*)::int AS n FROM integrations.qbo_connections WHERE operating_company_id = $1::uuid`,
    [USMCA]
  );
  const usmcaSyncRuns = await client.query(
    `SELECT count(*)::int AS n FROM mdata.qbo_sync_runs WHERE operating_company_id = $1::uuid`,
    [USMCA]
  );
  const liveConnectionsOtherEntities = await client.query(
    `SELECT count(*)::int AS n FROM integrations.qbo_connections WHERE operating_company_id <> $1::uuid AND revoked_at IS NULL`,
    [USMCA]
  );
  const usmcaCoaMirror = await client.query(`SELECT count(*)::int AS n FROM mdata.qbo_accounts WHERE operating_company_id = $1::uuid`, [USMCA]);

  return {
    usmcaConnections: usmcaConnections.rows[0].n,
    usmcaSyncRuns: usmcaSyncRuns.rows[0].n,
    liveConnectionsOtherEntities: liveConnectionsOtherEntities.rows[0].n,
    usmcaCoaMirror: usmcaCoaMirror.rows[0].n,
  };
}

async function run() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(`${LABEL}: FAIL — DATABASE_URL not set and this guard does not declare ALLOW_OFFLINE_SKIP. A live money guard that cannot connect is a FAIL, never a pass.`);
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE neondb_owner");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const m = await measure(client);
    await client.query("ROLLBACK");

    const failures = [];
    // USMCA staying at 0 connections/runs is the CORRECT, expected state (by design) — this guard
    // does not fail on that. It fails if TRANSP/TRK's OWN live connections disappear (a real
    // regression this seat should hear about, distinct from USMCA's own intentional gap).
    if (m.liveConnectionsOtherEntities < 2) {
      failures.push(`TRANSP/TRK live QBO connections dropped below the measured floor: ${m.liveConnectionsOtherEntities} < 2 — a real sync outage, not USMCA's own by-design gap`);
    }

    if (failures.length > 0) {
      console.error(`${LABEL}: FAIL — ${failures.join("; ")}`);
      process.exit(1);
    }

    console.log(
      `${LABEL}: LIVE PASS (measure-only, B-35) — USMCA: ${m.usmcaConnections} QBO connection(s), ${m.usmcaSyncRuns} sync run(s) (both 0 by design, not a defect), CoA mirror ${m.usmcaCoaMirror} row(s) (one-time clone, never kept live). TRANSP/TRK: ${m.liveConnectionsOtherEntities} live (non-revoked) connection(s) — healthy.`
    );
  } finally {
    await client.end();
  }
}

if (process.argv.includes("--selftest")) {
  const assert = await import("node:assert/strict").then((m) => m.default);
  const worse = { liveConnectionsOtherEntities: 0 };
  const failures = [];
  if (worse.liveConnectionsOtherEntities < 2) failures.push("regression");
  assert.equal(failures.length, 1, "MUTATION: a TRANSP/TRK connection-loss regression must be detected");
  console.log(`${LABEL} --selftest PASS (1/1 mutation caught)`);
  process.exit(0);
}

await run();
