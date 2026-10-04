#!/usr/bin/env node
// AUTH-400 rehearsal (CC-1, 2026-10-04) — every settlement GL-bill row names the journal entries it would be reversed by.
//
// Measured on prod: 90 driver_finance.driver_settlement_gl_bills rows (45 posted settlements) with bill_journal_entry_id
// NULL — and 22 with a cash payment but no cash_journal_entry_id. Their bill journal entries EXIST (the pre-10-02
// single "pay-run close" entry; the rows were written by the 09-28 ROUND 148 document-only adoption). The settlement
// reversal engine reverses exactly what the row names, so every one of those settlements refused to void:
// "Settlement … bill … is missing its original journal-entry linkage".
//
// static: the A/P chain writer (settlement-ap-chain.service.ts) REFUSES a load bill that posted no journal entry
//   (BILL_JOURNAL_ENTRY_MISSING) and a net-pay payment whose entry cannot be found (CASH_PAYMENT_JOURNAL_ENTRY_MISSING),
//   and writes both ids into the row. --selftest plants each regression.
// --live (read-only, FAIL-CLOSED): no posted run's GL-bill row lacks its bill entry, and none with a cash payment lacks
//   its cash entry. Fails today on the 90 legacy rows; 0 after the AUTH-400 clean slate; then it joins the money gate.
import { readFileSync } from "node:fs";

const LABEL = "verify-settlement-gl-bills-link-their-entries";
const FILE = "apps/backend/src/driver-finance/settlement-ap-chain.service.ts";
const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

export function problems(src) {
  const p = [];
  if (!/if \(!billJeId\) \{\s*throw new SettlementApChainError\("BILL_JOURNAL_ENTRY_MISSING"/.test(src)) p.push("chain must refuse a load bill that posted no journal entry (BILL_JOURNAL_ENTRY_MISSING)");
  if (!/if \(!cashJeId\) \{\s*throw new SettlementApChainError\("CASH_PAYMENT_JOURNAL_ENTRY_MISSING"/.test(src)) p.push("chain must refuse a net-pay payment whose journal entry cannot be found (CASH_PAYMENT_JOURNAL_ENTRY_MISSING)");
  if (!/x\.billId, x\.billJeId, cashBpId, cashJeId,/.test(src)) p.push("the GL-bill INSERT must write bill_journal_entry_id and cash_journal_entry_id");
  if (/billJeId: string \| null; total: number/.test(src)) p.push("posted[].billJeId must be non-null by type");
  return p;
}

const src = read(FILE);
const own = problems(src);
const plants = [
  ["bill refusal removed", src.replace(/if \(!billJeId\) \{\s*throw new SettlementApChainError\("BILL_JOURNAL_ENTRY_MISSING"/, 'if (false) { throw new SettlementApChainError("X"')],
  ["cash refusal removed", src.replace(/if \(!cashJeId\) \{\s*throw new SettlementApChainError\("CASH_PAYMENT_JOURNAL_ENTRY_MISSING"/, 'if (false) { throw new SettlementApChainError("X"')],
  ["INSERT writes null bill entry", src.replace("x.billId, x.billJeId, cashBpId, cashJeId,", "x.billId, null, cashBpId, cashJeId,")],
];
const missed = plants.filter(([, s]) => problems(s).length === 0).map(([n]) => n);
if (own.length || missed.length) {
  console.error(`${LABEL}: FAIL — ${[...own, ...missed.map((n) => `plant '${n}' not caught`)].join("; ")}`);
  process.exit(1);
}
console.log(`${LABEL}: static PASS (${plants.length}/${plants.length} plants caught)`);
if (process.argv.includes("--selftest")) process.exit(0);

if (process.argv.includes("--live")) {
  const { requireLiveDbOrExit } = await import("./lib/require-live-db.mjs");
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const r = (await client.query(
      `SELECT count(*) FILTER (WHERE gb.bill_journal_entry_id IS NULL)::int AS no_bill_je,
              count(*) FILTER (WHERE gb.cash_bill_payment_id IS NOT NULL AND gb.cash_journal_entry_id IS NULL)::int AS no_cash_je,
              count(DISTINCT r.settlement_id) FILTER (WHERE gb.bill_journal_entry_id IS NULL OR (gb.cash_bill_payment_id IS NOT NULL AND gb.cash_journal_entry_id IS NULL))::int AS settlements
         FROM driver_finance.driver_settlement_gl_runs r
         JOIN driver_finance.driver_settlement_gl_bills gb ON gb.run_id = r.id
        WHERE r.status = 'posted'`)).rows[0];
    await client.query("ROLLBACK");
    if (r.no_bill_je || r.no_cash_je) {
      console.error(`${LABEL}: LIVE FAIL — ${r.no_bill_je} GL-bill row(s) without their bill entry, ${r.no_cash_je} without their cash entry, across ${r.settlements} posted settlement(s) — those settlements cannot be reversed`);
      process.exit(1);
    }
    console.log(`${LABEL}: LIVE PASS — every posted settlement GL-bill row names its bill and cash entries`);
  } finally {
    client.release();
    await pool.end();
  }
}
