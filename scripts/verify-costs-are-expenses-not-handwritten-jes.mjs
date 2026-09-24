#!/usr/bin/env node
// GUARD — verify-costs-are-expenses-not-handwritten-jes (ROUND E23, Q01, DEVIN-B)
//
// A cost-of-revenue or expense JE (debiting a 5xxx or 6xxx account) must have a
// corresponding accounting.expenses row. The posting engine creates the expense
// row AND the JE together — a JE without the expense row is a handwritten JE, not
// a posted cost. The RED fixture is 10 live fuel JEs crediting 1090 (Undeposited
// Funds) with bare-UUID memos, totaling $7,250.20 — the writer is crediting the
// wrong payment account (should be 1295/2510/2500/1000) and skipping the expense
// row entirely.
//
// This guard asserts TWO invariants on USMCA posted JEs:
//
//   1. NO HANDWRITTEN COST JE — a JE that debits a 5xxx or 6xxx account must have
//      a matching accounting.expenses row (joined on journal_entry_id). A debit
//      to a cost/expense account with no expense row is a handwritten JE.
//   2. NO WRONG CREDIT ACCOUNT — a JE whose source_transaction_type is 'fuel_event'
//      or whose debit side hits a 5xxx/6xxx account must NOT credit:
//        1090 Undeposited Funds
//        1100 Accounts Receivable
//        1150 Unbilled Revenue
//      Correct payment accounts are:
//        1295 Relay Fuel Wallet
//        2510 Dreamline Diesel Card Payable
//        2500 Amex Credit Card Payable
//        1000 Bank of America - Operating
//
// BASELINE 0 (shrink-only): the expected violation count is 0. Any violation fails
// the guard. --write-baseline is FORBIDDEN. The guard is dynamic and self-arming —
// as the feed creates more JEs, the population grows and the guard checks them all.
// No hardcoded count, no baseline file.
//
// LIVE guard (REQUIRES_LIVE_DB): touches money-relevant data (journal entries +
// expenses). Uses requireLiveDbOrExit and declares REQUIRES_LIVE_DB so
// verify-static.mjs's no-DB sweep excludes it. Wired into money-pr-local-gate.mjs
// LIVE_DOMAIN_GUARDS so it runs when a diff touches the posting paths that write
// JEs, and fails closed when no DATABASE_URL is available.
//
// COORDINATION: Cursor is the sole feeder/writer of USMCA data. This guard catches
// the output; Cursor fixes the writer. Communicate through OUTBOX-DEVIN-B.md.
//
// Self-test: node scripts/verify-costs-are-expenses-not-handwritten-jes.mjs --selftest
export const REQUIRES_LIVE_DB = "money-relevant (cost JEs + expenses) — must fail-closed, never skip, per ROUND 29.9-B";

import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-costs-are-expenses-not-handwritten-jes";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

// Accounts that must NOT be credited by a cost/expense/fuel JE
const FORBIDDEN_CREDIT_ACCOUNTS = ["1090", "1100", "1150"];

// Accounts that ARE correct payment targets for cost/expense/fuel JEs
const OK_CREDIT_ACCOUNTS = ["1295", "2510", "2500", "1000"];

/**
 * Classify a JE's postings into violations. Pure function — exported for selftest.
 * @param {{ je_id: string, memo: string, postings: Array<{ account_number: string, account_type: string, debit_or_credit: string, amount_cents: string, source_transaction_type: string|null }>, has_expense_row: boolean }} row
 * @returns {string|null} violation kind, or null if clean
 */
export function classifyCostJe(row) {
  const postings = row.postings;
  // Check if this JE debits a 5xxx or 6xxx account (cost-of-revenue or expense)
  const debits5xxx6xxx = postings.filter(
    (p) => p.debit_or_credit === "debit" && /^(5|6)\d{3}/.test(p.account_number),
  );
  const isCostJe = debits5xxx6xxx.length > 0;
  const isFuelJe = postings.some((p) => p.source_transaction_type === "fuel_event");

  // Violation 1: handwritten cost JE — debits 5xxx/6xxx but no expense row
  if (isCostJe && !row.has_expense_row) return "handwritten_cost_je";

  // Violation 2: wrong credit account — credits 1090/1100/1150
  if (isCostJe || isFuelJe) {
    const wrongCredit = postings.find(
      (p) =>
        p.debit_or_credit === "credit" &&
        FORBIDDEN_CREDIT_ACCOUNTS.includes(p.account_number),
    );
    if (wrongCredit) return `wrong_credit_account_${wrongCredit.account_number}`;
  }

  return null;
}

/**
 * Query all USMCA posted JEs with their postings and expense-row linkage.
 * Runs inside a transaction with bypass_rls='lucia' (USMCA scope only).
 * @param {import("pg").PoolClient} client
 * @returns {Promise<Array>}
 */
async function measure(client) {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',false)");

  // Get all posted JEs for USMCA
  const jeRes = await client.query(
    `SELECT je.id::text AS je_id, je.memo
       FROM accounting.journal_entries je
      WHERE je.operating_company_id = $1::uuid
        AND je.status = 'posted'
        AND je.is_sample_data IS NOT TRUE
      ORDER BY je.created_at`,
    [USMCA_COMPANY_ID],
  );

  const results = [];
  for (const je of jeRes.rows) {
    // Get postings for this JE
    const postRes = await client.query(
      `SELECT jep.debit_or_credit, jep.amount_cents::text, jep.source_transaction_type,
              a.account_number, a.account_name, a.account_type
         FROM accounting.journal_entry_postings jep
         JOIN catalogs.accounts a ON a.id = jep.account_id
        WHERE jep.journal_entry_uuid = $1::uuid
        ORDER BY jep.line_sequence`,
      [je.je_id],
    );

    // Check if any of these postings debit a 5xxx/6xxx account
    const hasCostDebit = postRes.rows.some(
      (p) => p.debit_or_credit === "debit" && /^(5|6)\d{3}/.test(p.account_number),
    );

    // Check if there's a matching expense row
    let hasExpenseRow = false;
    if (hasCostDebit) {
      const expRes = await client.query(
        `SELECT 1 FROM accounting.expenses
          WHERE journal_entry_id = $1::uuid
            AND operating_company_id = $2::uuid
            AND deleted_at IS NULL
          LIMIT 1`,
        [je.je_id, USMCA_COMPANY_ID],
      );
      hasExpenseRow = expRes.rows.length > 0;
    }

    results.push({
      je_id: je.je_id,
      memo: je.memo,
      postings: postRes.rows,
      has_expense_row: hasExpenseRow,
    });
  }

  await client.query("ROLLBACK");
  return results;
}

function runClassifierSelftest() {
  const fixtures = [
    // Clean: debit 5xxx with expense row, credit correct payment account
    {
      name: "clean cost JE with expense row",
      row: {
        je_id: "test1", memo: "Load 13508 fuel expense",
        postings: [
          { account_number: "5000", account_type: "Expense", debit_or_credit: "debit", amount_cents: "5000", source_transaction_type: "fuel_event" },
          { account_number: "1295", account_type: "Asset", debit_or_credit: "credit", amount_cents: "5000", source_transaction_type: "fuel_event" },
        ],
        has_expense_row: true,
      },
      expect: null,
    },
    // RED: debit 5xxx with NO expense row
    {
      name: "handwritten cost JE — no expense row",
      row: {
        je_id: "test2", memo: "Fuel event uuid (diesel) posting",
        postings: [
          { account_number: "5000", account_type: "Expense", debit_or_credit: "debit", amount_cents: "5000", source_transaction_type: "fuel_event" },
          { account_number: "1090", account_type: "Asset", debit_or_credit: "credit", amount_cents: "5000", source_transaction_type: "fuel_event" },
        ],
        has_expense_row: false,
      },
      expect: "handwritten_cost_je",
    },
    // RED: fuel JE crediting 1090
    {
      name: "fuel JE crediting 1090",
      row: {
        je_id: "test3", memo: "Fuel event 56627fdf (diesel) posting",
        postings: [
          { account_number: "5000", account_type: "Expense", debit_or_credit: "debit", amount_cents: "77455", source_transaction_type: "fuel_event" },
          { account_number: "1090", account_type: "Asset", debit_or_credit: "credit", amount_cents: "77455", source_transaction_type: "fuel_event" },
        ],
        has_expense_row: true,
      },
      expect: "wrong_credit_account_1090",
    },
    // RED: fuel JE crediting 1100
    {
      name: "fuel JE crediting 1100 (A/R)",
      row: {
        je_id: "test4", memo: "Fuel event uuid posting",
        postings: [
          { account_number: "5000", account_type: "Expense", debit_or_credit: "debit", amount_cents: "5000", source_transaction_type: "fuel_event" },
          { account_number: "1100", account_type: "Asset", debit_or_credit: "credit", amount_cents: "5000", source_transaction_type: "fuel_event" },
        ],
        has_expense_row: true,
      },
      expect: "wrong_credit_account_1100",
    },
    // Clean: fuel JE crediting 2510 (Dreamline Diesel Card Payable)
    {
      name: "fuel JE crediting 2510 (correct)",
      row: {
        je_id: "test5", memo: "Load 13508 fuel card",
        postings: [
          { account_number: "5000", account_type: "Expense", debit_or_credit: "debit", amount_cents: "5000", source_transaction_type: "fuel_event" },
          { account_number: "2510", account_type: "Liability", debit_or_credit: "credit", amount_cents: "5000", source_transaction_type: "fuel_event" },
        ],
        has_expense_row: true,
      },
      expect: null,
    },
    // Clean: non-cost JE (debit 1xxx, credit 2xxx) — not in scope
    {
      name: "non-cost JE — not in scope",
      row: {
        je_id: "test6", memo: "Invoice payment",
        postings: [
          { account_number: "1000", account_type: "Asset", debit_or_credit: "debit", amount_cents: "5000", source_transaction_type: "payment" },
          { account_number: "1100", account_type: "Asset", debit_or_credit: "credit", amount_cents: "5000", source_transaction_type: "payment" },
        ],
        has_expense_row: false,
      },
      expect: null,
    },
  ];

  let pass = 0;
  let fail = 0;
  for (const { name, row, expect: exp } of fixtures) {
    const got = classifyCostJe(row);
    if (got !== exp) {
      console.error(`${LABEL} --selftest FAIL — ${name}: expected ${exp}, got ${got}`);
      fail += 1;
    } else {
      pass++;
    }
  }
  if (fail > 0) {
    process.exitCode = 1;
  } else {
    console.log(`${LABEL} --selftest PASS — ${pass} classifier fixtures all correct`);
  }
}

async function run({ selftest }) {
  if (selftest) {
    runClassifierSelftest();
    if (process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL) {
      const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
      try {
        const rows = await measure(client);
        const violations = rows.filter((r) => classifyCostJe(r) !== null);
        const byKind = new Map();
        for (const r of rows) {
          const k = classifyCostJe(r);
          if (k) byKind.set(k, (byKind.get(k) ?? 0) + 1);
        }
        console.log(
          `${LABEL} --selftest LIVE — scanned ${rows.length} posted JE(s) for USMCA, ` +
            `${violations.length} violation(s): ${[...byKind.entries()].map(([k, n]) => `${k}=${n}`).join(", ") || "none"}`,
        );
      } finally {
        client.release();
        await pool.end();
      }
    }
    return;
  }

  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    const rows = await measure(client);
    const violations = [];
    const byKind = new Map();
    for (const row of rows) {
      const kind = classifyCostJe(row);
      if (kind) {
        violations.push({ id: row.je_id, kind, memo_preview: String(row.memo ?? "").slice(0, 80) });
        byKind.set(kind, (byKind.get(kind) ?? 0) + 1);
      }
    }

    if (violations.length > 0) {
      const summary = [...byKind.entries()].map(([k, n]) => `${k}=${n}`).join(", ");
      const sample = violations.slice(0, 10).map((v) => `  ${v.id} [${v.kind}] memo="${v.memo_preview}..."`).join("\n");
      console.error(
        `${LABEL}: LIVE FAIL — ${violations.length} USMCA cost JE violation(s) (${summary}).\n` +
          `Baseline is 0 (shrink-only). First ${Math.min(10, violations.length)}:\n${sample}\n` +
          `Cursor is fixing the WRITER — coordinate via OUTBOX-DEVIN-B.md.`,
      );
      process.exitCode = 1;
      return;
    }
    console.log(`${LABEL}: LIVE PASS — ${rows.length} USMCA posted JE(s) scanned, 0 cost JE violation(s). Baseline 0 held.`);
  } finally {
    client.release();
    await pool.end();
  }
}

await run({ selftest: process.argv.includes("--selftest") });
