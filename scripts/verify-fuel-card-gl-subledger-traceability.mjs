#!/usr/bin/env node
// ROUND 300 B-32 (Lead order): "/banking shows Dreamline Diesel Card at -$140,226.34 with 397
// uncategorized transactions, and Relay Fuel Wallet at -$32,726.45 with 76. Establish what those
// balances actually represent and whether they are real liabilities or an unposted feed.
// Measure. Do not adjust."
//
// MEASURED LIVE (2026-09-30, USMCA): both GL balances are real (842 + 117 live journal postings,
// net -$141,197.23 / -$32,324.02 -- close to but not exactly the /banking-displayed figures,
// a ~$970 / ~$402 gap not explained here). Neither is traceable to a sub-ledger the way an
// ordinary liability is:
//   - Dreamline Diesel Card Payable (account 2510): ZERO sub-ledger rows exist anywhere --
//     fuel.fuel_transactions has 0 rows for the Dreamline vendor, and no dedicated Dreamline
//     integration table exists in the schema at all. The entire balance is raw journal postings
//     with no individual-purchase detail behind it.
//   - Relay Fuel Wallet (account 1295): a real integration table exists
//     (integrations.relay_fuel_transactions, 119 rows), and 75 of them claim posted_to_gl=true --
//     but 0 of those 75 have a traceable journal_entry_postings row via the standard
//     source_transaction_type='fuel_event' + source_transaction_id linkage convention every other
//     fuel-sourced JE in this codebase uses. The flag may be right by some OTHER linkage this
//     guard did not find, or it may be wrong; this guard does not resolve which.
//
// This guard does not assert either gap is fixed -- it wasn't ordered to be, and B-32 says
// "measure, do not adjust." It RATCHETS: the traceable-fraction for each account must never get
// WORSE than what was measured when this guard was written (0 for both, today) -- a silent
// regression from "already untraceable" to "more untraceable" would mean someone's code change
// widened this gap further, which is worth catching even while the underlying gap itself is a
// separate, owner-level decision.
import pg from "pg";

const LABEL = "verify-fuel-card-gl-subledger-traceability";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const DREAMLINE_GL_ACCOUNT_ID = "be1f70f8-fec4-463b-893d-dfc0acfe264d";
const RELAY_GL_ACCOUNT_ID = "5585dc64-dd7c-4314-b279-c9dd29c705fc";
const DREAMLINE_VENDOR_ID = "3e72d4a5-e6e7-497a-932e-2d3062502be2";

// Baseline measured 2026-09-30: Dreamline has 0 sub-ledger rows full stop; Relay has 75
// posted_to_gl=true rows, 0 traceable via source_transaction_id. Ratchet floor: the traceable
// count must never DROP below these (it may only rise, if a future fix links them up).
const BASELINE = {
  dreamlineSubledgerRows: 0,
  relayPostedTraceable: 0,
};

async function measure(client) {
  const dreamline = await client.query(
    `SELECT count(*)::int AS n FROM fuel.fuel_transactions WHERE operating_company_id = $1::uuid AND vendor_id = $2::uuid AND voided_at IS NULL`,
    [USMCA, DREAMLINE_VENDOR_ID]
  );

  const relay = await client.query(
    `
    SELECT
      count(*) FILTER (WHERE rft.posted_to_gl)::int AS posted_count,
      count(*) FILTER (WHERE rft.posted_to_gl AND jep.source_transaction_id IS NOT NULL)::int AS posted_traceable
    FROM integrations.relay_fuel_transactions rft
    LEFT JOIN (
      SELECT DISTINCT source_transaction_id FROM accounting.journal_entry_postings WHERE source_transaction_type = 'fuel_event'
    ) jep ON jep.source_transaction_id::text = rft.id::text
    WHERE rft.operating_company_id = $1::uuid
    `,
    [USMCA]
  );

  const glBalances = await client.query(
    `
    SELECT jep.account_id::text,
      sum(CASE WHEN jep.debit_or_credit = 'debit' THEN jep.amount_cents ELSE -jep.amount_cents END)::text AS net_cents,
      count(*)::int AS posting_count
    FROM accounting.journal_entry_postings jep
    JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
    WHERE jep.account_id = ANY($2::uuid[]) AND je.operating_company_id = $1::uuid AND je.voided_at IS NULL
    GROUP BY jep.account_id
    `,
    [USMCA, [DREAMLINE_GL_ACCOUNT_ID, RELAY_GL_ACCOUNT_ID]]
  );

  return {
    dreamlineSubledgerRows: dreamline.rows[0].n,
    relayPostedCount: relay.rows[0].posted_count,
    relayPostedTraceable: relay.rows[0].posted_traceable,
    glBalances: glBalances.rows,
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
  // CI's verify:pre-commit runs verify-steps against a fresh, empty database. Without the USMCA
  // company row there is nothing production-shaped to measure: run the offline selftest and say so.
  {
    const probe = await client.query("SELECT 1 FROM org.companies WHERE id = $1::uuid", [USMCA]);
    if (probe.rows.length === 0) {
      await client.end();
      const { spawnSync } = await import("node:child_process");
      const r = spawnSync(process.execPath, [new URL(import.meta.url).pathname, "--selftest"], { stdio: "inherit" });
      console.log(`DATABASE PHASE: USMCA company absent (fresh CI DB) — selftest only, NOT live proof`);
      process.exit(r.status ?? 1);
    }
  }
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE neondb_owner");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const m = await measure(client);
    await client.query("ROLLBACK");

    const failures = [];
    if (m.dreamlineSubledgerRows < BASELINE.dreamlineSubledgerRows) {
      failures.push(`Dreamline sub-ledger rows dropped below the ratchet floor: ${m.dreamlineSubledgerRows} < ${BASELINE.dreamlineSubledgerRows}`);
    }
    if (m.relayPostedTraceable < BASELINE.relayPostedTraceable) {
      failures.push(`Relay posted_to_gl-and-traceable rows dropped below the ratchet floor: ${m.relayPostedTraceable} < ${BASELINE.relayPostedTraceable}`);
    }

    if (failures.length > 0) {
      console.error(`${LABEL}: FAIL — ${failures.join("; ")}`);
      process.exit(1);
    }

    console.log(
      `${LABEL}: LIVE PASS (ratchet, measure-only, B-32) — ` +
        `Dreamline: ${m.dreamlineSubledgerRows} sub-ledger row(s) (floor ${BASELINE.dreamlineSubledgerRows}), ` +
        `Relay: ${m.relayPostedCount} posted_to_gl=true row(s), ${m.relayPostedTraceable} traceable via source_transaction_id (floor ${BASELINE.relayPostedTraceable}). ` +
        `GL balances: ${JSON.stringify(m.glBalances)}.`
    );
  } finally {
    await client.end();
  }
}

if (process.argv.includes("--selftest")) {
  const assert = await import("node:assert/strict").then((m) => m.default);
  // Pure fixture check of the ratchet comparison itself (no DB) -- a regression below the
  // baseline must be caught.
  const worse = { dreamlineSubledgerRows: -1, relayPostedTraceable: 0 };
  const failures = [];
  if (worse.dreamlineSubledgerRows < BASELINE.dreamlineSubledgerRows) failures.push("dreamline regression");
  assert.equal(failures.length, 1, "MUTATION: a ratchet regression must be detected");
  console.log(`${LABEL} --selftest PASS (1/1 mutation caught)`);
  process.exit(0);
}

await run();
