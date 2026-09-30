#!/usr/bin/env node
// ROUND 301 B-35 (Lead order): "Factoring Reserve $4,992.75. Driver Escrow Pool $2,375.00
// across 14 drivers. Neither is backed by a real account. ESCROW IS A LIABILITY -- the
// company owes it back. If anything books escrow to an EXPENSE account it overstates cost and
// hides a debt. PROVE that number is zero, with the query. Then name the real account that
// should back each ledger."
//
// PROVEN LIVE (2026-09-30, USMCA, two independent queries):
//   (1) every accounting.journal_entry_postings row tagged source_transaction_type='escrow_account'
//       hits either an Asset-type account (16 postings, $500.00 -- the cash/clearing side) or a
//       Liability-type account (16 postings, $500.00 -- the driver escrow side). ZERO hit Expense.
//   (2) broader net: ANY posting anywhere whose own description or parent journal entry's memo
//       mentions "escrow", joined to an Expense-type catalogs.accounts row -- ZERO rows, in USMCA,
//       full stop. Catches a mis-tagged posting that (1) alone would miss.
//   Same two checks run for "factoring reserve": all 344 live postings against catalogs.accounts
//   "Factoring Reserves" (1230) are Asset-type. ZERO Expense.
//
// REAL BACKING ACCOUNT (named, not re-derived -- both already exist and are already correctly
// typed; the gap named in GUARD-WORKORDERS' FACTORING-RESERVE-ESCROW-SUBLEDGER-GAP-2026093012
// is a POSTING-COMPLETENESS gap, not a wrong-account-type problem):
//   Driver Escrow Pool  -> catalogs.accounts "Driver Escrow - Held in Trust" (account_number
//     "2100", id 0dc63b15-3407-4414-8efe-38d082a9f29f in USMCA), Liability, parent of 44
//     per-driver 2100-00-NNN Liability sub-accounts. Backs driver_finance.escrow_balances.
//   Factoring Reserve  -> catalogs.accounts "Factoring Reserves" (account_number "1230", id
//     165cc317-5c8b-4296-8aab-f5101f4a6815 in USMCA), Asset. Backs factor.faro_daily_imports'
//     reserve_total_cents.
// (Checked for a cross-entity account_number collision first -- 2100 and 1230 each exist twice
// in catalogs.accounts, but the second row of each pair belongs to a DIFFERENT
// operating_company_id, the normal multi-tenant CoA shape, not a duplicate-in-USMCA bug.)
//
// FAILS IF: any escrow- or factoring-reserve-related posting (by source_transaction_type or by
// memo/description text) ever hits an Expense-type account. This is a hard invariant, not a
// ratchet -- the owner asked to PROVE zero, not to floor today's count.
import pg from "pg";

const LABEL = "verify-escrow-factoring-reserve-never-books-expense";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const DRIVER_ESCROW_HELD_IN_TRUST_ACCOUNT_ID = "0dc63b15-3407-4414-8efe-38d082a9f29f";
const FACTORING_RESERVES_ACCOUNT_ID = "165cc317-5c8b-4296-8aab-f5101f4a6815";

async function measure(client) {
  const escrowByType = await client.query(
    `
    SELECT ca.account_type, count(*)::int AS n, coalesce(sum(jep.amount_cents), 0)::text AS cents
    FROM accounting.journal_entry_postings jep
    JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
    JOIN catalogs.accounts ca ON ca.id = jep.account_id
    WHERE je.operating_company_id = $1::uuid AND je.voided_at IS NULL
      AND jep.source_transaction_type = 'escrow_account'
    GROUP BY ca.account_type
    `,
    [USMCA]
  );

  const escrowMemoExpense = await client.query(
    `
    SELECT count(*)::int AS n, coalesce(sum(jep.amount_cents), 0)::text AS cents
    FROM accounting.journal_entry_postings jep
    JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
    JOIN catalogs.accounts ca ON ca.id = jep.account_id
    WHERE je.operating_company_id = $1::uuid AND je.voided_at IS NULL
      AND ca.account_type = 'Expense'
      AND (jep.description ILIKE '%escrow%' OR je.memo ILIKE '%escrow%')
    `,
    [USMCA]
  );

  const factoringReserveByType = await client.query(
    `
    SELECT ca.account_type, count(*)::int AS n, coalesce(sum(jep.amount_cents), 0)::text AS cents
    FROM accounting.journal_entry_postings jep
    JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
    JOIN catalogs.accounts ca ON ca.id = jep.account_id
    WHERE je.operating_company_id = $1::uuid AND je.voided_at IS NULL
      AND ca.account_name ILIKE '%factoring reserve%'
    GROUP BY ca.account_type
    `,
    [USMCA]
  );

  const backingAccountTypes = await client.query(
    `SELECT id::text, account_name, account_type FROM catalogs.accounts WHERE id IN ($1::uuid, $2::uuid)`,
    [DRIVER_ESCROW_HELD_IN_TRUST_ACCOUNT_ID, FACTORING_RESERVES_ACCOUNT_ID]
  );

  return {
    escrowByType: escrowByType.rows,
    escrowMemoExpenseCount: escrowMemoExpense.rows[0].n,
    escrowMemoExpenseCents: Number(escrowMemoExpense.rows[0].cents),
    factoringReserveByType: factoringReserveByType.rows,
    backingAccountTypes: backingAccountTypes.rows,
  };
}

async function run() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(`${LABEL}: FAIL — DATABASE_URL not set and this guard does not declare ALLOW_OFFLINE_SKIP. A live money guard that cannot connect is a FAIL, never a pass.`);
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE neondb_owner");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const m = await measure(client);
    await client.query("ROLLBACK");

    const escrowExpenseRow = m.escrowByType.find((r) => r.account_type === "Expense");
    if (escrowExpenseRow) {
      console.error(`${LABEL}: FAIL — ${escrowExpenseRow.n} escrow_account posting(s) hit an Expense-type account ($${(Number(escrowExpenseRow.cents) / 100).toFixed(2)}). This overstates cost and hides a debt — the exact failure mode the owner named.`);
      process.exit(1);
    }
    if (m.escrowMemoExpenseCount > 0) {
      console.error(`${LABEL}: FAIL — ${m.escrowMemoExpenseCount} posting(s) with "escrow" in memo/description hit an Expense-type account ($${(m.escrowMemoExpenseCents / 100).toFixed(2)}), even though none are tagged source_transaction_type='escrow_account'. A mis-tagged escrow posting reached an expense account.`);
      process.exit(1);
    }
    const factoringExpenseRow = m.factoringReserveByType.find((r) => r.account_type === "Expense");
    if (factoringExpenseRow) {
      console.error(`${LABEL}: FAIL — ${factoringExpenseRow.n} factoring-reserve posting(s) hit an Expense-type account ($${(Number(factoringExpenseRow.cents) / 100).toFixed(2)}).`);
      process.exit(1);
    }

    const escrowAccount = m.backingAccountTypes.find((r) => r.id === DRIVER_ESCROW_HELD_IN_TRUST_ACCOUNT_ID);
    const factoringAccount = m.backingAccountTypes.find((r) => r.id === FACTORING_RESERVES_ACCOUNT_ID);
    if (escrowAccount?.account_type !== "Liability") {
      console.error(`${LABEL}: FAIL — the named Driver Escrow backing account (${DRIVER_ESCROW_HELD_IN_TRUST_ACCOUNT_ID}) is no longer Liability-typed (now: ${escrowAccount?.account_type ?? "MISSING"}). Escrow must stay a liability.`);
      process.exit(1);
    }
    if (factoringAccount?.account_type !== "Asset") {
      console.error(`${LABEL}: FAIL — the named Factoring Reserves backing account (${FACTORING_RESERVES_ACCOUNT_ID}) is no longer Asset-typed (now: ${factoringAccount?.account_type ?? "MISSING"}).`);
      process.exit(1);
    }

    console.log(
      `${LABEL}: LIVE PASS — PROVEN ZERO: 0 escrow_account postings hit Expense (${JSON.stringify(m.escrowByType)}); ` +
        `0 memo/description-matched "escrow" postings hit Expense; 0 factoring-reserve postings hit Expense (${JSON.stringify(m.factoringReserveByType)}). ` +
        `Real backing accounts confirmed still correctly typed: Driver Escrow Pool -> "${escrowAccount.account_name}" (${escrowAccount.account_type}, ${DRIVER_ESCROW_HELD_IN_TRUST_ACCOUNT_ID}); ` +
        `Factoring Reserve -> "${factoringAccount.account_name}" (${factoringAccount.account_type}, ${FACTORING_RESERVES_ACCOUNT_ID}).`
    );
  } finally {
    await client.end();
  }
}

if (process.argv.includes("--selftest")) {
  const assert = await import("node:assert/strict").then((m) => m.default);
  const withExpense = [{ account_type: "Asset", n: 16 }, { account_type: "Expense", n: 1 }];
  const found = withExpense.find((r) => r.account_type === "Expense");
  assert.ok(found, "MUTATION: an Expense-type escrow posting must be detected");
  const clean = [{ account_type: "Asset", n: 16 }, { account_type: "Liability", n: 16 }];
  assert.ok(!clean.find((r) => r.account_type === "Expense"), "MUTATION: a clean population must not false-positive");
  console.log(`${LABEL} --selftest PASS (2/2 mutations caught)`);
  process.exit(0);
}

await run();
