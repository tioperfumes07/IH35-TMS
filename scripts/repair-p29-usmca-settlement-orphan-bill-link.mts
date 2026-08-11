/**
 * ACCT-F348 recovery (P29 · 29 OF 50) — USMCA settlement S-2026-0002 only.
 *
 * WHAT IS STRANDED. postSettlementBillPayment crashed mid-leg on 2026-08-11 22:04 (the duplicate
 * posting-batch key this finding fixes). It left, on prod:
 *   · run c5caca25 status 'posted' with ZERO driver_settlement_gl_bills rows,
 *   · accounting bill 35b8ce38 (L-20260810-0003, $297.60, unpaid, UNPOSTED) that nothing points at,
 *   · posting batch 6f039b07 'failed' holding that bill's deterministic idempotency key,
 *   · driver_bill 31f155f3 still 'open' — correctly untouched.
 *
 * The code fixes make this state unreachable going forward (the batch is reclaimed instead of
 * duplicated, and the link row is written the moment the bill exists). They cannot heal the row that is
 * ALREADY orphaned: with no link row, the poster re-enters step (a), calls createBill with the same
 * load-numbered bill_number, and the LV-AP-DUP control refuses it.
 *
 * WHAT THIS SCRIPT DOES. It writes the ONE link row the crash prevented — recording a fact that already
 * exists (bill 35b8ce38 was created by run c5caca25 for driver_bill 31f155f3) — and then re-runs the
 * CANONICAL poster, which resumes and posts. It invents no money, moves no cash, creates no document,
 * and touches no entity but USMCA. Every identifier is pinned as a constant and re-verified against the
 * database before anything is written; a single mismatch aborts.
 *
 * Usage: npx tsx scripts/repair-p29-usmca-settlement-orphan-bill-link.mts [--commit]
 */
import pg from "pg";
import { postSettlementBillPayment } from "../apps/backend/src/accounting/settlement-posting/settlement-bill-payment-posting.service.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SETTLEMENT = "9910302b-35df-4882-955a-130b7fb29c7a"; // S-2026-0002
const RUN = "c5caca25-5b8d-458a-a6fa-bdbe8a4a62ce";
const DRIVER_BILL = "31f155f3-d293-4285-80c5-acddd02a5923";
const LOAD = "96ecc9cb-e62c-4ee7-8eed-28514771d984";
const LOAD_NUMBER = "L-20260810-0003";
const ACCOUNTING_BILL = "35b8ce38-151b-48b0-bdb4-f39664cc26bc";
const GROSS_CENTS = 29760;
const ACTOR = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const COMMIT = process.argv.includes("--commit");

const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_DIRECT_URL required");
if (/-pooler\./.test(url)) throw new Error("REFUSING -pooler: session GUCs do not survive transaction pooling under FORCE RLS");

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

async function ledgerNet(c: pg.PoolClient) {
  const r = await c.query<{ net: string; lines: string }>(
    `SELECT COALESCE(sum(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END),0)::text AS net,
            count(*)::text AS lines
       FROM accounting.journal_entry_postings WHERE operating_company_id=$1::uuid`,
    [USMCA]
  );
  return r.rows[0]!;
}

async function glCounts(c: pg.PoolClient) {
  const r = await c.query<{ runs: string; bills: string }>(
    `SELECT (SELECT count(*) FROM driver_finance.driver_settlement_gl_runs WHERE operating_company_id=$1::uuid)::text AS runs,
            (SELECT count(*) FROM driver_finance.driver_settlement_gl_bills WHERE operating_company_id=$1::uuid)::text AS bills`,
    [USMCA]
  );
  return r.rows[0]!;
}

try {
  await client.query(`SELECT set_config('app.bypass_rls','lucia',false)`);
  await client.query(`SELECT set_config('app.operating_company_id',$1,false)`, [USMCA]);

  // ── PRECONDITIONS — every one must hold, or the pinned ids no longer describe reality ────────────
  const pre = await client.query<{
    settlement_status: string;
    run_status: string;
    gl_bill_rows: string;
    bill_status: string;
    bill_amount: string;
    bill_number: string;
    bill_lines: string;
    batch_status: string | null;
    bill_gl_lines: string;
    driver_bill_status: string;
  }>(
    `SELECT s.status AS settlement_status,
            r.status AS run_status,
            (SELECT count(*) FROM driver_finance.driver_settlement_gl_bills gb WHERE gb.run_id = r.id)::text AS gl_bill_rows,
            b.status AS bill_status, b.amount_cents::text AS bill_amount, b.bill_number,
            (SELECT count(*) FROM accounting.bill_lines bl WHERE bl.bill_id = b.id AND bl.voided_at IS NULL)::text AS bill_lines,
            (SELECT pb.batch_status FROM accounting.posting_batches pb
              WHERE pb.operating_company_id = $1::uuid AND pb.source_transaction_id = b.id::text
                AND pb.source_transaction_type = 'bill' LIMIT 1) AS batch_status,
            (SELECT count(*) FROM accounting.journal_entry_postings jep
              WHERE jep.operating_company_id = $1::uuid AND jep.source_transaction_id = b.id::text)::text AS bill_gl_lines,
            db.status AS driver_bill_status
       FROM driver_finance.driver_settlements s
       JOIN driver_finance.driver_settlement_gl_runs r ON r.id = $3::uuid AND r.settlement_id = s.id
       JOIN accounting.bills b ON b.id = $4::uuid AND b.operating_company_id = $1::uuid
       JOIN driver_finance.driver_bills db ON db.id = $5::uuid AND db.operating_company_id = $1::uuid
      WHERE s.id = $2::uuid AND s.operating_company_id = $1::uuid`,
    [USMCA, SETTLEMENT, RUN, ACCOUNTING_BILL, DRIVER_BILL]
  );
  const p = pre.rows[0];
  if (!p) throw new Error("preconditions: the pinned settlement/run/bill/driver_bill set does not exist as described — ABORT");

  const checks: Array<[string, boolean, string]> = [
    ["settlement is locked", p.settlement_status === "locked", p.settlement_status],
    ["run row exists and is the stranded one", p.run_status === "posted", p.run_status],
    ["run has NO gl_bills rows (the missing link)", p.gl_bill_rows === "0", p.gl_bill_rows],
    ["bill is the load-numbered driver-pay bill", p.bill_number === LOAD_NUMBER, p.bill_number],
    ["bill is unpaid", p.bill_status === "unpaid", p.bill_status],
    ["bill is $297.60", p.bill_amount === String(GROSS_CENTS), p.bill_amount],
    ["bill has its single driver-pay line", p.bill_lines === "1", p.bill_lines],
    ["bill's posting batch is 'failed'", p.batch_status === "failed", String(p.batch_status)],
    ["bill posted ZERO GL lines", p.bill_gl_lines === "0", p.bill_gl_lines],
    ["driver_bill still open (untouched)", p.driver_bill_status === "open", p.driver_bill_status],
  ];
  for (const [name, ok, actual] of checks) {
    console.log(`[repair] ${ok ? "OK  " : "FAIL"} ${name} (${actual})`);
  }
  if (checks.some(([, ok]) => !ok)) throw new Error("preconditions changed since this repair was written — ABORT, re-derive before writing anything");

  const beforeLedger = await ledgerNet(client);
  const beforeCounts = await glCounts(client);
  console.log(`[repair] before: USMCA ledger net=${beforeLedger.net}c over ${beforeLedger.lines} lines · gl_runs=${beforeCounts.runs} gl_bills=${beforeCounts.bills}`);
  if (beforeLedger.net !== "0") throw new Error(`USMCA ledger does not net 0 BEFORE the repair (${beforeLedger.net}c) — ABORT`);

  if (!COMMIT) {
    console.log("[repair] DRY RUN — preconditions verified, nothing written. Re-run with --commit to write the link row and resume the poster.");
    process.exit(0);
  }

  // ── WRITE THE ONE MISSING LINK ROW ──────────────────────────────────────────────────────────────
  const ins = await client.query(
    `INSERT INTO driver_finance.driver_settlement_gl_bills
       (operating_company_id, run_id, settlement_id, driver_bill_id, load_id, load_number,
        accounting_bill_id, gross_cents, deduction_cents, cash_cents)
     VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,$7::uuid,$8,0,$8)
     ON CONFLICT (operating_company_id, driver_bill_id) DO NOTHING`,
    [USMCA, RUN, SETTLEMENT, DRIVER_BILL, LOAD, LOAD_NUMBER, ACCOUNTING_BILL, GROSS_CENTS]
  );
  console.log(`[repair] link row written (rowCount=${ins.rowCount}) — bill ${ACCOUNTING_BILL} is now reachable from run ${RUN}`);
} catch (err) {
  console.error(`[repair] ABORTED: ${(err as Error)?.message ?? err}`);
  client.release();
  await pool.end();
  process.exit(1);
}

// ── RESUME THE CANONICAL POSTER ────────────────────────────────────────────────────────────────────
try {
  const result = await postSettlementBillPayment({ operatingCompanyId: USMCA, settlementId: SETTLEMENT }, { userId: ACTOR } as never);
  console.log(`[repair] poster result: ${JSON.stringify(result)}`);

  const after = await glCounts(client);
  const afterLedger = await ledgerNet(client);
  console.log(`[repair] after : gl_runs=${after.runs} gl_bills=${after.bills} · USMCA ledger net=${afterLedger.net}c over ${afterLedger.lines} lines`);

  const batch = await client.query<{ batch_status: string; lines: string }>(
    `SELECT pb.batch_status,
            (SELECT count(*) FROM accounting.journal_entry_postings jep WHERE jep.posting_batch_id = pb.id)::text AS lines
       FROM accounting.posting_batches pb
      WHERE pb.operating_company_id=$1::uuid AND pb.source_transaction_type='bill' AND pb.source_transaction_id=$2`,
    [USMCA, ACCOUNTING_BILL]
  );
  console.log(`[repair] the previously-FAILED batch is now: ${JSON.stringify(batch.rows)}`);

  const je = await client.query<{ jes: string; net: string }>(
    `SELECT count(DISTINCT jep.journal_entry_uuid)::text AS jes,
            COALESCE(sum(CASE WHEN jep.debit_or_credit='debit' THEN jep.amount_cents ELSE -jep.amount_cents END),0)::text AS net
       FROM accounting.journal_entry_postings jep
      WHERE jep.operating_company_id=$1::uuid
        AND jep.source_transaction_id = ANY (
          SELECT gb.accounting_bill_id::text FROM driver_finance.driver_settlement_gl_bills gb
           WHERE gb.operating_company_id=$1::uuid AND gb.settlement_id=$2::uuid
          UNION ALL
          SELECT gb.cash_bill_payment_id::text FROM driver_finance.driver_settlement_gl_bills gb
           WHERE gb.operating_company_id=$1::uuid AND gb.settlement_id=$2::uuid AND gb.cash_bill_payment_id IS NOT NULL
        )`,
    [USMCA, SETTLEMENT]
  );
  console.log(`[repair] settlement JEs=${je.rows[0]!.jes} · net=${je.rows[0]!.net}c`);

  const problems: string[] = [];
  if (Number(after.runs) < 1) problems.push(`gl_runs=${after.runs}`);
  if (Number(after.bills) < 1) problems.push(`gl_bills=${after.bills}`);
  if (je.rows[0]!.net !== "0") problems.push(`settlement GL does not balance: ${je.rows[0]!.net}c`);
  if (afterLedger.net !== "0") problems.push(`USMCA ledger no longer nets 0: ${afterLedger.net}c`);
  if (problems.length) throw new Error(problems.join(" · "));

  console.log("[repair] BUILT — settlement posted to GL: gl_runs + gl_bills > 0, its JEs net 0, and the whole USMCA ledger still nets 0.");
} catch (err) {
  console.error(`[repair] POST FAILED: ${(err as Error)?.message ?? err}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
