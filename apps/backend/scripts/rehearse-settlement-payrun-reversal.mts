/**
 * REHEARSAL — run the REAL reverseSettlementPayRunInClientTx against an ISOLATED Neon branch.
 * Proves the equal-and-opposite JE reversal fires and the sub-ledgers (advance/escrow/disbursement)
 * land right, BEFORE the engine ever touches prod. Claude's GO gate #2.
 *
 * Usage: REHEARSAL_DB_URL="postgresql://…branch…" npx tsx scripts/rehearse-settlement-payrun-reversal.mts <settlementId>
 * Writes ONLY to the rehearsal branch (never prod). Prints before/after + the engine's own proof.
 */
import pg from "pg";
import { reverseSettlementPayRunInClientTx } from "../src/driver-finance/settlement-payrun-reverse.service.js";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const SETTLEMENT = process.argv[2] || "67ad9ed4-439a-4b0b-b4eb-7610f01b1584"; // S-13644 Alfonso
const url = process.env.REHEARSAL_DB_URL;
if (!url) throw new Error("REHEARSAL_DB_URL required (the isolated branch connection string)");
if (!/neon\.tech/.test(url)) throw new Error("refuses to run against a non-Neon URL");

function money(rows: { rows: any[] }) {
  return rows.rows;
}

async function snapshot(client: pg.PoolClient, label: string) {
  const je = await client.query(
    `SELECT COUNT(*)::int n, COALESCE(SUM(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END),0)::bigint signed
       FROM accounting.journal_entry_postings WHERE operating_company_id=$1 AND journal_entry_uuid IN
       (SELECT journal_entry_id FROM driver_finance.payrun_gl_runs WHERE settlement_id=$2)`,
    [OPCO, SETTLEMENT]
  );
  const run = await client.query(
    `SELECT status, journal_entry_id::text FROM driver_finance.payrun_gl_runs WHERE settlement_id=$1`,
    [SETTLEMENT]
  );
  const sett = await client.query(
    `SELECT posted_at, payment_method FROM driver_finance.driver_settlements WHERE id=$1`,
    [SETTLEMENT]
  );
  const adv = await client.query(
    `SELECT COUNT(*)::int recovered FROM driver_finance.driver_advances WHERE recovered_in_settlement_id=$1`,
    [SETTLEMENT]
  );
  console.log(`\n--- ${label} ---`);
  console.log("run:", run.rows[0]);
  console.log("settlement.posted_at:", sett.rows[0]?.posted_at, "payment_method:", sett.rows[0]?.payment_method);
  console.log("advances recovered_in_settlement:", adv.rows[0]?.recovered);
}

async function main() {
  const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    await client.query("SELECT set_config('app.operating_company_id',$1,true)", [OPCO]);

    await snapshot(client as unknown as pg.PoolClient, "BEFORE");

    const res = await reverseSettlementPayRunInClientTx(
      client as never,
      { operatingCompanyId: OPCO, settlementId: SETTLEMENT, reason: "REHEARSAL — Neon branch, not prod" },
      { userId: ACTOR },
      new Date().toISOString().slice(0, 10)
    );
    console.log("\n=== ENGINE RESULT ===");
    console.log(res);

    // Independent equal-and-opposite proof across original + reversal JE at (account,class,entity) grain.
    const proof = await client.query(
      `WITH sel AS (
         SELECT account_id, class_id, entity_uuid,
                CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END s
         FROM accounting.journal_entry_postings
         WHERE operating_company_id=$1 AND journal_entry_uuid = ANY($2::uuid[]))
       SELECT COUNT(*) FILTER (WHERE r<>0)::int nonzero, COALESCE(SUM(ABS(r)),0)::bigint residual
       FROM (SELECT SUM(s) r FROM sel GROUP BY account_id,class_id,entity_uuid) d`,
      [OPCO, [
        (await client.query(`SELECT journal_entry_id FROM driver_finance.payrun_gl_runs WHERE settlement_id=$1`, [SETTLEMENT])).rows[0]?.journal_entry_id,
        res.reversal_journal_entry_id,
      ]]
    );
    console.log("\n=== INDEPENDENT EQUAL-AND-OPPOSITE PROOF ===");
    console.log(proof.rows[0], "(nonzero dims must be 0, residual_cents must be 0)");

    await snapshot(client as unknown as pg.PoolClient, "AFTER");

    await client.query("COMMIT");
    console.log("\nCOMMITTED to rehearsal branch (isolated). Prod untouched.");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("\nROLLED BACK — engine threw:", e);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
