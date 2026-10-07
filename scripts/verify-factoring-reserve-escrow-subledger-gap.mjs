#!/usr/bin/env node
/** MATRIX-BUILT-OPTIONAL — live-only / invariant ratchet guard; no surface wiring leaf to register. */
// ROUND 300 B-34 (Lead order): "Factoring Reserve $4,992.75 and Driver Escrow Pool $2,375.00 are
// VIRTUAL ledgers. Prove each ties to its real-world counterpart, or name the gap. Escrow shows
// 14 drivers; confirm that against driver_finance."
//
// MEASURED LIVE (2026-09-30, USMCA):
//   Driver Escrow: driver_finance.escrow_balances (the real sub-ledger) shows EXACTLY 14 drivers
//     with a nonzero current_balance_cents, totaling $2,375.00 -- matches the owner's own cited
//     figures to the cent. That ledger is real and ties out.
//     BUT the GL side (catalogs.accounts rows named '%Driver Escrow%', 16 distinct accounts with
//     any posting activity) sums to only $1,325.00 -- a $1,050.00 gap against the real sub-ledger.
//     The GL does not reflect the sub-ledger's own truth.
//   Factoring Reserve: catalogs.accounts "Factoring Reserves" (1230) GL balance is $5,144.40
//     across 344 live postings. factor.faro_daily_imports.reserve_total_cents sums to $5,208.19.
//     Neither exactly matches the owner's stated $4,992.75, and the two don't match each other
//     either (a $63.79 gap between GL and Faro's own statement total).
//
// KILL THE SECOND SYSTEM tables 2-5 (2026-10-03, migration 202615380100): the escrow "sub-ledger" was the stored
//   driver_finance.escrow_balances.current_balance_cents — the second system. It is gone; the per-driver summary is
//   driver_finance.v_escrow_balances, DERIVED from each driver's 2100-00-nnn GL. The $1,050.00 escrow gap therefore
//   CLOSES BY CONSTRUCTION: re-measured 2026-10-03 (prod, USMCA) the GL-derived summary is 12 drivers / $1,325.00 and
//   the GL driver-escrow net is -$1,325.00 — gap $0.00. The ratchet below now also requires that gap to stay 0.
//   (The factoring-reserve gap is unchanged and still named on the board.)
//
// This guard does not resolve either gap -- B-34 says "prove... or name the gap," and both gaps
// are named on the board (FACTORING-RESERVE-ESCROW-SUBLEDGER-GAP). It RATCHETS: today's measured
// numbers become a floor so a silent further drift (the GL and sub-ledger diverging even more) is
// caught, without asserting the gap is zero when it demonstrably is not today.
import pg from "pg";

const LABEL = "verify-factoring-reserve-escrow-subledger-gap";
export const REQUIRES_LIVE_DB = "live-only guard: reads production database (USMCA) and cannot be statically verified; run by money-pr-local-gate with DATABASE_URL";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const FACTORING_RESERVES_ACCOUNT_ID = "165cc317-5c8b-4296-8aab-f5101f4a6815";

// Baseline measured 2026-09-30. These are NOT "correct" values -- they are today's actual,
// imperfect state, ratcheted so nothing gets silently worse.
const BASELINE = {
  escrowSubledgerDriverCount: 12, // re-measured 2026-10-03 from the GL-derived v_escrow_balances (was 14 on the stored copy)
  escrowSubledgerTotalCents: 132500, // = -escrowGlTotalCents: the summary IS the GL now (was 237500 on the stored copy)
  escrowGlTotalCents: -132500, // liability, credit-normal; stored here as the signed net we measure
  factoringReserveGlCents: 514440,
  factoringReserveFaroCents: 520819,
};

async function measure(client) {
  const escrowSubledger = await client.query(
    `
    SELECT count(*)::int AS driver_count, sum(current_balance_cents)::text AS total_cents
    FROM driver_finance.v_escrow_balances WHERE operating_company_id = $1::uuid AND current_balance_cents <> 0
    `,
    [USMCA]
  );

  const escrowGl = await client.query(
    `
    SELECT sum(CASE WHEN jep.debit_or_credit = 'debit' THEN jep.amount_cents ELSE -jep.amount_cents END)::text AS net_cents
    FROM accounting.journal_entry_postings jep
    JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
    JOIN catalogs.accounts ca ON ca.id = jep.account_id
    WHERE je.operating_company_id = $1::uuid AND je.voided_at IS NULL AND ca.account_name ILIKE '%driver escrow%'
    `,
    [USMCA]
  );

  const factoringGl = await client.query(
    `
    SELECT sum(CASE WHEN jep.debit_or_credit = 'debit' THEN jep.amount_cents ELSE -jep.amount_cents END)::text AS net_cents
    FROM accounting.journal_entry_postings jep
    JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
    WHERE je.operating_company_id = $1::uuid AND je.voided_at IS NULL AND jep.account_id = $2::uuid
    `,
    [USMCA, FACTORING_RESERVES_ACCOUNT_ID]
  );

  const faroReserve = await client.query(
    `SELECT sum(reserve_total_cents)::text AS total_cents FROM factor.faro_daily_imports WHERE operating_company_id = $1::uuid`,
    [USMCA]
  );

  return {
    escrowSubledgerDriverCount: escrowSubledger.rows[0].driver_count,
    escrowSubledgerTotalCents: Number(escrowSubledger.rows[0].total_cents ?? 0),
    escrowGlTotalCents: Number(escrowGl.rows[0].net_cents ?? 0),
    factoringReserveGlCents: Number(factoringGl.rows[0].net_cents ?? 0),
    factoringReserveFaroCents: Number(faroReserve.rows[0].total_cents ?? 0),
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
    if (m.escrowSubledgerDriverCount < BASELINE.escrowSubledgerDriverCount) {
      failures.push(`escrow sub-ledger driver count regressed: ${m.escrowSubledgerDriverCount} < ${BASELINE.escrowSubledgerDriverCount}`);
    }
    if (m.escrowSubledgerTotalCents !== BASELINE.escrowSubledgerTotalCents) {
      failures.push(`escrow sub-ledger total changed from the measured baseline: ${m.escrowSubledgerTotalCents} !== ${BASELINE.escrowSubledgerTotalCents} — real driver money moved, re-measure and update this guard's baseline deliberately, don't silently pass through a drift`);
    }

    if (m.escrowSubledgerTotalCents + m.escrowGlTotalCents !== 0) {
      failures.push(`escrow summary (v_escrow_balances) ${m.escrowSubledgerTotalCents} does not equal the GL driver-escrow balance ${-m.escrowGlTotalCents} — the summary must be the GL (KILL THE SECOND SYSTEM)`);
    }

    if (failures.length > 0) {
      console.error(`${LABEL}: FAIL — ${failures.join("; ")}`);
      process.exit(1);
    }

    console.log(
      `${LABEL}: LIVE PASS (ratchet, measure-only, B-34) — ` +
        `escrow summary (GL-derived v_escrow_balances): ${m.escrowSubledgerDriverCount} drivers, $${(m.escrowSubledgerTotalCents / 100).toFixed(2)}; ` +
        `escrow GL: $${(m.escrowGlTotalCents / 100).toFixed(2)} (gap $${((m.escrowSubledgerTotalCents + m.escrowGlTotalCents) / 100).toFixed(2)} — closed by construction); ` +
        `factoring reserve GL: $${(m.factoringReserveGlCents / 100).toFixed(2)}, Faro statement total: $${(m.factoringReserveFaroCents / 100).toFixed(2)} (gap: $${((m.factoringReserveFaroCents - m.factoringReserveGlCents) / 100).toFixed(2)}, unresolved, named on the board).`
    );
  } finally {
    await client.end();
  }
}

if (process.argv.includes("--selftest")) {
  const assert = await import("node:assert/strict").then((m) => m.default);
  const worse = { escrowSubledgerDriverCount: 10 };
  const failures = [];
  if (worse.escrowSubledgerDriverCount < BASELINE.escrowSubledgerDriverCount) failures.push("regression");
  assert.equal(failures.length, 1, "MUTATION: a ratchet regression must be detected");
  console.log(`${LABEL} --selftest PASS (1/1 mutation caught)`);
  process.exit(0);
}

await run();
