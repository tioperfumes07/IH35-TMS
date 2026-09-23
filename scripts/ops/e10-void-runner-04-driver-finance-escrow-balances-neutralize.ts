#!/usr/bin/env tsx
// E10 -- DRIVER_FINANCE.ESCROW_BALANCES NEUTRALIZATION (Round 94, owner-ordered). Distinct from
// accounting.escrow_accounts (e10-void-runner-02, already done). This is the driver-finance-side
// pay-run cap summary sub-ledger: driver_finance.escrow_balances (current_balance_cents,
// total_held_cents) + driver_finance.escrow_ledger (the detail rows).
//
// Uses the EXACT existing writer shape from settlement-payrun-reverse.service.ts's own escrow-
// contribution-reversal step (lines ~256-282): UPDATE escrow_balances
// (total_held_cents=GREATEST(0,...-X), current_balance_cents=current_balance_cents-X), then INSERT
// one escrow_ledger 'release' row via signedEscrowLedgerAmountCents. No new GL math -- this table
// has no JE of its own; it never did.
//
// PROVING GROUND ONLY: br-spring-dream-akk31fyt (the Lead's own clean copy of production at LSN
// E7/9936D28, named for this exact task), never br-sweet-math-akyen17f (truncated), never
// production.
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { signedEscrowLedgerAmountCents } from "../../apps/backend/src/driver-finance/escrow-ledger-sign.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

async function main() {
  const executeFlag = process.argv.includes("--execute");
  const url = process.env.DATABASE_URL ?? "";
  if (!process.env.ROUND271_ALLOW_HOST) throw new Error("ABORT: requires ROUND271_ALLOW_HOST naming the exact proving-ground host.");
  if (!url.includes(process.env.ROUND271_ALLOW_HOST!)) throw new Error("ABORT: DATABASE_URL host does not match ROUND271_ALLOW_HOST.");
  if (/ep-broad-block-akykk7bw/.test(url)) throw new Error("ABORT: refusing the production compute host, by name, unconditionally.");

  const pool = new pg.Pool({ connectionString: url, max: 1, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  await client.query("RESET ROLE");
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
  await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA_COMPANY_ID]);

  const before = await client.query<{ n: string; total: string }>(
    `SELECT count(*)::text AS n, COALESCE(sum(current_balance_cents),0)::text AS total
       FROM driver_finance.escrow_balances WHERE operating_company_id = $1::uuid`,
    [USMCA_COMPANY_ID]
  );
  console.log(`BEFORE: driver_finance.escrow_balances -- ${before.rows[0]!.n} rows, sum $${(Number(before.rows[0]!.total) / 100).toFixed(2)}`);

  const rows = await client.query<{ driver_id: string; current_balance_cents: string }>(
    `SELECT driver_id::text, current_balance_cents::text FROM driver_finance.escrow_balances
      WHERE operating_company_id = $1::uuid AND current_balance_cents <> 0
      ORDER BY driver_id`,
    [USMCA_COMPANY_ID]
  );
  console.log(`Nonzero rows to neutralize: ${rows.rowCount}`);

  if (!executeFlag) {
    for (const r of rows.rows) console.log(`  would release driver ${r.driver_id}: $${(Number(r.current_balance_cents) / 100).toFixed(2)}`);
    client.release();
    await pool.end();
    console.log("\nDRY RUN -- no writes made.");
    return;
  }

  let neutralized = 0;
  for (const r of rows.rows) {
    const releaseCents = Number(r.current_balance_cents);
    if (releaseCents <= 0) {
      console.log(`  SKIP driver ${r.driver_id}: current_balance_cents=${releaseCents} is not positive -- releasing would push it further from zero, not toward it. Named, not guessed.`);
      continue;
    }
    const balRes = await client.query<{ id: string; current_balance_cents: number }>(
      `UPDATE driver_finance.escrow_balances
          SET total_held_cents = GREATEST(0, total_held_cents - $3),
              current_balance_cents = current_balance_cents - $3,
              last_updated_at = now()
        WHERE operating_company_id = $1::uuid AND driver_id = $2::uuid
        RETURNING id::text, current_balance_cents`,
      [USMCA_COMPANY_ID, r.driver_id, releaseCents]
    );
    const balanceRow = balRes.rows[0];
    if (!balanceRow) continue;
    await client.query(
      `INSERT INTO driver_finance.escrow_ledger
         (operating_company_id, driver_id, escrow_balance_id, transaction_type, amount_cents, running_balance_cents, description)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'release', $4, $5, $6)`,
      [
        USMCA_COMPANY_ID,
        r.driver_id,
        balanceRow.id,
        signedEscrowLedgerAmountCents("release", releaseCents),
        balanceRow.current_balance_cents,
        `E10 void-runner reconciliation release -- driver_finance.escrow_balances neutralization ` +
          `(distinct from accounting.escrow_accounts, handled separately). Proving ground only.`,
      ]
    );
    neutralized++;
  }
  console.log(`Neutralized ${neutralized} rows.`);

  const after = await client.query<{ n: string; total: string; nonzero: string }>(
    `SELECT count(*)::text AS n, COALESCE(sum(current_balance_cents),0)::text AS total,
            count(*) FILTER (WHERE current_balance_cents <> 0)::text AS nonzero
       FROM driver_finance.escrow_balances WHERE operating_company_id = $1::uuid`,
    [USMCA_COMPANY_ID]
  );
  console.log(`\nAFTER: driver_finance.escrow_balances -- ${after.rows[0]!.n} rows, sum $${(Number(after.rows[0]!.total) / 100).toFixed(2)}, nonzero=${after.rows[0]!.nonzero}`);

  client.release();
  await pool.end();
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
