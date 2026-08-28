#!/usr/bin/env node
/**
 * ACCT-F345 — money LEAVING the business was credited to the account that holds money RECEIVED but
 * not yet deposited, so a clearing ASSET went to a credit balance and the bank was overstated.
 *
 * WHAT HAPPENED: buildDriverAdvanceLines / buildDriverReimbursementLines / buildCashAdvanceLines (and
 * the last-resort tier of buildBillPaymentLines) credited resolveCashLikeAccountForCompany() whenever
 * the operator did not pick a source account. That helper returns undeposited_funds, then
 * cash_clearing — both RECEIPT-side. On USMCA both roles resolved to the SAME account (1090), so there
 * was no configuration in which an un-sourced disbursement could reach the real bank. Two driver
 * advances ($250.00 + $100.00) drove 1090 Undeposited Funds to -$350.00: a negative asset, and books
 * claiming $250 more at Bank of America than the bank held, so the reconciliation could not tie.
 *
 * TWO INVARIANTS, because either alone is escapable:
 *   A. DIRECTIONAL — no posting from a DISBURSEMENT source type may CREDIT the account bound to
 *      undeposited_funds or cash_clearing. This is the cause.
 *   B. BALANCE — the account bound to undeposited_funds must never carry a net CREDIT balance. This is
 *      the consequence, and it catches any FUTURE cause this list does not yet know about: a new
 *      poster, a migration, a script. Invariant A is the specific defect; B is the class.
 *
 * Checked per entity, so one company's clean books cannot mask another's.
 *
 * DB-backed. Per the false-empty law it refuses to pass on a zero it cannot corroborate, and it SKIPs
 * rather than crashing as a false money finding when handed a reachable but unmigrated database
 * (the ACCT-F333 lesson: a crash reported as FAIL is a crash, not a finding).
 */
import pg from "pg";

const LABEL = "3057-verify-disbursement-never-credits-receipt-clearing";

/**
 * Source types that move money OUT. Each was verified against prod as an actual
 * journal_entry_postings.source_transaction_type value, not guessed from the code.
 *
 * bill_payment IS INCLUDED. Last-resort buildBillPaymentLines credits operating_bank and throws
 * ACCOUNT_MAPPING_MISSING when unbound. TRANSP operating_bank is QBO-1150040141 (WF …6103).
 * Historical unreversed credits must be WORM-reversed (this guard excludes reversed_by_line_id).
 */
const DISBURSEMENT_SOURCE_TYPES = ["driver_advance", "driver_reimbursement", "cash_advance", "bill_payment"];

/** The receipt-side clearing roles. Crediting either for an outflow is wrong by definition. */
const RECEIPT_CLEARING_ROLES = ["undeposited_funds", "cash_clearing"];

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.log(`[${LABEL}] SKIP — no DATABASE_URL (static context); this guard is DB-backed by design`);
  process.exit(0);
}

const pool = new pg.Pool({ connectionString: url, ssl: url.includes("localhost") ? false : { rejectUnauthorized: false } });
let client;
try {
  client = await pool.connect();
} catch {
  console.log(`[${LABEL}] SKIP — database unreachable (static context)`);
  process.exit(0);
}

try {
  await client.query("BEGIN");
  // FORCED RLS on accounting.*: without this every count reads 0 and the guard certifies a ledger it
  // never saw. SET LOCAL inside the txn — a bare SET does not reliably persist on a pooled connection.
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");

  const present = await client.query(`SELECT to_regclass('accounting.chart_of_accounts_roles') IS NOT NULL AS present`);
  if (!present.rows[0]?.present) {
    await client.query("ROLLBACK").catch(() => {});
    console.log(`[${LABEL}] SKIP — database reachable but the accounting schema is not present (fresh/unmigrated DB)`);
    client.release();
    await pool.end();
    process.exit(0);
  }

  // INVARIANT A — a disbursement crediting a receipt-side clearing account.
  const { rows: badCredits } = await client.query(
    `
      SELECT je.operating_company_id::text AS opco,
             jep.source_transaction_type    AS src,
             a.account_number               AS account_number,
             a.account_name                 AS account_name,
             count(*)::int                  AS lines,
             sum(jep.amount_cents)::bigint  AS credit_cents
        FROM accounting.journal_entry_postings jep
        JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
        JOIN catalogs.accounts a ON a.id = jep.account_id
       WHERE jep.source_transaction_type = ANY($1::text[])
         AND jep.debit_or_credit = 'credit'
         AND je.status = 'posted'
         -- A REVERSED LINE IS NOT A LIVE VIOLATION. Reversal in a WORM ledger writes a NEW opposing
         -- entry; it never deletes the original, so the offending credit line survives forever by
         -- design. Without this clause the guard stays RED after a correct repair — it did exactly
         -- that when the ACCT-F345 repair was rehearsed on a prod fork: 1090 was back to 0.00 and
         -- invariant B passed, while invariant A still flagged the two now-reversed originals.
         -- A guard that cannot go green after the fix it demands is a guard someone deletes.
         AND jep.reversed_by_line_id IS NULL
         -- EXISTS, NOT A JOIN, AND THIS IS THE WHOLE POINT. A posting line matches if its account
         -- plays ANY receipt-clearing role. Joining chart_of_accounts_roles instead FANS OUT one line
         -- into one row PER MATCHING ROLE — and on USMCA both undeposited_funds AND cash_clearing are
         -- bound to the SAME account (1090), so every violation was counted twice: the first run of
         -- this guard reported "4 lines for 700.00" where the truth is 2 lines for 350.00. A guard
         -- that doubles the money it reports sends someone hunting a defect twice the size of the
         -- real one. Caught by cross-checking the guard against a direct query before shipping it.
         AND EXISTS (
           SELECT 1 FROM accounting.chart_of_accounts_roles r
            WHERE r.account_id = jep.account_id
              AND r.operating_company_id = je.operating_company_id
              AND r.is_active = true
              AND r.role = ANY($2::text[])
         )
       GROUP BY 1, 2, 3, 4
       ORDER BY 1, 2
    `,
    [DISBURSEMENT_SOURCE_TYPES, RECEIPT_CLEARING_ROLES]
  );

  // INVARIANT B — the undeposited_funds account carrying a net credit balance, whatever the cause.
  const { rows: negativeClearing } = await client.query(
    `
      SELECT je.operating_company_id::text AS opco,
             a.account_number              AS account_number,
             a.account_name                AS account_name,
             sum(CASE WHEN jep.debit_or_credit = 'debit' THEN jep.amount_cents ELSE -jep.amount_cents END)::bigint AS net_debit_cents
        FROM accounting.chart_of_accounts_roles r
        JOIN catalogs.accounts a ON a.id = r.account_id
        JOIN accounting.journal_entry_postings jep ON jep.account_id = r.account_id
        JOIN accounting.journal_entries je
          ON je.id = jep.journal_entry_uuid
         AND je.operating_company_id = r.operating_company_id
       WHERE r.role = 'undeposited_funds'
         AND r.is_active = true
         AND je.status = 'posted'
       GROUP BY 1, 2, 3
      HAVING sum(CASE WHEN jep.debit_or_credit = 'debit' THEN jep.amount_cents ELSE -jep.amount_cents END) < 0
       ORDER BY 1
    `
  );

  // Completeness discriminator — a clean result proves nothing if nothing was in scope to check.
  const { rows: scope } = await client.query(
    `
      SELECT
        (SELECT count(*) FROM accounting.chart_of_accounts_roles WHERE role = ANY($1::text[]) AND is_active = true)::int AS clearing_roles_bound,
        (SELECT count(*) FROM accounting.journal_entry_postings WHERE source_transaction_type = ANY($2::text[]))::int AS disbursement_lines
    `,
    [RECEIPT_CLEARING_ROLES, DISBURSEMENT_SOURCE_TYPES]
  );
  await client.query("COMMIT");

  const rolesBound = scope[0]?.clearing_roles_bound ?? 0;
  const disbLines = scope[0]?.disbursement_lines ?? 0;
  if (rolesBound === 0) {
    fail(
      "no active undeposited_funds/cash_clearing role bindings found on ANY entity — this guard cannot see what it is meant to check (RLS mask or empty DB), which is not a clean result"
    );
  }

  const problems = [];
  for (const r of badCredits) {
    problems.push(
      `opco ${r.opco}: ${r.lines} ${r.src} posting line(s) CREDIT ${r.account_number} ${r.account_name} for ${(Number(r.credit_cents) / 100).toFixed(2)} — a disbursement must credit the account the money actually left (operating_bank or the operator-chosen source), never a receipt-side clearing account.`
    );
  }
  for (const r of negativeClearing) {
    problems.push(
      `opco ${r.opco}: ${r.account_number} ${r.account_name} (undeposited_funds) carries a NET CREDIT balance of ${(Number(r.net_debit_cents) / 100).toFixed(2)} — an asset holding customer money received-not-yet-deposited cannot be negative; something credited it that should not have.`
    );
  }

  if (problems.length) {
    for (const p of problems) console.error(` - ${p}`);
    fail(`${problems.length} receipt-clearing violation(s) — see ACCT-F345`);
  }

  console.log(
    `[${LABEL}] PASS — no disbursement credits a receipt-side clearing account and no undeposited_funds account is net-credit · ${rolesBound} clearing role binding(s), ${disbLines} disbursement posting line(s) in scope`
  );
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  fail(`query failed: ${err?.message ?? err}`);
} finally {
  client.release();
  await pool.end();
}
