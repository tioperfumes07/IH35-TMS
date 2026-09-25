/**
 * ROUND 153 item 10 — reconcile the ledger, each to the cent, pasted. Checks every dimension the
 * Lead's own item 10 names, live against production. Read-only; no AUTH-<NNN> needed.
 *
 * RESULT SUMMARY (see the printed output for exact figures):
 *   TIE (exact, to the cent):
 *     - A/R 1100 = open invoice subledger: $385,232.00 = $385,232.00.
 *     - A/P 2000 = open bills subledger: $0.00 = $0.00 (no live bills yet).
 *     - trial balance: balanced (every posted USMCA JE, always true by double-entry construction,
 *       reconfirmed live).
 *     - balance sheet: Assets $618,139.04 = Liabilities $382,545.04 + Equity (net income)
 *       $235,594.00 -- the book balances to the cent end to end.
 *     - P&L revenue: $441,218.25 = line haul (GL 4000) $440,266.00 + admin/chargeback income
 *       (GL 7200) $952.25 + accessorials (GL 4200-4240) $0.00 (none live yet -- item 3's own
 *       finding: 100% of invoice_lines are still line_type='linehaul').
 *     - driver payables: 114 open driver_finance.driver_bills ($75,333.79) correctly carry NO GL
 *       liability yet -- they have not been through a settlement (GL 2170 Driver Net-Pay Clearing,
 *       $69,538.48, is a DIFFERENT population: settled-but-not-yet-disbursed, the next stage after
 *       a bill closes into a settlement). Two real, distinct stages, not a mismatch.
 *   REAL, NAMED GAPS (measured, not guessed at, not fixed here):
 *     - 2100 escrow: GL $1,275.00 vs the signed documents' own escrow lines (01-ENGINES/
 *       feed_input.json, kind='escrow', TRANSP-range documents excluded) $1,700.00 -- a $425.00
 *       gap. Which specific document(s) are short was not traced in this pass (needs the same
 *       per-document audit method as item 7's own script); named for a focused follow-up.
 *     - 1000 bank: GL cumulative balance $156,924.33 vs banking.bank_accounts' own live-synced
 *       current_balance_cents for the matching Bank of America Operating account (id
 *       e83028a5-dcda-4233-b660-5b9923b3d39c, ledger_account_id confirmed = GL 1000's own account
 *       id) $2,691.36 -- a $154,232.97 gap, the single largest finding in this pass. Real bank
 *       reconciliation (matching each of the ~625 live banking.bank_transactions rows against GL
 *       1000's own postings) is its own substantial undertaking, not attempted here -- named, not
 *       guessed at or force-corrected.
 *   OUT OF LANE, NOT CHECKED HERE:
 *     - Faro reserve / advances vs Faro's own RESERVE REPORT.csv and FUNDS DUE report:
 *       factor.* tables and the factoring posting engine are CC-2's lane per docs/bus/LANES.md
 *       (apps/backend/src/factoring/**, factor.*) -- not audited in this pass to avoid duplicating
 *       or conflicting with CC-2's own active factoring/fuel work tonight.
 *     - 1090 "holds only undeposited receipts": item 4's own scope (fuel/costs guard), now CC-2's
 *       per R-153.6 -- not re-checked here.
 */
import pg from "pg";

const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

function fmt(cents) {
  return `$${(Number(cents) / 100).toFixed(2)}`;
}

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");

  const ar = await client.query(
    `SELECT
       (SELECT COALESCE(SUM(jep.amount_cents) FILTER (WHERE jep.debit_or_credit='debit'),0) - SUM(jep.amount_cents) FILTER (WHERE jep.debit_or_credit='credit')
          FROM accounting.journal_entry_postings jep JOIN accounting.journal_entries je ON je.id=jep.journal_entry_uuid JOIN catalogs.accounts a ON a.id=jep.account_id
         WHERE jep.operating_company_id=$1::uuid AND a.account_number='1100' AND je.status='posted' AND je.is_sample_data IS NOT TRUE)::bigint AS gl_1100,
       (SELECT COALESCE(SUM(amount_open_cents),0) FROM accounting.invoices WHERE operating_company_id=$1::uuid AND voided_at IS NULL)::bigint AS subledger_ar`,
    [USMCA_ID]
  );
  console.log(`A/R 1100 = ${fmt(ar.rows[0].gl_1100)} | invoice subledger = ${fmt(ar.rows[0].subledger_ar)} | ${ar.rows[0].gl_1100 === ar.rows[0].subledger_ar ? "TIE" : "GAP"}`);

  const ap = await client.query(
    `SELECT
       (SELECT COALESCE(SUM(jep.amount_cents) FILTER (WHERE jep.debit_or_credit='credit'),0) - SUM(jep.amount_cents) FILTER (WHERE jep.debit_or_credit='debit')
          FROM accounting.journal_entry_postings jep JOIN accounting.journal_entries je ON je.id=jep.journal_entry_uuid JOIN catalogs.accounts a ON a.id=jep.account_id
         WHERE jep.operating_company_id=$1::uuid AND a.account_number='2000' AND je.status='posted' AND je.is_sample_data IS NOT TRUE)::bigint AS gl_2000,
       (SELECT COALESCE(SUM(amount_cents - paid_cents),0) FROM accounting.bills WHERE operating_company_id=$1::uuid AND status NOT IN ('void','paid'))::bigint AS subledger_ap`,
    [USMCA_ID]
  );
  console.log(`A/P 2000 = ${fmt(ap.rows[0].gl_2000)} | open bills subledger = ${fmt(ap.rows[0].subledger_ap)} | ${ap.rows[0].gl_2000 === ap.rows[0].subledger_ap ? "TIE" : "GAP"}`);

  const tb = await client.query(
    `SELECT COALESCE(SUM(jep.amount_cents) FILTER (WHERE jep.debit_or_credit='debit'),0)::bigint AS d,
            COALESCE(SUM(jep.amount_cents) FILTER (WHERE jep.debit_or_credit='credit'),0)::bigint AS c
       FROM accounting.journal_entry_postings jep JOIN accounting.journal_entries je ON je.id=jep.journal_entry_uuid
      WHERE jep.operating_company_id=$1::uuid AND je.status='posted' AND je.is_sample_data IS NOT TRUE`,
    [USMCA_ID]
  );
  console.log(`trial balance: debits ${fmt(tb.rows[0].d)} = credits ${fmt(tb.rows[0].c)} | ${tb.rows[0].d === tb.rows[0].c ? "BALANCED" : "BROKEN"}`);

  const byType = await client.query(
    `SELECT a.account_type::text,
       SUM(CASE WHEN jep.debit_or_credit='debit' THEN jep.amount_cents ELSE -jep.amount_cents END)::bigint AS net
       FROM accounting.journal_entry_postings jep JOIN accounting.journal_entries je ON je.id=jep.journal_entry_uuid JOIN catalogs.accounts a ON a.id=jep.account_id
      WHERE jep.operating_company_id=$1::uuid AND je.status='posted' AND je.is_sample_data IS NOT TRUE
      GROUP BY a.account_type`,
    [USMCA_ID]
  );
  const byTypeMap = Object.fromEntries(byType.rows.map((r) => [r.account_type, Number(r.net)]));
  const assets = byTypeMap.Asset ?? 0;
  const liabilities = -(byTypeMap.Liability ?? 0);
  const netIncome = -(byTypeMap.Income ?? 0) - (byTypeMap.CostOfGoodsSold ?? 0) - (byTypeMap.Expense ?? 0);
  console.log(`balance sheet: assets ${fmt(assets)} = liabilities ${fmt(liabilities)} + equity(net income) ${fmt(netIncome)} = ${fmt(liabilities + netIncome)} | ${assets === liabilities + netIncome ? "BALANCED" : "BROKEN"}`);

  const income = await client.query(
    `SELECT a.account_number, a.account_name,
       SUM(CASE WHEN jep.debit_or_credit='credit' THEN jep.amount_cents ELSE -jep.amount_cents END)::bigint AS net_credit
       FROM accounting.journal_entry_postings jep JOIN accounting.journal_entries je ON je.id=jep.journal_entry_uuid JOIN catalogs.accounts a ON a.id=jep.account_id
      WHERE jep.operating_company_id=$1::uuid AND a.account_type='Income' AND je.status='posted' AND je.is_sample_data IS NOT TRUE
      GROUP BY a.account_number, a.account_name ORDER BY a.account_number`,
    [USMCA_ID]
  );
  console.log("P&L revenue by account:", income.rows.map((r) => `${r.account_number} ${r.account_name} ${fmt(r.net_credit)}`).join(" | "));

  const escrow2100 = await client.query(
    `SELECT SUM(CASE WHEN jep.debit_or_credit='credit' THEN jep.amount_cents ELSE -jep.amount_cents END)::bigint AS net
       FROM accounting.journal_entry_postings jep JOIN accounting.journal_entries je ON je.id=jep.journal_entry_uuid JOIN catalogs.accounts a ON a.id=jep.account_id
      WHERE jep.operating_company_id=$1::uuid AND a.account_number LIKE '2100%' AND je.status='posted' AND je.is_sample_data IS NOT TRUE`,
    [USMCA_ID]
  );
  console.log(`2100 escrow (all sub-accounts) GL net credit: ${fmt(escrow2100.rows[0].net)}`);

  const bank1000 = await client.query(
    `SELECT
       (SELECT COALESCE(SUM(jep.amount_cents) FILTER (WHERE jep.debit_or_credit='debit'),0) - SUM(jep.amount_cents) FILTER (WHERE jep.debit_or_credit='credit')
          FROM accounting.journal_entry_postings jep JOIN accounting.journal_entries je ON je.id=jep.journal_entry_uuid JOIN catalogs.accounts a ON a.id=jep.account_id
         WHERE jep.operating_company_id=$1::uuid AND a.account_number='1000' AND je.status='posted' AND je.is_sample_data IS NOT TRUE)::bigint AS gl_1000,
       (SELECT current_balance_cents::bigint FROM banking.bank_accounts WHERE operating_company_id=$1::uuid AND ledger_account_id = (SELECT id FROM catalogs.accounts WHERE operating_company_id=$1::uuid AND account_number='1000') LIMIT 1) AS bank_current_balance`,
    [USMCA_ID]
  );
  console.log(`GL 1000 = ${fmt(bank1000.rows[0].gl_1000)} | bank register current_balance_cents = ${fmt(bank1000.rows[0].bank_current_balance)} | ${bank1000.rows[0].gl_1000 === bank1000.rows[0].bank_current_balance ? "TIE" : "GAP"}`);

  const driverBills = await client.query(
    `SELECT status::text, count(*)::int AS n, SUM(gross_amount_cents)::bigint AS total FROM driver_finance.driver_bills WHERE operating_company_id=$1::uuid GROUP BY status ORDER BY status`,
    [USMCA_ID]
  );
  console.log("driver_bills by status:", driverBills.rows.map((r) => `${r.status}: n=${r.n} ${fmt(r.total)}`).join(" | "));

  const gl2170 = await client.query(
    `SELECT SUM(CASE WHEN jep.debit_or_credit='credit' THEN jep.amount_cents ELSE -jep.amount_cents END)::bigint AS net
       FROM accounting.journal_entry_postings jep JOIN accounting.journal_entries je ON je.id=jep.journal_entry_uuid JOIN catalogs.accounts a ON a.id=jep.account_id
      WHERE jep.operating_company_id=$1::uuid AND a.account_number='2170' AND je.status='posted' AND je.is_sample_data IS NOT TRUE`,
    [USMCA_ID]
  );
  console.log(`GL 2170 Driver Net-Pay Clearing net credit: ${fmt(gl2170.rows[0].net)}`);

  await client.query("ROLLBACK");
  await client.end();
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exitCode = 1;
});
