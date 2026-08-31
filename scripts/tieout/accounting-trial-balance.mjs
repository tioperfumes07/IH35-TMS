#!/usr/bin/env node
/**
 * ACCT-TIEOUT-01 — TMS trial balance ties out two ways, tolerance 0:
 *
 *   1. debits_equal_credits — every live (non-voided) company's journal_entry_postings sum
 *      to zero net (SUM(debit) = SUM(credit)), the fundamental double-entry invariant. This
 *      is checked per operating_company_id, not just globally — a single company could be
 *      unbalanced while the grand total still nets to zero by coincidence.
 *
 *   2. qbo_comparative (read-only, no TMS->QBO write-back) — TRANSP is the ONLY operating
 *      company with a real QBO mirror (docs/CLAUDE.md: "ALL TMS data is test; only the
 *      TRANSP QBO mirror is real"). For each TRANSP catalogs.accounts row that is active,
 *      not deactivated, and linked to a live/active mdata.qbo_accounts row, compare the TMS
 *      GL closing balance (accounting.fn_account_balances_as_of, debit-positive convention)
 *      against QBO's own CurrentBalance from the mirrored raw_payload, in the SAME
 *      debit-positive sign convention (verified by hand against Neon before writing this:
 *      Bank AND Accounts Payable rows both match sign with no type-based flip needed).
 *
 *      Scoped to Balance-Sheet account types only (Bank, Accounts Receivable, Accounts
 *      Payable, Credit Card, Other Current Asset, Other Current Liability, Long Term
 *      Liability, Equity) — QBO's CurrentBalance is always 0 for Income/Expense/Cost of
 *      Goods Sold/Other Expense (verified live: QBO does not track a persistent balance for
 *      P&L account types), so including them would compare a real TMS number against a
 *      structurally-meaningless QBO 0, not an honest tie.
 *
 *      USMCA and TRK are excluded from the QBO leg on purpose — they have no real QBO books
 *      to tie to (USMCA is built from zero; TRK's QBO rows are the same test/parity
 *      scaffolding, not real books either).
 */
import pg from "pg";
import { fail, requireDb } from "./_lib.mjs";
import pgConnectionOptions from "../lib/pg-connection-options.cjs";

const { buildPgPoolConfig } = pgConnectionOptions;

const BS_ACCOUNT_TYPES = [
  "Bank",
  "Accounts Receivable",
  "Accounts Payable",
  "Credit Card",
  "Other Current Asset",
  "Other Current Liability",
  "Long Term Liability",
  "Equity",
];

export const EXPECTED = { debits_equal_credits: true, qbo_comparative: "read_only", tolerance_cents: 0 };

if (process.argv.includes("--expected-only")) {
  console.log(JSON.stringify(EXPECTED));
  process.exit(0);
}

const url = requireDb();

async function main() {
  const pool = new pg.Pool(buildPgPoolConfig(url));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    // R1 mandatory discriminator, same convention as the other tie-outs.
    const jeControl = await client.query(
      "SELECT count(*)::int AS n FROM accounting.journal_entries"
    );
    if (!jeControl.rows[0] || jeControl.rows[0].n < 2219) {
      await client.query("ROLLBACK");
      fail(
        `je_control discriminator too low (${jeControl.rows[0]?.n ?? "null"}, expected >= 2219) — session/bypass context not trusted`
      );
    }

    // Leg 1: debits == credits, per live (non-voided) operating company.
    const tbRes = await client.query(
      `SELECT je.operating_company_id, oc.code,
              SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE 0 END)::bigint AS total_debits,
              SUM(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE 0 END)::bigint AS total_credits
       FROM accounting.journal_entry_postings p
       JOIN accounting.journal_entries je
         ON je.id = p.journal_entry_uuid AND je.operating_company_id = p.operating_company_id
       LEFT JOIN org.companies oc ON oc.id = je.operating_company_id
       WHERE je.status <> 'voided'
       GROUP BY 1, 2`
    );
    const tbDiffs = [];
    for (const row of tbRes.rows) {
      const debits = Number(row.total_debits);
      const credits = Number(row.total_credits);
      if (debits !== credits) {
        tbDiffs.push(
          `${row.code ?? row.operating_company_id}: debits ${debits} != credits ${credits} (diff ${debits - credits})`
        );
      }
    }

    // Leg 2: TRANSP-only, Balance-Sheet account types, read-only tie to the QBO mirror's
    // own CurrentBalance. USMCA/TRK have no real QBO books; P&L types have no QBO balance.
    const qboRes = await client.query(
      `SELECT ca.account_number, ca.account_name, qa.name AS qbo_name, qa.account_type,
              ROUND((qa.raw_payload->>'CurrentBalance')::numeric * 100)::bigint AS qbo_cents,
              COALESCE(gl.closing_balance_cents, 0)::bigint AS tms_cents
       FROM catalogs.accounts ca
       JOIN org.companies oc ON oc.id = ca.operating_company_id
       JOIN mdata.qbo_accounts qa
         ON qa.qbo_id = ca.qbo_account_id AND qa.operating_company_id = ca.operating_company_id
       LEFT JOIN accounting.fn_account_balances_as_of(
         (SELECT id FROM org.companies WHERE code = 'TRANSP'), CURRENT_DATE, NULL::date
       ) gl ON gl.account_id = ca.id
       WHERE oc.code = 'TRANSP'
         AND ca.deactivated_at IS NULL
         AND qa.active = true
         AND qa.account_type = ANY($1::text[])
         AND qa.raw_payload->>'CurrentBalance' IS NOT NULL
       ORDER BY ca.account_number NULLS LAST, ca.account_name`,
      [BS_ACCOUNT_TYPES]
    );
    const qboDiffs = [];
    for (const row of qboRes.rows) {
      const qbo = Number(row.qbo_cents);
      const tms = Number(row.tms_cents);
      if (qbo !== tms) {
        qboDiffs.push(
          `${row.account_name} [${row.account_number ?? "unbound"}] (${row.account_type}): QBO ${qbo}c vs TMS ${tms}c (diff ${tms - qbo})`
        );
      }
    }

    await client.query("COMMIT");

    const observed = {
      debits_equal_credits: tbDiffs.length === 0,
      companies_checked: tbRes.rows.length,
      qbo_accounts_scoped: qboRes.rows.length,
      qbo_accounts_matched: qboRes.rows.length - qboDiffs.length,
      qbo_accounts_mismatched: qboDiffs.length,
    };
    console.log(`TIEOUT OBSERVED: ${JSON.stringify(observed)}`);

    if (tbDiffs.length || qboDiffs.length) {
      const parts = [];
      if (tbDiffs.length) parts.push(`debits_equal_credits FAIL (${tbDiffs.length}):\n  ` + tbDiffs.join("\n  "));
      if (qboDiffs.length)
        parts.push(
          `qbo_comparative FAIL (${qboDiffs.length} of ${qboRes.rows.length} TRANSP balance-sheet accounts mismatched):\n  ` +
            qboDiffs.join("\n  ")
        );
      fail(`ACCT-TIEOUT-01 FAIL:\n` + parts.join("\n"));
    }

    console.log("TIEOUT PASS: TMS trial balance ties (debits=credits per company, TRANSP QBO comparative exact)");
    process.exit(0);
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback failure, the connection is being released regardless
    }
    fail(`ACCT-TIEOUT-01 errored: ${e.message}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
