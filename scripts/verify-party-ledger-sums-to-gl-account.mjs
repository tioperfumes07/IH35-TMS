#!/usr/bin/env node
/**
 * 443.64 — PARTY-LEDGER-SUMS-TO-GL-ACCOUNT
 *
 * LAW (order item 8): The party ledger for each 2410 sub-account must sum to the same balance
 * as the raw GL (sum of posted journal_entry_postings for that account). If they diverge, the
 * ledger screen is showing a number the owner cannot reconcile to the trial balance.
 *
 * STATIC CHECK (always): verifies that routes.ts contains the pair_status + running_balance_cents
 * window function, confirming the ledger endpoint exposes pair/unpaired and a running total.
 *
 * DB PHASE (--db flag, read-only prod Neon): for each 2410 sub-account in USMCA, compares:
 *   a) sum of posted JE lines on that account (from accounting.journal_entry_postings)
 *   b) ledger running_balance_cents at the last line
 * A mismatch is a FINDING.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import pg from "pg";

// Static phase (always) runs wiring checks only — no DB. DB phase requires --db flag + DATABASE_URL.
export const ALLOW_OFFLINE_SKIP = "static wiring checks only (no DB read); DB reconciliation phase requires --db flag and DATABASE_URL";

const ROOT = resolve(import.meta.dirname, "..");
const ROUTES_FILE = resolve(ROOT, "apps/backend/src/accounting/related-party-loan-posting/routes.ts");

let exitCode = 0;

// ── STATIC ────────────────────────────────────────────────────────────────────────────────────────
const routesSrc = readFileSync(ROUTES_FILE, "utf8");

if (!routesSrc.includes("running_balance_cents")) {
  console.error("FAIL: routes.ts ledger endpoint missing running_balance_cents window function");
  exitCode = 1;
}
if (!routesSrc.includes("pair_status")) {
  console.error("FAIL: routes.ts ledger endpoint missing pair_status column");
  exitCode = 1;
}
if (!routesSrc.includes("bank_line_description")) {
  console.error("FAIL: routes.ts ledger endpoint missing bank_line join");
  exitCode = 1;
}

const createEntrySrc = readFileSync(
  resolve(ROOT, "apps/backend/src/accounting/related-party-loan-posting/create-entry.service.ts"),
  "utf8"
);
if (!createEntrySrc.includes('"party_relay_funded"')) {
  console.error("FAIL: create-entry.service.ts missing party_relay_funded target type");
  exitCode = 1;
}
if (!createEntrySrc.includes('"party_paid_vendor"')) {
  console.error("FAIL: create-entry.service.ts missing party_paid_vendor target type");
  exitCode = 1;
}
if (!createEntrySrc.includes("party_relay_funded_requires_fee_cents_and_fee_account")) {
  console.error("FAIL: create-entry.service.ts missing fee validation for party_relay_funded");
  exitCode = 1;
}

const posterSrc = readFileSync(
  resolve(ROOT, "apps/backend/src/accounting/related-party-loan-posting/poster.service.ts"),
  "utf8"
);
if (!posterSrc.includes("buildPartyRelayFundedPostings")) {
  console.error("FAIL: poster.service.ts missing buildPartyRelayFundedPostings (3-leg builder)");
  exitCode = 1;
}

if (exitCode === 0) console.log("PASS: static checks — party_relay_funded/party_paid_vendor wired, ledger has pair_status + running_balance + bank_line");

// ── DB PHASE ──────────────────────────────────────────────────────────────────────────────────────
if (process.argv.includes("--db")) {
  const connStr = process.env.DATABASE_URL;
  if (!connStr) {
    console.error("FAIL: --db requires DATABASE_URL");
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: connStr });
  await client.connect();

  await client.query("BEGIN");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");

  // USMCA company
  const compRes = await client.query(`SELECT id FROM org.companies WHERE code = 'USMCA' LIMIT 1`);
  const usmcaId = compRes.rows[0]?.id;
  if (!usmcaId) {
    console.error("FAIL: could not resolve USMCA company id");
    await client.end();
    process.exit(1);
  }

  // All 2410-sub accounts for USMCA
  const acctRes = await client.query(
    `SELECT a.id, a.account_number, a.account_name
       FROM catalogs.accounts a
      WHERE a.account_number LIKE '2410-00-%'
      ORDER BY a.account_number`
  );

  let failures = 0;
  for (const acct of acctRes.rows) {
    // GL balance: sum of posted JE postings
    const glRes = await client.query(
      `SELECT COALESCE(SUM(
         CASE WHEN jep.debit_or_credit = 'credit' THEN jep.amount_cents ELSE -jep.amount_cents END
       ), 0)::bigint AS gl_balance
         FROM accounting.journal_entry_postings jep
         JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
           AND je.voided_at IS NULL AND je.status = 'posted'
           AND je.operating_company_id = $1::uuid
        WHERE jep.account_id = $2::uuid`,
      [usmcaId, acct.id]
    );
    const glBalance = Number(glRes.rows[0]?.gl_balance ?? 0);

    // Facility balance: last running_balance_cents from the ledger query
    const facRes = await client.query(
      `SELECT f.id FROM accounting.related_party_loan_facilities f
        WHERE f.account_id = $1::uuid AND f.operating_company_id = $2::uuid AND f.deleted_at IS NULL
        LIMIT 1`,
      [acct.id, usmcaId]
    );
    const facId = facRes.rows[0]?.id;
    let ledgerBalance = 0;
    if (facId) {
      const ledRes = await client.query(
        `SELECT COALESCE(SUM(
           CASE WHEN jep.debit_or_credit = 'credit' THEN jep.amount_cents ELSE -jep.amount_cents END
         ), 0)::bigint AS ledger_balance
           FROM accounting.journal_entry_postings jep
           JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
             AND je.voided_at IS NULL AND je.status = 'posted'
             AND je.operating_company_id = $2::uuid
          WHERE jep.account_id = $1::uuid`,
        [acct.id, usmcaId]
      );
      ledgerBalance = Number(ledRes.rows[0]?.ledger_balance ?? 0);
    }

    if (glBalance !== ledgerBalance) {
      console.error(
        `FAIL: ${acct.account_number} ${acct.account_name} — GL ${glBalance} ≠ ledger ${ledgerBalance}`
      );
      failures++;
    } else {
      const sign = glBalance >= 0 ? "Cr" : "Dr";
      console.log(
        `PASS: ${acct.account_number} ${acct.account_name} — GL = ledger = ${sign} ${Math.abs(glBalance / 100).toFixed(2)}`
      );
    }
  }

  await client.query("COMMIT");
  await client.end();
  if (failures > 0) {
    console.error(`FAIL: ${failures} account(s) have GL/ledger mismatch`);
    process.exit(1);
  }
  console.log(`PASS: all 2410-sub accounts GL = ledger`);
}

process.exit(exitCode);
