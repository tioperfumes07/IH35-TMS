#!/usr/bin/env node
// ROUND 192 (Lead, 2026-09-25) — the fuel↔expense one-to-one guard. Every live fuel purchase
// (fuel.fuel_transactions, archived_at IS NULL AND voided_at IS NULL) must carry exactly one live
// accounting.expenses document (source_fuel_transaction_id, voided_at IS NULL); a voided/archived
// fuel row must carry ZERO live expenses; a live expense's total must be net (total_cost) + fee
// (fee_amount), line 1 = the fuel item at total_cost, line 2 (only when fee_amount > 0) = the
// "Fuel Card Fee" item at fee_amount; every live fuel row states a real positive total_cost; and
// a posted expense's own journal entry credits its payment_account_uuid for the FULL total while
// debiting exactly the line accounts for their own amounts.
//
// KNOWN LIVE, NAMED (measured by the Lead, 2026-09-25 — do NOT baseline, do NOT silence):
//   - load 13546: fuel row d908b8d4 was voided 9/24 as a duplicate of the live row 986349aa, but
//     its own expense (13546-2) was never voided — rule (b): zero live expenses on a voided fuel
//     row. Fixed by the Lead's AUTH-042 correction after this PR merges, not by this PR.
//   - load 13586: fuel row 8c802d22 has total_cost 0.00 (parser garbage ref "62.410") and no
//     expense at all — rule (d) (and, redundantly, rule (a)'s "exactly one" for a live row with
//     zero). Same AUTH-042, same "not fixed here."
// This guard is expected to FAIL today naming exactly these two rows and nothing else.
//
// Self-test: node scripts/verify-fuel-expense-one-to-one.mjs --selftest
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB = "live() fails closed without DATABASE_URL by design (ROUND 29.9-B)";

const LABEL = "verify-fuel-expense-one-to-one";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const FEE_ITEM_NAME = "Fuel Card Fee";

/** Pure — a live expense's total must equal round(total_cost*100) + round(fee_amount*100) to the
 *  cent. Kept as its own function so --selftest can exercise the arithmetic without a DB. */
export function expenseTotalMatchesNetPlusFee(totalAmountCents, totalCost, feeAmount) {
  const expected = Math.round(Number(totalCost) * 100) + Math.round(Number(feeAmount ?? 0) * 100);
  return Number(totalAmountCents) === expected;
}

async function live() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  // key -> { label, reasons: string[] } -- one line per real-world problem row, even when more
  // than one rule below independently flags the same row (e.g. a live $0 fuel row with no
  // expense trips both rule (a) and rule (d)).
  const failures = new Map();
  const flag = (key, label, reason) => {
    const existing = failures.get(key);
    if (existing) existing.reasons.push(reason);
    else failures.set(key, { label, reasons: [reason] });
  };

  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

    // ---- (a) every live fuel row has EXACTLY ONE live expense -----------------------------
    const a = await client.query(
      `SELECT ft.id::text AS fuel_id, ft.load_id::text, l.load_number,
              count(e.id) FILTER (WHERE e.voided_at IS NULL) AS live_expense_count
         FROM fuel.fuel_transactions ft
         LEFT JOIN accounting.expenses e ON e.source_fuel_transaction_id = ft.id
         LEFT JOIN mdata.loads l ON l.id = ft.load_id
        WHERE ft.operating_company_id = $1::uuid AND ft.archived_at IS NULL AND ft.voided_at IS NULL
        GROUP BY ft.id, ft.load_id, l.load_number
       HAVING count(e.id) FILTER (WHERE e.voided_at IS NULL) <> 1`,
      [USMCA_COMPANY_ID]
    );
    for (const r of a.rows) {
      const label = r.load_number ?? r.fuel_id;
      flag(r.fuel_id, label, `(a) live fuel row has ${r.live_expense_count} live expense(s), expected exactly 1 (fuel ${r.fuel_id}${r.load_number ? `, load ${r.load_number}` : ""})`);
    }

    // ---- (b) ZERO live expenses on a voided or archived fuel row --------------------------
    const b = await client.query(
      `SELECT ft.id::text AS fuel_id, e.id::text AS expense_id, e.expense_number, ft.voided_at::text, ft.archived_at::text
         FROM fuel.fuel_transactions ft
         JOIN accounting.expenses e ON e.source_fuel_transaction_id = ft.id AND e.voided_at IS NULL
        WHERE ft.operating_company_id = $1::uuid AND (ft.voided_at IS NOT NULL OR ft.archived_at IS NOT NULL)`,
      [USMCA_COMPANY_ID]
    );
    for (const r of b.rows) {
      const label = r.expense_number ?? r.expense_id;
      flag(r.fuel_id, label, `(b) expense ${r.expense_number ?? r.expense_id} is live (voided_at IS NULL) on fuel row ${r.fuel_id}, which is itself ${r.voided_at ? "voided" : "archived"} (voided_at=${r.voided_at ?? "null"}, archived_at=${r.archived_at ?? "null"}) — a dead fuel row must carry zero live expenses`);
    }

    // ---- (c) total = net + fee; line 1 = net on the fuel item; line 2 (if fee) = fee on "Fuel
    // Card Fee" ------------------------------------------------------------------------------
    const c = await client.query(
      `SELECT e.id::text AS expense_id, e.expense_number, e.total_amount_cents,
              ft.id::text AS fuel_id, ft.total_cost, ft.fee_amount,
              (SELECT el.amount_cents FROM accounting.expense_lines el WHERE el.expense_id = e.id AND el.line_sequence = 1) AS line1_cents,
              (SELECT el.amount_cents FROM accounting.expense_lines el WHERE el.expense_id = e.id AND el.line_sequence = 2) AS line2_cents,
              (SELECT it.item_name FROM accounting.expense_lines el JOIN catalogs.items it ON it.id = el.item_id WHERE el.expense_id = e.id AND el.line_sequence = 2) AS line2_item_name
         FROM accounting.expenses e
         JOIN fuel.fuel_transactions ft ON ft.id = e.source_fuel_transaction_id
        WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL`,
      [USMCA_COMPANY_ID]
    );
    for (const r of c.rows) {
      const label = r.expense_number ?? r.expense_id;
      const netCents = Math.round(Number(r.total_cost) * 100);
      const feeCents = Math.round(Number(r.fee_amount ?? 0) * 100);
      if (!expenseTotalMatchesNetPlusFee(r.total_amount_cents, r.total_cost, r.fee_amount)) {
        flag(r.fuel_id, label, `(c) expense ${label} total_amount_cents=${r.total_amount_cents}, expected net ${netCents} + fee ${feeCents} = ${netCents + feeCents}`);
      }
      if (Number(r.line1_cents ?? -1) !== netCents) {
        flag(r.fuel_id, label, `(c) expense ${label} line 1 amount_cents=${r.line1_cents ?? "MISSING"}, expected net ${netCents} (total_cost)`);
      }
      if (feeCents > 0) {
        if (Number(r.line2_cents ?? -1) !== feeCents) {
          flag(r.fuel_id, label, `(c) expense ${label} has fee_amount ${r.fee_amount} but line 2 amount_cents=${r.line2_cents ?? "MISSING"}, expected ${feeCents}`);
        }
        if (r.line2_item_name !== FEE_ITEM_NAME) {
          flag(r.fuel_id, label, `(c) expense ${label} line 2 item is "${r.line2_item_name ?? "MISSING"}", expected "${FEE_ITEM_NAME}"`);
        }
      } else if (r.line2_cents != null) {
        flag(r.fuel_id, label, `(c) expense ${label} has fee_amount 0 but carries an unexpected line 2 (amount_cents=${r.line2_cents})`);
      }
    }

    // ---- (d) zero live fuel rows with total_cost <= 0 -------------------------------------
    const d = await client.query(
      `SELECT ft.id::text AS fuel_id, ft.load_id::text, l.load_number, ft.total_cost
         FROM fuel.fuel_transactions ft
         LEFT JOIN mdata.loads l ON l.id = ft.load_id
        WHERE ft.operating_company_id = $1::uuid AND ft.archived_at IS NULL AND ft.voided_at IS NULL
          AND ft.total_cost <= 0`,
      [USMCA_COMPANY_ID]
    );
    for (const r of d.rows) {
      const label = r.load_number ?? r.fuel_id;
      flag(r.fuel_id, label, `(d) live fuel row ${r.fuel_id}${r.load_number ? ` (load ${r.load_number})` : ""} has total_cost=${r.total_cost} — must be > 0`);
    }

    // ---- (e) a posted expense's own JE credits payment_account_uuid for the FULL total and
    // debits exactly the line accounts -------------------------------------------------------
    const e = await client.query(
      `SELECT e.id::text AS expense_id, e.expense_number, e.total_amount_cents, e.payment_account_uuid::text,
              ft.id::text AS fuel_id,
              (SELECT COALESCE(SUM(p.amount_cents), 0) FROM accounting.journal_entry_postings p
                WHERE p.journal_entry_uuid = e.journal_entry_id AND p.debit_or_credit = 'credit'
                  AND p.account_id = e.payment_account_uuid AND p.reversed_by_line_id IS NULL) AS credit_to_payment_account_cents,
              (SELECT COALESCE(SUM(p.amount_cents), 0) FROM accounting.journal_entry_postings p
                WHERE p.journal_entry_uuid = e.journal_entry_id AND p.debit_or_credit = 'debit'
                  AND p.reversed_by_line_id IS NULL) AS total_debit_cents
         FROM accounting.expenses e
         JOIN fuel.fuel_transactions ft ON ft.id = e.source_fuel_transaction_id
        WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL AND e.status = 'posted'
          AND e.journal_entry_id IS NOT NULL AND e.payment_account_uuid IS NOT NULL`,
      [USMCA_COMPANY_ID]
    );
    for (const r of e.rows) {
      const label = r.expense_number ?? r.expense_id;
      if (Number(r.credit_to_payment_account_cents) !== Number(r.total_amount_cents)) {
        flag(r.fuel_id, label, `(e) expense ${label}'s journal entry credits its payment_account_uuid ${r.credit_to_payment_account_cents} cents, expected the full total ${r.total_amount_cents}`);
      }
      if (Number(r.total_debit_cents) !== Number(r.total_amount_cents)) {
        flag(r.fuel_id, label, `(e) expense ${label}'s journal entry debits sum to ${r.total_debit_cents} cents, expected the full total ${r.total_amount_cents} (debits must equal the line accounts' own amounts)`);
      }
    }

    await client.query("ROLLBACK");

    if (failures.size > 0) {
      console.error(`${LABEL}: FAIL — ${failures.size} row(s):`);
      const names = [];
      for (const { label, reasons } of failures.values()) {
        names.push(label);
        for (const reason of reasons) console.error(`  ✗ ${reason}`);
      }
      console.error(`${LABEL}: failing rows: ${names.join(", ")}`);
      process.exit(1);
    }
    console.log(`${LABEL}: LIVE PASS — every live fuel row has exactly one live expense at net+fee, zero live expenses on a dead fuel row, zero live fuel rows with total_cost<=0, and every posted expense's JE ties to its own total.`);
  } finally {
    client.release();
    await pool.end();
  }
}

function selftest() {
  const assert = { ok: (c, m) => { if (!c) throw new Error(m); } };

  assert.ok(expenseTotalMatchesNetPlusFee(40000, "400.00", "0"), "net-only total must match exactly");
  assert.ok(expenseTotalMatchesNetPlusFee(40150, "400.00", "1.50"), "net+fee total must match exactly");
  assert.ok(!expenseTotalMatchesNetPlusFee(40000, "400.00", "1.50"), "PLANTED-RED: a total missing the fee must be caught");
  assert.ok(expenseTotalMatchesNetPlusFee(62460, "624.60", null), "null fee_amount is treated as 0, not skipped");
  assert.ok(!expenseTotalMatchesNetPlusFee(62461, "624.60", null), "PLANTED-RED: an off-by-one-cent total must be caught");

  console.log(`${LABEL} --selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  await live();
}
