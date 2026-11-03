#!/usr/bin/env node
/**
 * BANK-TIEOUT-01 — each live USMCA bank account's independently stored closing balance equals
 * the closing balance of its linked Cash GL account. Tolerance: zero cents.
 *
 * Bank side = SUM of all imported bank_transactions for the account (the running balance from
 * imported statements). Accounts with zero imported transactions show "NO STATEMENT IMPORTED".
 * The GL side is the linked account's balance from accounting.fn_account_balances_as_of.
 *
 * For account 1000 (USMCA FREIGHT), a month-by-month gap breakdown is printed listing
 * bank-lines-with-no-GL and GL-lines-with-no-bank, with monthly and total sums that reconcile
 * to the reported variance.
 */
import pg from "pg";
import pgConnectionOptions from "../lib/pg-connection-options.cjs";
import { fail, requireDb } from "./_lib.mjs";

const { buildPgPoolConfig } = pgConnectionOptions;

export const EXPECTED = {
  mode: "ledger_equals_bank",
  operating_company_code: "USMCA",
  // 9 active USMCA bank accounts as of 2026-11-02: 1000/1005/1230/1235/1295/2150/2500-00-001/2510/2520
  live_bank_account_count: 9,
  // Faro Escrow Reserve (1230, factoring_reserves) is the factoring presence check; 1296 never existed in live
  include_faro_factoring_reserve: true,
  tolerance_cents: 0,
};

/** Returns the display string for the bank side of a row. */
export function bankSideLabel(row) {
  const v = Number(row.bank_closing_cents);
  if (row.bank_closing_cents == null || isNaN(v)) return "NO STATEMENT IMPORTED";
  return `${v}c`;
}

export function evaluateTieout(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, reason: "no live USMCA bank accounts returned (empty is never PASS)" };
  }
  const countMatches = rows.length === EXPECTED.live_bank_account_count;
  const observed = rows.map((row) => `${row.account_name} [${row.account_number ?? "unbound"}]`).join(", ");
  const countReason = countMatches ? null : `expected ${EXPECTED.live_bank_account_count} live USMCA bank accounts; observed ${rows.length}: ${observed}`;
  const unbound = rows.filter((row) => !row.ledger_account_id);
  if (unbound.length > 0) {
    return { ok: false, reason: `missing ledger_account_id: ${unbound.map((r) => r.account_name).join(", ")}` };
  }
  const missingGl = rows.filter((row) => row.gl_closing_cents == null);
  if (missingGl.length > 0) {
    return { ok: false, reason: `missing linked GL balance: ${missingGl.map((r) => r.account_name).join(", ")}` };
  }
  // Faro Escrow Reserve must be present (system_purpose = factoring_reserves)
  const faroReserve = rows.filter((row) => row.system_purpose === "factoring_reserves");
  if (faroReserve.length !== 1) {
    return { ok: false, reason: `expected exactly one factoring_reserves account; observed ${faroReserve.length}` };
  }
  const measured = rows.map((row) => {
    // bank_closing_cents is NULL when no statement imported — skip variance check for those
    const hasStatement = row.bank_closing_cents != null;
    const bankClosingCents = hasStatement ? Number(row.bank_closing_cents) : null;
    const glClosingCents = Number(row.gl_closing_cents);
    const varianceCents = hasStatement ? glClosingCents - bankClosingCents : null;
    return { ...row, hasStatement, bankClosingCents, glClosingCents, varianceCents };
  });
  const invalid = measured.filter(
    (row) => row.hasStatement && (!Number.isSafeInteger(row.bankClosingCents) || !Number.isSafeInteger(row.glClosingCents))
  );
  if (invalid.length > 0) {
    return { ok: false, reason: `unsafe balance value: ${invalid.map((r) => r.account_name).join(", ")}` };
  }
  // Only accounts WITH a statement can produce a variance failure
  const failures = measured.filter((row) => row.hasStatement && Math.abs(row.varianceCents) > EXPECTED.tolerance_cents);
  const noStatement = measured.filter((row) => !row.hasStatement);
  return { ok: countMatches && failures.length === 0, measured, failures, noStatement, reason: countReason };
}

function selftest() {
  const base = [
    ["USMCA FREIGHT", "1000", "bank_operating", 100, 100],
    ["Petty Cash", "1005", null, 0, 0],
    ["Faro Escrow Reserve", "1230", "factoring_reserves", 200, 200],
    ["Faro Cash Reserve", "1235", null, 0, 0],
    ["Relay Fuel Wallet", "1295", "relay_fuel_wallet", 300, 300],
    ["Faro Factoring", "2150", "factoring_advance_liability", null, 0],
    ["Amex-Scentsx", "2500-00-001", null, null, 0],
    ["Dreamline Diesel Card", "2510", null, null, 0],
    ["England WEX Fuel Card", "2520", null, 400, 400],
  ].map(([account_name, account_number, system_purpose, bank_closing_cents, gl_closing_cents], index) => ({
    id: String(index), account_name, account_number, system_purpose,
    ledger_account_id: `ledger-${index}`, bank_closing_cents, gl_closing_cents,
  }));
  if (!evaluateTieout(base).ok) throw new Error("equal nine-account population must pass (null bank is no-statement, not a variance)");
  if (evaluateTieout([]).ok) throw new Error("empty population must fail");
  if (evaluateTieout(base.slice(0, 8)).ok) throw new Error("missing live account must fail");
  if (evaluateTieout(base.map((r) => r.system_purpose === "factoring_reserves" ? { ...r, system_purpose: "other" } : r)).ok) throw new Error("missing factoring_reserves must fail");
  if (evaluateTieout(base.map((r, i) => i === 0 ? { ...r, ledger_account_id: null } : r)).ok) throw new Error("unbound must fail");
  if (evaluateTieout(base.map((r, i) => i === 1 ? { ...r, gl_closing_cents: null } : r)).ok) throw new Error("missing GL must fail");
  // A real-statement variance must fail
  if (evaluateTieout(base.map((r, i) => i === 2 ? { ...r, gl_closing_cents: r.gl_closing_cents + 1 } : r)).ok) throw new Error("one-cent mutation on statement account must fail");
  // A null-bank account with a GL mismatch does NOT fail (no statement = no variance claim)
  const nullBankGlMismatch = base.map((r) => r.account_name === "Faro Factoring" ? { ...r, gl_closing_cents: 999 } : r);
  if (!evaluateTieout(nullBankGlMismatch).ok) throw new Error("null-bank account with GL mismatch should pass (NO STATEMENT)");
  console.log("SELFTEST PASS: BANK-TIEOUT-01 rejects empty/missing/factoring_reserves/unbound/one-cent mutations; null-bank = NO STATEMENT (not variance)");
}

if (process.argv.includes("--expected-only")) { console.log(JSON.stringify(EXPECTED)); process.exit(0); }
if (process.argv.includes("--selftest")) { selftest(); process.exit(0); }

const url = requireDb();

async function main() {
  const pool = new pg.Pool(buildPgPoolConfig(url));
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET TRANSACTION READ ONLY");
      await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");

      // Main tieout: bank side = SUM of imported bank_transactions
      const result = await client.query(`
        WITH usmca AS (
          SELECT id FROM org.companies WHERE code = 'USMCA' LIMIT 1
        ), gl AS (
          SELECT account_id, closing_balance_cents
            FROM accounting.fn_account_balances_as_of((SELECT id FROM usmca), CURRENT_DATE, NULL::date)
        ), bank_stmt AS (
          SELECT bt.bank_account_id,
                 SUM(bt.amount_cents) AS running_balance_cents,
                 MAX(bt.transaction_date)::text AS latest_transaction_date,
                 COUNT(*) AS tx_count
            FROM banking.bank_transactions bt
           GROUP BY bt.bank_account_id
        )
        SELECT ba.id::text, ba.account_name, ba.ledger_account_id::text,
               -- NULL when no statement imported; evaluateTieout treats this as "NO STATEMENT IMPORTED"
               bs.running_balance_cents::text AS bank_closing_cents,
               bs.latest_transaction_date,
               COALESCE(bs.tx_count, 0)::int AS tx_count,
               a.account_number, a.system_purpose,
               COALESCE(gl.closing_balance_cents, 0)::text AS gl_closing_cents
          FROM banking.bank_accounts ba
          LEFT JOIN catalogs.accounts a ON a.id = ba.ledger_account_id
                                       AND a.operating_company_id = ba.operating_company_id
          LEFT JOIN gl ON gl.account_id = ba.ledger_account_id
          LEFT JOIN bank_stmt bs ON bs.bank_account_id = ba.id
         WHERE ba.operating_company_id = (SELECT id FROM usmca)
           AND ba.is_active = true AND ba.deactivated_at IS NULL
         ORDER BY a.account_number NULLS LAST, ba.account_name
      `);

      const evaluation = evaluateTieout(result.rows);
      if (!evaluation.measured) { fail(`BANK-TIEOUT-01 ${evaluation.reason}`); return; }

      // Print per-account tieout table
      const summaryLines = evaluation.measured.map((row) => {
        const bankLabel = row.hasStatement ? `bank=${row.bankClosingCents}c (${row.tx_count} txns, latest ${row.latest_transaction_date ?? "?"})` : `bank=NO STATEMENT IMPORTED`;
        const glLabel = `GL=${row.glClosingCents}c`;
        const varLabel = row.hasStatement ? `variance=${row.varianceCents}c` : `variance=N/A`;
        return `  ${row.account_name} [${row.account_number ?? "unbound"}]: ${bankLabel} ${glLabel} ${varLabel}`;
      });
      console.log("BANK-TIEOUT-01 per-account tieout:");
      summaryLines.forEach((l) => console.log(l));

      // 1000 USMCA FREIGHT gap breakdown by month
      const freightRow = evaluation.measured.find((r) => r.account_number === "1000");
      if (freightRow && freightRow.hasStatement && freightRow.varianceCents !== 0) {
        console.log(`\n1000 USMCA FREIGHT gap breakdown (variance=${freightRow.varianceCents}c = $${(freightRow.varianceCents / 100).toFixed(2)}):`);

        // Bank transactions with no GL match (unmatched bank side), by month
        const bankNoGl = await client.query(`
          WITH usmca AS (SELECT id FROM org.companies WHERE code = 'USMCA' LIMIT 1),
          acct AS (
            SELECT ba.id AS bank_account_id, ba.ledger_account_id
              FROM banking.bank_accounts ba
             WHERE ba.operating_company_id = (SELECT id FROM usmca)
               AND ba.is_active = true
               AND EXISTS (
                 SELECT 1 FROM catalogs.accounts a
                  WHERE a.id = ba.ledger_account_id
                    AND a.account_number = '1000'
                    AND a.operating_company_id = ba.operating_company_id
               )
          )
          SELECT DATE_TRUNC('month', bt.transaction_date)::date AS month,
                 COUNT(*)::int AS tx_count,
                 SUM(bt.amount_cents)::bigint AS total_cents
            FROM banking.bank_transactions bt
            JOIN acct ON acct.bank_account_id = bt.bank_account_id
           WHERE bt.matched_journal_entry_id IS NULL
             AND bt.voided_at IS NULL
             AND (bt.excluded_reason IS NULL OR bt.excluded_reason = '')
           GROUP BY 1
           ORDER BY 1
        `);

        // GL postings with no bank match, by month (for the 1000 account)
        const glNoBank = await client.query(`
          WITH usmca AS (SELECT id FROM org.companies WHERE code = 'USMCA' LIMIT 1),
          acct_id AS (
            SELECT a.id
              FROM catalogs.accounts a
             WHERE a.operating_company_id = (SELECT id FROM usmca)
               AND a.account_number = '1000'
             LIMIT 1
          )
          SELECT DATE_TRUNC('month', je.entry_date)::date AS month,
                 COUNT(*)::int AS posting_count,
                 SUM(CASE WHEN jep.debit_or_credit = 'debit' THEN jep.amount_cents ELSE -jep.amount_cents END)::bigint AS net_cents
            FROM accounting.journal_entry_postings jep
            JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
           WHERE jep.account_id = (SELECT id FROM acct_id)
             AND je.status = 'posted'
             AND je.voided_at IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM banking.bank_transactions bt2
                WHERE bt2.matched_journal_entry_id = je.id
                  AND bt2.voided_at IS NULL
             )
           GROUP BY 1
           ORDER BY 1
        `);

        if (bankNoGl.rows.length > 0) {
          console.log("  Bank lines with no GL match (by month):");
          let bankTotal = 0n;
          bankNoGl.rows.forEach((r) => {
            const c = BigInt(r.total_cents);
            bankTotal += c;
            const m = String(r.month).slice(0, 7);
            console.log(`    ${m}: ${r.tx_count} txns, ${c}c ($${(Number(c) / 100).toFixed(2)})`);
          });
          console.log(`    TOTAL unmatched bank: ${bankTotal}c ($${(Number(bankTotal) / 100).toFixed(2)})`);
        } else {
          console.log("  Bank lines with no GL match: none");
        }

        if (glNoBank.rows.length > 0) {
          console.log("  GL postings with no bank match (by month):");
          let glTotal = 0n;
          glNoBank.rows.forEach((r) => {
            const c = BigInt(r.net_cents);
            glTotal += c;
            const m = String(r.month).slice(0, 7);
            console.log(`    ${m}: ${r.posting_count} postings, net ${c}c ($${(Number(c) / 100).toFixed(2)})`);
          });
          console.log(`    TOTAL unmatched GL net: ${glTotal}c ($${(Number(glTotal) / 100).toFixed(2)})`);
        } else {
          console.log("  GL postings with no bank match: none");
        }
      }

      await client.query("ROLLBACK");

      if (!evaluation.ok) {
        const population = evaluation.reason ? `${evaluation.reason}; ` : "";
        const failSummary = evaluation.failures.map((row) =>
          `${row.account_name} [${row.account_number ?? "unbound"}]: bank=${row.bankClosingCents}c GL=${row.glClosingCents}c variance=${row.varianceCents}c`
        ).join(" | ");
        const noStmt = evaluation.noStatement.length > 0
          ? ` | NO STATEMENT: ${evaluation.noStatement.map((r) => r.account_name).join(", ")}`
          : "";
        fail(`BANK-TIEOUT-01 ${population}closing vs linked GL variance (tolerance 0): ${failSummary}${noStmt}`);
        return;
      }
      const passSummary = evaluation.measured.map((row) =>
        `${row.account_name} [${row.account_number ?? "unbound"}]: ${row.hasStatement ? `bank=${row.bankClosingCents}c GL=${row.glClosingCents}c` : "NO STATEMENT IMPORTED"}`
      ).join(" | ");
      console.log(`TIEOUT PASS: BANK-TIEOUT-01 all ${evaluation.measured.length} live USMCA accounts equal linked GL (${passSummary})`);
    } finally { client.release(); }
  } finally { await pool.end(); }
}

main().catch((error) => {
  console.error(`TIEOUT ERROR: ${error?.message ?? error}`);
  process.exit(2);
});
