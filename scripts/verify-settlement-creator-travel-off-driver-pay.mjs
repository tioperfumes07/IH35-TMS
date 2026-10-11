#!/usr/bin/env node
/**
 * GUARD — OWNER RULING (Lead 443.52 A, CC-3): driver travel (meals, lodging) is a travel cost, never driver pay.
 *   RULE 1 (live) — every USMCA catalog item that is a driver travel item (name matches meal / lodg / hotel, excluding a
 *          driver DEDUCTION item) maps its default expense account to a 'Travel-%' account, never 5100 Driver Pay.
 *   RULE 2 (live) — no live expense line carrying such an item is on 5100 Driver Pay / Settlements, and the 5100 net of
 *          expense documents (their own entries + applied reclassifications) is 0.00 — 5100 is pay, posted by settlements.
 * The 3 lines posted before the ruling (EXP-2026-00057/59/62, 420.00) were reclassified 2026-10-11 by the reclassify engine
 * (batches 66aff750, 5f4aecb2) to 6710 Travel-Lodging / 6720 Travel-Meals.
 * Run: node scripts/verify-settlement-creator-travel-off-driver-pay.mjs [--selftest]
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB = "driver pay vs travel is live money — fails closed without a database";
const LABEL = "verify-settlement-creator-travel-off-driver-pay";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
export const TRAVEL_ITEM = /(meal|lodg|hotel)/i;
export const DEDUCTION_ITEM = /deduction/i;

export function problems({ items, lines, net5100 }) {
  const p = [];
  for (const i of items) {
    if (!TRAVEL_ITEM.test(i.item_name) || DEDUCTION_ITEM.test(i.item_name)) continue;
    if (!i.account_name || !/^Travel-/.test(i.account_name)) p.push(`RULE 1 item "${i.item_name}" maps to ${i.account_number ?? "no account"} ${i.account_name ?? ""} — a driver travel item maps to a Travel-* account`);
  }
  for (const l of lines) p.push(`RULE 2 expense ${l.doc} line "${l.item_name}" ${(Number(l.cents) / 100).toFixed(2)} is on 5100 Driver Pay`);
  if (Number(net5100) !== 0) p.push(`RULE 2 5100 net from expense documents is ${(Number(net5100) / 100).toFixed(2)} — must be 0.00`);
  return p;
}

function selftest() {
  const ok = { items: [{ item_name: "Driver Meals Expense", account_number: "6720", account_name: "Travel-Meals" }, { item_name: "Driver Deduction-Meals", account_number: null, account_name: null }], lines: [], net5100: 0 };
  const cases = [
    ["clean passes", problems(ok).length === 0],
    ["meals item on 5100 fails", problems({ ...ok, items: [{ item_name: "Driver Meals Expense", account_number: "5100", account_name: "Driver Pay / Settlements" }] }).some((x) => x.startsWith("RULE 1"))],
    ["lodging item unmapped fails", problems({ ...ok, items: [{ item_name: "Driver-Hotel/Lodging Expense", account_number: null, account_name: null }] }).some((x) => x.startsWith("RULE 1"))],
    ["a travel line on 5100 fails", problems({ ...ok, lines: [{ doc: "EXP-1", item_name: "Driver Meals Expense", cents: 100 }] }).some((x) => x.startsWith("RULE 2"))],
    ["5100 expense net not zero fails", problems({ ...ok, net5100: 4200 }).some((x) => x.startsWith("RULE 2"))],
  ];
  const bad = cases.filter(([, pass]) => !pass).map(([n]) => n);
  if (bad.length) { console.error(`${LABEL} selftest FAIL: ${bad.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} selftest PASS (${cases.length}/${cases.length})`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  let m;
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    const items = (await client.query(
      `SELECT i.item_name, a.account_number, a.account_name FROM catalogs.items i LEFT JOIN catalogs.accounts a ON a.id = i.default_expense_account_id
        WHERE i.operating_company_id = $1::uuid AND i.item_name ~* '(meal|lodg|hotel)'`, [USMCA])).rows;
    const lines = (await client.query(
      `SELECT e.id::text AS doc, i.item_name, el.amount_cents AS cents
         FROM accounting.expense_lines el JOIN accounting.expenses e ON e.id = el.expense_id
         JOIN catalogs.items i ON i.id = el.item_id JOIN catalogs.accounts a ON a.id = el.expense_account_uuid
        WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL AND a.account_number = '5100'
          AND i.item_name ~* '(meal|lodg|hotel)' AND i.item_name !~* 'deduction'`, [USMCA])).rows;
    const net5100 = (await client.query(
      `SELECT COALESCE(SUM(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END), 0)::bigint AS c
         FROM accounting.journal_entry_postings p JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
         JOIN catalogs.accounts a ON a.id = p.account_id
        WHERE je.operating_company_id = $1::uuid AND je.voided_at IS NULL AND a.account_number = '5100'
          AND (p.source_transaction_type = 'expense'
               OR je.id IN (SELECT rl.reclass_journal_entry_id FROM accounting.reclassify_batch_lines rl
                             WHERE rl.operating_company_id = $1::uuid AND rl.result = 'applied'))`, [USMCA])).rows[0].c;
    m = { items, lines, net5100 };
    await client.query("ROLLBACK");
  } finally {
    client.release?.(); await pool?.end?.();
  }
  const p = problems(m);
  if (p.length) { console.error(`${LABEL} FAIL\n- ${p.join("\n- ")}`); process.exit(1); }
  console.log(`${LABEL} PASS — ${m.items.length} travel/deduction items checked; 0 travel lines on 5100; 5100 expense net 0.00`);
}
