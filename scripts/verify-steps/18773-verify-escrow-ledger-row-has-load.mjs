/**
 * ENG-03 (CC-1 443.322) — every driver_finance.escrow_ledger row must carry a load_id.
 *
 * Root cause: recordEscrowContribution wrote 'hold' rows without load_id or settlement_id;
 * unwindPayRunSubledgersInClientTx wrote 'release' rows with settlement_id but no load_id.
 * Both are now fixed. Migration 202616240000 backfills the 58 existing NULL rows.
 *
 * Guard: live, target = 0 violations.
 * Step: 18773 (CC-1 ≡1 mod 4, claimed 2026-10-24)
 */
import pg from "pg";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

if (!process.env.DATABASE_URL) {
  console.error("FINDING: ACCT-ENG-03 DATABASE_URL required");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

  const res = await client.query(
    `SELECT COUNT(*)::int AS violations
       FROM driver_finance.escrow_ledger
      WHERE operating_company_id = $1::uuid
        AND load_id IS NULL`,
    [USMCA]
  );

  const violations = res.rows[0].violations;
  if (violations > 0) {
    console.error(
      `FINDING: ACCT-ENG-03 ${violations} driver_finance.escrow_ledger row(s) with NULL load_id — ` +
        `run migration 202616240000 backfill or check the writer path (recordEscrowContribution / unwindPayRunSubledgersInClientTx)`
    );
    process.exit(1);
  }

  console.log(`verify-escrow-ledger-row-has-load PASS — 0 violations (${USMCA})`);
} finally {
  await client.end();
}
