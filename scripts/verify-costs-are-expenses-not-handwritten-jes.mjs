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
// COORDINATION: CC-2 owns the writer (R-153.6); CC-3 owns guard scope (R-153.7).
//
// REVERSED-PAIR RULE (R-153.9, Lead order): a JE that is EITHER half of a reversed pair —
// reversed_by_je_id IS NOT NULL (the original) or reverses_je_id IS NOT NULL (its reversal) —
// nets to zero and is excluded from BOTH invariants, unconditionally. Same rule
// verify-no-fuel-event-credits-ap-control.mjs already carries, not a new exemption: a
// voided-then-reposted wrong posting is exactly what this guard exists to let happen. Live-
// verified 2026-09-25 that a reversal entry's own postings do not reliably carry the reversed
// transaction's source_transaction_type (some relabel to 'journal_entry'), so the check is
// explicit on reversed_by_je_id/reverses_je_id in classifyCostJe itself — never inferred from
// isCostJe/isFuelJe reading false on the flipped shape.
//
// SCOPE (R-153.7, owner-approved via the Lead): three DOCUMENT ENGINES legitimately debit a
// 5xxx/6xxx cost account WITHOUT an accounting.expenses row — a factoring advance's fee, a driver
// settlement's cost recognition, and factoring default interest are posted through their own
// document engines (accounting.factoring_advances / driver_finance.driver_settlements /
// the default-interest engine), never through the expense-creation path, so "no expenses row" is
// their correct, permanent shape, not a defect. Exempted from invariant 1 ONLY, by
// source_transaction_type on the posting itself — never by account or amount, so a real
// handwritten JE that happens to hit the same account is still caught. Invariant 2 (wrong credit
// account) still applies to these postings; the exemption is scoped exactly as narrow as ordered.
// The 86 factoring_default_interest JEs are NOT owner-approved for posting (R-101.2) — this
// exemption only stops the GUARD from flagging their existing shape; it authorizes no new writer.
const DOCUMENT_ENGINE_EXEMPT_SOURCE_TYPES = new Set(["factoring_advance", "driver_settlement", "factoring_default_interest"]);
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
 * @param {{ je_id: string, memo: string, postings: Array<{ account_number: string, account_type: string, debit_or_credit: string, amount_cents: string, source_transaction_type: string|null }>, has_expense_row: boolean, reversed_by_je_id?: string|null, reverses_je_id?: string|null }} row
 * @returns {string|null} violation kind, or null if clean
 */
export function classifyCostJe(row) {
  // R-153.9 (Lead order): a JE that is EITHER member of a reversed pair — the original
  // (reversed_by_je_id IS NOT NULL) or its reversal (reverses_je_id IS NOT NULL) — nets to zero
  // and is excluded from BOTH invariants. Same rule verify-no-fuel-event-credits-ap-control.mjs
  // already carries (reversed_by_je_id IS NULL), not a new exemption: a voided-then-reposted
  // wrong posting is exactly what this guard exists to let happen. Checked FIRST, before either
  // invariant, and unconditionally (not scoped to fuel_event or any source_transaction_type) —
  // the pairing itself, not the transaction kind, is what makes both halves inert.
  if (row.reversed_by_je_id || row.reverses_je_id) return null;

  const postings = row.postings;
  // Check if this JE debits a 5xxx or 6xxx account (cost-of-revenue or expense)
  const debits5xxx6xxx = postings.filter(
    (p) => p.debit_or_credit === "debit" && /^(5|6)\d{3}/.test(p.account_number),
  );
  const isCostJe = debits5xxx6xxx.length > 0;
  const isFuelJe = postings.some((p) => p.source_transaction_type === "fuel_event");

  // Violation 1: handwritten cost JE — debits 5xxx/6xxx but no expense row. R-153.7 SCOPE: a
  // document-engine posting (factoring_advance / driver_settlement / factoring_default_interest)
  // is exempt from THIS invariant only — it is by design never accompanied by an expenses row.
  // Exempts by source_transaction_type on the posting alone; a JE is only exempt here if EVERY one
  // of its cost-debiting lines carries an exempt source — a JE mixing an exempt line with a
  // genuinely handwritten one still fails, on the handwritten line's own account.
  const nonExemptCostDebits = debits5xxx6xxx.filter(
    (p) => !DOCUMENT_ENGINE_EXEMPT_SOURCE_TYPES.has(p.source_transaction_type),
  );
  if (nonExemptCostDebits.length > 0 && !row.has_expense_row) return "handwritten_cost_je";

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

  // Get all posted JEs for USMCA. R-153.6: this system's void model (journal-entries.service.ts
  // voidJournalEntry, Option-1) NEVER flips a voided JE's status -- it posts an equal/opposite
  // REVERSING entry and stamps reversed_by_je_id on the original, which stays status='posted'
  // forever by design (so it never silently drops out of the GL trail). A correctly-voided wrong
  // posting (exactly what this guard exists to make possible) must not count as a violation --
  // proven live 2026-09-25: voided 54 wrong-1090 fuel JEs via the real voidJournalEntry engine,
  // re-ran this guard unmodified, same JE ids still flagged.
  //
  // R-153.9 (Lead order): BOTH halves of a reversed pair are excluded, not just the original --
  // live-verified 2026-09-25 that a reversal entry's own postings do not always carry the
  // reversed transaction's source_transaction_type (e.g. relabeled 'journal_entry'), so the
  // classifier cannot always rely on isFuelJe/isCostJe alone to stay inert for a reversal.
  // reversed_by_je_id/reverses_je_id are selected here and the exclusion is enforced in
  // classifyCostJe itself (checked first, unconditionally) so it is one testable rule instead of
  // a SQL-only side effect -- see that function's own comment.
  const jeRes = await client.query(
    `SELECT je.id::text AS je_id, je.memo,
            je.reversed_by_je_id::text AS reversed_by_je_id, je.reverses_je_id::text AS reverses_je_id
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
      reversed_by_je_id: je.reversed_by_je_id,
      reverses_je_id: je.reverses_je_id,
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
    // R-153.7 SCOPE — Clean: factoring_advance debits a 5xxx cost (its fee) with NO expense row,
    // by design (document engine, never the expense-creation path). Must be exempt from invariant 1.
    {
      name: "factoring_advance cost debit, no expense row — exempt (R-153.7)",
      row: {
        je_id: "test7", memo: "Factoring funding FAC-2026-00001",
        postings: [
          { account_number: "6400", account_type: "Expense", debit_or_credit: "debit", amount_cents: "2938", source_transaction_type: "factoring_advance" },
          { account_number: "1230", account_type: "Asset", debit_or_credit: "credit", amount_cents: "2938", source_transaction_type: "factoring_advance" },
        ],
        has_expense_row: false,
      },
      expect: null,
    },
    // R-153.7 SCOPE — Clean: driver_settlement cost recognition, same shape.
    {
      name: "driver_settlement cost debit, no expense row — exempt (R-153.7)",
      row: {
        je_id: "test8", memo: "Driver settlement S-2026-0013",
        postings: [
          { account_number: "5100", account_type: "Expense", debit_or_credit: "debit", amount_cents: "48000", source_transaction_type: "driver_settlement" },
          { account_number: "2100", account_type: "Liability", debit_or_credit: "credit", amount_cents: "48000", source_transaction_type: "driver_settlement" },
        ],
        has_expense_row: false,
      },
      expect: null,
    },
    // R-153.7 SCOPE — Clean: factoring_default_interest, same shape. Exempting the GUARD does not
    // authorize new postings of this kind (R-101.2, not owner-approved) — it only stops flagging
    // the existing live rows as "handwritten".
    {
      name: "factoring_default_interest cost debit, no expense row — exempt (R-153.7)",
      row: {
        je_id: "test9", memo: "Factoring default interest",
        postings: [
          { account_number: "6410", account_type: "Expense", debit_or_credit: "debit", amount_cents: "1500", source_transaction_type: "factoring_default_interest" },
          { account_number: "1230", account_type: "Asset", debit_or_credit: "credit", amount_cents: "1500", source_transaction_type: "factoring_default_interest" },
        ],
        has_expense_row: false,
      },
      expect: null,
    },
    // R-153.7 SCOPE — RED: a fuel_event cost debit with no expense row is STILL caught. The
    // exemption is by source_transaction_type on the posting alone; fuel_event is not in the
    // exempt set, so this must keep failing exactly as before the scope change.
    {
      name: "fuel_event cost debit, no expense row — NOT exempt, still fails",
      row: {
        je_id: "test10", memo: "Fuel event uuid (diesel) posting",
        postings: [
          { account_number: "5000", account_type: "Expense", debit_or_credit: "debit", amount_cents: "5000", source_transaction_type: "fuel_event" },
          { account_number: "1295", account_type: "Asset", debit_or_credit: "credit", amount_cents: "5000", source_transaction_type: "fuel_event" },
        ],
        has_expense_row: false,
      },
      expect: "handwritten_cost_je",
    },
    // R-153.7 SCOPE — RED: a JE mixing an exempt line with a genuinely handwritten one still
    // fails — the exemption never blanket-clears a whole JE, only the specific exempt-sourced
    // cost-debit lines within it.
    {
      name: "mixed JE (exempt line + genuine handwritten line) — still fails",
      row: {
        je_id: "test11", memo: "Mixed posting",
        postings: [
          { account_number: "6400", account_type: "Expense", debit_or_credit: "debit", amount_cents: "2938", source_transaction_type: "factoring_advance" },
          { account_number: "5000", account_type: "Expense", debit_or_credit: "debit", amount_cents: "5000", source_transaction_type: "journal_entry" },
          { account_number: "1230", account_type: "Asset", debit_or_credit: "credit", amount_cents: "7938", source_transaction_type: "factoring_advance" },
        ],
        has_expense_row: false,
      },
      expect: "handwritten_cost_je",
    },
    // R-153.7 SCOPE — RED: invariant 2 (wrong credit account) is NOT exempted — a
    // document-engine posting crediting 1090/1100/1150 must still fail, "exempt from invariant 1
    // ONLY" per the order.
    {
      name: "factoring_advance crediting 1090 — invariant 2 still applies",
      row: {
        je_id: "test12", memo: "Factoring funding wrong credit",
        postings: [
          { account_number: "6400", account_type: "Expense", debit_or_credit: "debit", amount_cents: "2938", source_transaction_type: "factoring_advance" },
          { account_number: "1090", account_type: "Asset", debit_or_credit: "credit", amount_cents: "2938", source_transaction_type: "factoring_advance" },
        ],
        has_expense_row: true,
      },
      expect: "wrong_credit_account_1090",
    },
    // R-153.9 (Lead order) — Clean: the ORIGINAL half of a reversed fuel pair. Live shape (fuel
    // JE Dr 5000 / Cr 1090, wrong-credit AND handwritten) but reversed_by_je_id is set — excluded
    // from BOTH invariants, unconditionally, before either is evaluated.
    {
      name: "reversed pair — original half (reversed_by_je_id set) — clean",
      row: {
        je_id: "test13", memo: "Fuel event 2a27f7e2 (diesel) posting",
        postings: [
          { account_number: "5000", account_type: "Expense", debit_or_credit: "debit", amount_cents: "50367", source_transaction_type: "fuel_event" },
          { account_number: "1090", account_type: "Asset", debit_or_credit: "credit", amount_cents: "50367", source_transaction_type: "fuel_event" },
        ],
        has_expense_row: false,
        reversed_by_je_id: "8078f8fc-bedf-489c-8977-c9752ed545d0",
        reverses_je_id: null,
      },
      expect: null,
    },
    // R-153.9 (Lead order) — Clean: the REVERSAL half of the same pair. Live-verified shape: the
    // reversal's own postings relabel source_transaction_type to 'journal_entry' (not
    // 'fuel_event') and flip debit/credit, so isCostJe/isFuelJe alone would already read false
    // here -- this fixture proves the explicit reverses_je_id check is what makes that
    // unconditional, not an accident of the flipped shape.
    {
      name: "reversed pair — reversal half (reverses_je_id set) — clean",
      row: {
        je_id: "test14", memo: "Reversal of journal entry 5be6aed9-dccc-4f1e-a46a-4d66d7cb855b: E22...",
        postings: [
          { account_number: "5000", account_type: "Expense", debit_or_credit: "credit", amount_cents: "50367", source_transaction_type: "journal_entry" },
          { account_number: "1090", account_type: "Asset", debit_or_credit: "debit", amount_cents: "50367", source_transaction_type: "journal_entry" },
        ],
        has_expense_row: false,
        reversed_by_je_id: null,
        reverses_je_id: "5be6aed9-dccc-4f1e-a46a-4d66d7cb855b",
      },
      expect: null,
    },
    // R-153.9 (Lead order) — RED: an UNREVERSED fuel JE on 1090 (neither field set) must keep
    // failing exactly as before -- the new check must not swallow a real, still-live violation.
    {
      name: "unreversed fuel JE crediting 1090 — still RED",
      row: {
        je_id: "test15", memo: "Fuel event 9c1a2b3d (diesel) posting",
        postings: [
          { account_number: "5000", account_type: "Expense", debit_or_credit: "debit", amount_cents: "42000", source_transaction_type: "fuel_event" },
          { account_number: "1090", account_type: "Asset", debit_or_credit: "credit", amount_cents: "42000", source_transaction_type: "fuel_event" },
        ],
        has_expense_row: true,
        reversed_by_je_id: null,
        reverses_je_id: null,
      },
      expect: "wrong_credit_account_1090",
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
          `CC-2 owns the writer (R-153.6); CC-3 owns guard scope (R-153.7).`,
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
