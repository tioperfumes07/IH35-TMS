#!/usr/bin/env node
/**
 * GUARD — Lead audit of 5769 (2026-10-11), rulings R12 + D1/D2/D5/D7 (CC-3 part).
 *   R12  A Settlement Creator post records NO payment and touches NO bank account: the close runs with leaveNetOpen, the
 *        A/P chain writes no net-pay bill payment, the net stays open on Accounts Payable ("I match later in banking").
 *   D1/D2 A Creator fuel row carries the card the draft names (fuel_card_id -> catalogs.fuel_card_types by code) and its
 *        note; a USMCA row with no card is read as Relay and posts nothing.
 *   D5   Deductions and per-load escrow are applied to their own load's bill (preferredLoadId), never netted on load 1.
 *   D7   No $0.00 Empty Miles line when a load has no empty miles.
 * Run: node scripts/verify-settlement-creator-post-writes-no-bank-posting.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-creator-post-writes-no-bank-posting";
const D = "apps/backend/src/driver-finance/";
const F = {
  creator: D + "settlement-creator.service.ts",
  close: D + "settlement-payrun-close.service.ts",
  chain: D + "settlement-ap-chain.service.ts",
  engine: D + "settlement-engine.ts",
};

export function problems(s) {
  const p = [];
  if (!/const closeInput = \{[^}]*leaveNetOpen: true \}/.test(s.creator)) p.push("R12: the Creator's close does not pass leaveNetOpen: true");
  if (/paymentMethodId|bankTxnId|payoutBankAccountId/.test(s.creator.slice(s.creator.indexOf("const closeInput"), s.creator.indexOf("const closeInput") + 400))) p.push("R12: the Creator's close names a payment method / bank");
  if (!/if \(netCents > 0 && input\.leaveNetOpen\) \{[\s\S]{0,1200}"ap_control"[\s\S]{0,1200}\} else if \(netCents > 0\) \{/.test(s.close)) p.push("R12: the close does not keep the net on A/P (ap_control) without reading a bank when leaveNetOpen");
  if (!/leaveNetOpen: input\.leaveNetOpen === true/.test(s.close)) p.push("R12: the close does not pass leaveNetOpen to the A/P chain");
  if (!/if \(cash > 0 && !input\.leaveNetOpen\) \{\s*const bp = await payBillInClientTx/.test(s.chain)) p.push("R12: the A/P chain still pays the net from the bank when leaveNetOpen");
  if (!/netTotal > 0 && !input\.leaveNetOpen && !input\.payoutBankAccountId/.test(s.chain)) p.push("R12: the A/P chain still requires a payout bank when leaveNetOpen");
  if (!/source_doc_id, fuel_card_id, notes/.test(s.creator) || !/FROM catalogs\.fuel_card_types ct WHERE ct\.operating_company_id = \$1::uuid AND ct\.code = upper\(\$20\)/.test(s.creator)) p.push("D1/D2: the Creator fuel row does not stamp fuel_card_id / notes");
  if (!/fuel_card_type_missing/.test(s.creator)) p.push("D1/D2: a fill whose card type is missing is not refused");
  if (!/applications\.push\(\{ kind: "deduction", cents, accountId: acct, preferredLoadId: loadId/.test(s.close)) p.push("D5: deductions are not applied to their own load");
  if (!/kind: "escrow", cents: Number\(r\.cents\), accountId: escrow\.accountId, preferredLoadId: r\.load_id/.test(s.close)) p.push("D5: per-load escrow is not applied to its own load");
  if (!/const hasDeadheadLine = bill\.loaded_pay_cents !== null && bill\.loaded_pay_cents !== undefined && deadheadCents > 0;/.test(s.engine)) p.push("D7: a $0 Empty Miles line is still written");
  // Fork rehearsal (2026-10-11): a posted Creator expense is stamped posted; extra pay carries its item.
  // LEAD 443.130: three Creator posting paths since 443.121 #1 (#26671) — the adopted fuel receipt, a fresh fuel posting, a
  // company expense. Each must stamp the expense posted with ITS journal entry (was: a bare count of 2 call sites).
  if (!/if \(receiptPosted\?\.journal_entry_id\) \{\s*await stampExpensePosted\(client, draft\.operating_company_id, doc\.expense_id, receiptPosted\.journal_entry_id\)/.test(s.creator)) p.push("a Creator expense (fuel, adopted receipt) is posted but not stamped posted");
  if (!/if \(!posted\.journal_entry_id\) throw new Error\("posting engine returned no journal entry"\);\s*await stampExpensePosted\(client, draft\.operating_company_id, doc\.expense_id, posted\.journal_entry_id\)/.test(s.creator)) p.push("a Creator expense (fuel) is posted but not stamped posted");
  if (!/if \(!journalEntryId\) throw new Error\("posting engine returned no journal entry"\);\s*await stampExpensePosted\(client, draft\.operating_company_id, expenseId, journalEntryId\)/.test(s.creator)) p.push("a Creator expense (company) is posted but not stamped posted");
  if (!/SET posting_status = 'posted',(?: status = 'posted',)? posted_at = COALESCE\(posted_at, now\(\)\), journal_entry_id = \$3::uuid/.test(s.creator)) p.push("stampExpensePosted no longer stamps posting_status + journal_entry_id");
  if (!/extra_pay_item_required/.test(s.creator) || !/item_id, quantity, rate_cents,\s*unit_of_measure, is_active, is_sample_data/.test(s.creator)) p.push("extra pay is written without its item");
  return p;
}

const read = () => Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, fs.readFileSync(path.join(ROOT, rel), "utf8")]));

function selftest() {
  const good = read();
  const bad = [];
  if (problems(good).length) bad.push(`real tree flagged: ${problems(good).join("; ")}`);
  const plants = [
    ["creator", (x) => x.replace(", leaveNetOpen: true }", " }")],
    ["chain", (x) => x.replace("if (cash > 0 && !input.leaveNetOpen) {", "if (cash > 0) {")],
    ["chain", (x) => x.replace("netTotal > 0 && !input.leaveNetOpen && !input.payoutBankAccountId", "netTotal > 0 && !input.payoutBankAccountId")],
    ["close", (x) => x.replace("leaveNetOpen: input.leaveNetOpen === true,", "")],
    ["close", (x) => x.replace("preferredLoadId: loadId, description", "description")],
    ["close", (x) => x.replace("preferredLoadId: r.load_id, description", "description")],
    ["creator", (x) => x.replace("source_doc_id, fuel_card_id, notes", "source_doc_id")],
    ["engine", (x) => x.replace(" && deadheadCents > 0;", ";")],
    ["creator", (x) => x.replace("await stampExpensePosted(client, draft.operating_company_id, doc.expense_id", "await Promise.resolve(client, draft.operating_company_id, doc.expense_id")],
    ["creator", (x) => x.replace("await stampExpensePosted(client, draft.operating_company_id, doc.expense_id, receiptPosted.journal_entry_id)", "void receiptPosted")],
    ["creator", (x) => x.replace("await stampExpensePosted(client, draft.operating_company_id, expenseId, journalEntryId)", "void journalEntryId")],
    ["creator", (x) => x.replace("extra_pay_item_required", "extra_pay_x")],
  ];
  for (const [k, f] of plants) {
    const planted = f(good[k]);
    if (planted === good[k]) bad.push(`plant on ${k} did not apply: ${f.toString().slice(0, 70)}`);
    else if (!problems({ ...good, [k]: planted }).length) bad.push(`plant on ${k} passed: ${f.toString().slice(0, 70)}`);
  }
  if (bad.length) { console.error(`${LABEL} selftest FAIL\n- ${bad.join("\n- ")}`); process.exit(1); }
  console.log(`${LABEL} selftest PASS (${plants.length} plants caught)`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const p = problems(read());
  if (p.length) { console.error(`${LABEL} FAIL\n- ${p.join("\n- ")}`); process.exit(1); }
  console.log(`${LABEL} PASS`);
}
