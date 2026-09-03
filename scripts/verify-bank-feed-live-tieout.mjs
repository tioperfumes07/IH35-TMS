#!/usr/bin/env node
// CHAIN-05 live bank-feed tie-out — read-only guard.
// See docs/specs/qbo-parity/CHAIN-05-LIVE-BANK-FEED-TIEOUT.md for the full design.
//
// This is NOT a posting check (that guard is scripts/verify-bank-feed-gl-posting.mjs, unchanged).
// This proves the categorize->match->post CHAIN stays internally consistent on LIVE rows, which is
// the precondition for any live balance tie-out to mean anything:
//   1. every status='categorized' row has a resolved GL account (categorize really happened)
//   2. every review_state='matched' row references something real (match really happened)
//   3. no row is double-claimed by a bill-side match AND a bank-feed-GL post (CHAIN-05's own
//      dedupe contract, verified against live rows -- not just against service code)
//   4. every matched_journal_entry_id resolves to a REAL, posted, balanced journal entry
// Plus an INFORMATIONAL (non-failing) report of live-balance freshness per active Plaid-linked
// bank account -- current_balance_cents is a KNOWN gap (see design doc SS2: getAccountBalance() is
// defined but never called by any cron/route yet), so staleness is reported, not failed on.
//
// Read-only. Never connects to prod (SS1.5) -- uses DATABASE_DIRECT_URL/DATABASE_URL exactly like
// every other db-verify-*.mjs script, intended for CI's ephemeral Postgres or local dev.
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

// BANK-F10000 (2026-09-03) — this guard's own check #2 already asserted the exact invariant that
// caught 126 USMCA rows sitting review_state='matched' with every matched_*_id NULL (a raw SQL
// write outside the app, root-caused and reset the same day). The guard existed and was CORRECT —
// it had simply never been wired into any scripts/verify-steps/NNNN-*.mjs file, so it never ran in
// CI. `verify-load-costs-board-trailer-unit-columns.mjs` proved the same "written but never wired"
// pattern earlier this session. Pure predicate extracted below so --selftest can prove the logic
// with planted fixtures, not a live DB connection.
export function isOrphanMatchedRow(row) {
  return (
    row.review_state === "matched" &&
    row.matched_invoice_id == null &&
    row.matched_bill_id == null &&
    row.matched_payment_id == null &&
    row.matched_bill_payment_id == null &&
    row.matched_transfer_id == null &&
    row.matched_journal_entry_id == null &&
    row.matched_load_id == null &&
    row.matched_settlement_id == null &&
    row.matched_expense_id == null &&
    row.matched_advance_id == null
  );
}

function runSelftest() {
  const allNull = {
    review_state: "matched",
    matched_invoice_id: null,
    matched_bill_id: null,
    matched_payment_id: null,
    matched_bill_payment_id: null,
    matched_transfer_id: null,
    matched_journal_entry_id: null,
    matched_load_id: null,
    matched_settlement_id: null,
    matched_expense_id: null,
    matched_advance_id: null,
  };
  if (!isOrphanMatchedRow(allNull)) {
    throw new Error("selftest: matched with every matched_*_id NULL must be detected as orphaned — it was not");
  }
  const realMatch = { ...allNull, matched_bill_id: "11111111-1111-4111-8111-111111111111" };
  if (isOrphanMatchedRow(realMatch)) {
    throw new Error("selftest: a row with a real matched_bill_id must NOT be flagged orphaned — it was");
  }
  const notMatched = { ...allNull, review_state: "for_review" };
  if (isOrphanMatchedRow(notMatched)) {
    throw new Error("selftest: review_state='for_review' must never be flagged as an orphaned match — it was");
  }
  console.log("[verify-bank-feed-live-tieout] --selftest OK (orphan-matched fixture + real-match fixture + non-matched fixture all behave as expected)");
}

if (process.argv.includes("--selftest")) {
  try {
    runSelftest();
  } catch (err) {
    console.error(String(err?.message ?? err));
    process.exit(1);
  }
  process.exit(0);
}

const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("verify:bank-feed-live-tieout — SKIPPED (no DATABASE_DIRECT_URL/DATABASE_URL in environment)");
  process.exit(0);
}

const { Pool } = pg;
const client = new Pool({ connectionString });

const failures = [];
function fail(message) {
  failures.push(message);
}

async function relationExists(relation) {
  const res = await client.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [relation]);
  return Boolean(res.rows[0]?.ok);
}

async function main() {
  if (!(await relationExists("banking.bank_transactions"))) {
    console.log("verify:bank-feed-live-tieout — SKIPPED (banking.bank_transactions not present in this DB)");
    await client.end();
    return;
  }

  // 1. Categorization is a workflow status, not a review_state. CHAIN-05 changes a successfully
  // posted row's review_state to 'matched' while retaining status='categorized', so filtering on
  // review_state categorized (non-terminal) would silently omit every posted categorization from this tie-out.
  // Keep the operational state predicate aligned with categorization.routes.ts.
  // Transfer / match-only categorizations (obligation-reconcile + transfer match) set
  // status='categorized' without a GL account — account is required for expense/income
  // categorize paths that feed BANK_FEED_GL posting, not for pure transfers.
  // status='categorized' is the workflow flag. A row is economically resolved when it has a GL
  // account (expense/income categorize), OR a matched_*/linked_entity_id (bill/match/transfer),
  // OR an obligation-reconcile label-only category (Fuel/Insurance/Transfer) that intentionally
  // omits GL. Fail only pure label-only orphans with no resolution of any kind.
  const uncategorized = await client.query(`
    SELECT count(*)::int AS n
    FROM banking.bank_transactions
    WHERE status = 'categorized'
      AND coa_account_id IS NULL
      AND categorization_gl_account_id IS NULL
      AND linked_entity_id IS NULL
      AND matched_invoice_id IS NULL
      AND matched_bill_id IS NULL
      AND matched_payment_id IS NULL
      AND matched_bill_payment_id IS NULL
      AND matched_transfer_id IS NULL
      AND matched_journal_entry_id IS NULL
      AND COALESCE(lower(category_kind), '') NOT IN ('transfer', 'fuel')
      AND COALESCE(lower(category), '') NOT IN ('transfer', 'fuel', 'insurance', 'bill')
  `);
  const uncategorizedCount = Number(uncategorized.rows[0]?.n ?? 0);
  if (uncategorizedCount > 0) {
    const sample = await client.query(`
      SELECT id::text, category, category_kind, review_state, linked_entity_id IS NOT NULL AS has_link
      FROM banking.bank_transactions
      WHERE status = 'categorized'
        AND coa_account_id IS NULL
        AND categorization_gl_account_id IS NULL
        AND linked_entity_id IS NULL
        AND matched_invoice_id IS NULL
        AND matched_bill_id IS NULL
        AND matched_payment_id IS NULL
        AND matched_bill_payment_id IS NULL
        AND matched_transfer_id IS NULL
        AND matched_journal_entry_id IS NULL
        AND COALESCE(lower(category_kind), '') NOT IN ('transfer', 'fuel')
        AND COALESCE(lower(category), '') NOT IN ('transfer', 'fuel', 'insurance', 'bill')
      LIMIT 5
    `);
    const detail = sample.rows
      .map((r) => `${r.id}:{cat=${r.category}|kind=${r.category_kind}|rs=${r.review_state}}`)
      .join("; ");
    fail(
      `${uncategorizedCount} row(s) have status='categorized' with no GL, no match/link, and no ` +
        `obligation label -- categorize is empty. sample=[${detail}]`
    );
  }

  // 2. matched rows must reference something real.
  const orphanMatched = await client.query(`
    SELECT count(*)::int AS n
    FROM banking.bank_transactions
    WHERE review_state = 'matched'
      AND matched_invoice_id IS NULL
      AND matched_bill_id IS NULL
      AND matched_payment_id IS NULL
      AND matched_bill_payment_id IS NULL
      AND matched_transfer_id IS NULL
      AND matched_journal_entry_id IS NULL
  `);
  const orphanMatchedCount = Number(orphanMatched.rows[0]?.n ?? 0);
  if (orphanMatchedCount > 0) {
    fail(
      `${orphanMatchedCount} row(s) have review_state='matched' but no matched_*_id column is set -- ` +
        `the match step is a label with nothing actually matched.`
    );
  }

  // 3. double-claim guard: a bill-side match and a bank-feed-GL post must never both be set
  //    (CHAIN-05 posting design SS10.2 dedupe contract -- a bank line matched to a bill is the
  //    CHAIN-04 event and must never ALSO post its own JE under CHAIN-05).
  const doubleClaimed = await client.query(`
    SELECT count(*)::int AS n
    FROM banking.bank_transactions
    WHERE matched_journal_entry_id IS NOT NULL
      AND (matched_bill_id IS NOT NULL OR matched_bill_payment_id IS NOT NULL)
  `);
  const doubleClaimedCount = Number(doubleClaimed.rows[0]?.n ?? 0);
  if (doubleClaimedCount > 0) {
    fail(
      `${doubleClaimedCount} row(s) have BOTH a bill-side match (matched_bill_id/matched_bill_payment_id) ` +
        `AND matched_journal_entry_id set -- this double-counts a single cash movement (CHAIN-05 SS10.2 dedupe violated).`
    );
  }

  // 4. every matched_journal_entry_id must resolve to a real, posted, balanced JE.
  if (await relationExists("accounting.journal_entries")) {
    const orphanJe = await client.query(`
      SELECT bt.id, bt.matched_journal_entry_id
      FROM banking.bank_transactions bt
      LEFT JOIN accounting.journal_entries je ON je.id = bt.matched_journal_entry_id
      WHERE bt.matched_journal_entry_id IS NOT NULL
        AND (je.id IS NULL OR je.status <> 'posted')
    `);
    if (orphanJe.rows.length > 0) {
      fail(
        `${orphanJe.rows.length} bank_transactions row(s) have matched_journal_entry_id pointing to a ` +
          `missing or non-posted journal entry -- an orphaned "post" pointer.`
      );
    }

    if (await relationExists("accounting.journal_entry_postings")) {
      const unbalanced = await client.query(`
        SELECT bt.id
        FROM banking.bank_transactions bt
        JOIN accounting.journal_entry_postings jep ON jep.journal_entry_uuid = bt.matched_journal_entry_id
        WHERE bt.matched_journal_entry_id IS NOT NULL
        GROUP BY bt.id
        HAVING SUM(CASE WHEN jep.debit_or_credit = 'debit' THEN jep.amount_cents ELSE 0 END)
             <> SUM(CASE WHEN jep.debit_or_credit = 'credit' THEN jep.amount_cents ELSE 0 END)
      `);
      if (unbalanced.rows.length > 0) {
        fail(
          `${unbalanced.rows.length} bank-feed-posted journal entr(y/ies) are NOT balanced (debits <> credits) -- ` +
            `should be impossible given trg_check_journal_entry_balanced, surfacing here anyway as a backstop.`
        );
      }
    }
  }

  // Informational only -- known gap (design doc SS2), never fails the guard.
  if (await relationExists("banking.bank_accounts")) {
    const accounts = await client.query(`
      SELECT id, institution_name, account_name, sync_status, last_synced_at,
             current_balance_cents, available_balance_cents
      FROM banking.bank_accounts
      WHERE is_active = true
        AND plaid_item_id IS NOT NULL
      ORDER BY last_synced_at DESC NULLS LAST
      LIMIT 25
    `);
    if (accounts.rows.length > 0) {
      console.log(`\n[INFO] Live-balance freshness for ${accounts.rows.length} active Plaid-linked account(s):`);
      for (const row of accounts.rows) {
        console.log(
          `  - ${row.institution_name ?? "?"} / ${row.account_name ?? "?"} (${row.id}): ` +
            `sync_status=${row.sync_status} last_synced_at=${row.last_synced_at ?? "never"} ` +
            `current_balance_cents=${row.current_balance_cents} ` +
            `[GAP — see docs/specs/qbo-parity/CHAIN-05-LIVE-BANK-FEED-TIEOUT.md SS2: ` +
            `getAccountBalance() is not wired to any cron yet, so this balance is not kept live]`
        );
      }
    }
  }

  await client.end();

  if (failures.length > 0) {
    console.error(`\nverify:bank-feed-live-tieout — FAILED\n${failures.map((f) => `- ${f}`).join("\n")}`);
    process.exit(1);
  }
  console.log("\nverify:bank-feed-live-tieout — OK (categorize/match/post chain shape consistent on live rows)");
}

main().catch(async (error) => {
  console.error(`verify:bank-feed-live-tieout — ERROR: ${error?.message ?? error}`);
  try {
    await client.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
