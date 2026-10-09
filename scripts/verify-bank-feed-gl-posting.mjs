#!/usr/bin/env node
// Guard (BLOCK-03 / CHAIN-05): the bank-feed categorization → GL posting gap-closure must stay wired the
// way it was built and can't silently regress:
//   1. 'bank_categorization' is a registered PostingSourceType + a buildPostingDraft branch (reuse the ONE
//      posting engine — no new GL writer).
//   2. The line-builder derives direction from is_credit and posts Math.abs(amount_cents) — NEVER the sign
//      (money-out is stored negative). Both legs of the direction rule are present.
//   3. The categorize route calls the service; the service is gated by BANK_FEED_GL_POSTING_ENABLED and
//      keeps the three double-post interlocks (driver-advance cede, matched-bill skip, transfer skip).
//   4. No banking route/service writes journal entries inline (no `INSERT INTO accounting.journal_entries`
//      / `journal_entry_postings` outside the posting engine) — all GL flows through postSourceTransaction.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => {
  console.error(`FAIL verify-bank-feed-gl-posting: ${m}`);
  process.exit(1);
};
// ONE definition, used by both the live check and the --selftest (a selftest of a copy proves nothing about the original).
const ENGINE_CALL_RE = /\bpostSourceTransaction(?:InClientTx)?\(/;
if (process.argv.includes("--selftest")) {
  // The engine-call rule must pass both engine entry points and fail a service that posts no engine call or writes GL inline.
  const re = ENGINE_CALL_RE;
  const inline = /INSERT\s+INTO\s+accounting\.journal_entr/i;
  const cases = [
    ["in-tx engine call passes", re.test("await postSourceTransactionInClientTx(client, x)"), true],
    ["bare engine call passes", re.test("await postSourceTransaction(x)"), true],
    ["no engine call fails", re.test("await client.query(sql)"), false],
    ["look-alike name fails", re.test("await myPostSourceTransactionWrapper(x)"), false],
    ["inline GL write is caught", inline.test("INSERT INTO accounting.journal_entry_postings (a) VALUES ($1)"), true],
  ];
  const bad = cases.filter(([, got, want]) => got !== want);
  for (const [n, got, want] of cases) console.log(`  ${got === want ? "PASS" : "FAIL"}  ${n}`);
  if (bad.length) { console.error(`verify-bank-feed-gl-posting --selftest FAIL (${bad.length})`); process.exit(1); }
  console.log(`verify-bank-feed-gl-posting --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(0);
}

const engine = readFileSync(join(root, "apps/backend/src/accounting/posting-engine.service.ts"), "utf8");
const service = readFileSync(join(root, "apps/backend/src/banking/bank-feed-gl-posting.service.ts"), "utf8");
const route = readFileSync(join(root, "apps/backend/src/banking/categorization.routes.ts"), "utf8");

// 1. Source type + build branch registered in the ONE posting engine.
if (!/"bank_categorization"/.test(engine)) fail("'bank_categorization' must be a registered PostingSourceType in posting-engine.service.ts");
if (!/sourceType === "bank_categorization"\)\s*return buildBankCategorizationLines/.test(engine)) {
  fail("buildPostingDraft must route 'bank_categorization' to buildBankCategorizationLines");
}
if (!/function buildBankCategorizationLines/.test(engine)) fail("buildBankCategorizationLines must exist in posting-engine.service.ts");

// 2. Direction from is_credit, magnitude via Math.abs — never the amount_cents sign.
if (!/Math\.abs\(Number\(txn\.amount_cents/.test(engine)) fail("buildBankCategorizationLines must post Math.abs(amount_cents) (sign landmine)");
if (!/txn\.is_credit === true/.test(engine)) fail("buildBankCategorizationLines must derive direction from is_credit === true");
// The direction must NOT be decided by the sign of amount_cents anywhere in the builder.
const builder = engine.slice(engine.indexOf("function buildBankCategorizationLines"), engine.indexOf("async function buildPostingDraft"));
if (/amount_cents\s*[<>]=?\s*0/.test(builder)) fail("direction must derive from is_credit, NOT the sign of amount_cents");

// 3. Route wires the service; service gated by the OFF flag + keeps the interlocks.
if (!/maybePostBankCategorizationToGl/.test(route)) fail("categorize route must call maybePostBankCategorizationToGl");
if (!/BANK_FEED_GL_POSTING_ENABLED/.test(service)) fail("service must gate on BANK_FEED_GL_POSTING_ENABLED");
if (!/isEnabled\(/.test(service)) fail("service must resolve the flag via isEnabled (per-entity)");
if (!/reason:\s*"driver_advance_branch"/.test(service)) fail("driver-advance CEDE interlock (driver_advance_branch) must exist");
if (!/reason:\s*"already_matched_to_bill"/.test(service)) fail("matched-to-bill interlock (already_matched_to_bill) must exist");
if (!/reason:\s*"is_transfer"/.test(service)) fail("own-bank transfer interlock (is_transfer) must exist");
// ROUND 389.4 triage (CC-2): the service posts through the engine's in-transaction entry point
// postSourceTransactionInClientTx (the categorize write and its GL post commit together). The old regex accepted only the
// bare postSourceTransaction( and failed verified-correct code. Either engine entry point passes; anything else fails.
if (!ENGINE_CALL_RE.test(service)) fail("service must post via postSourceTransaction / postSourceTransactionInClientTx (reuse the engine — no new GL math)");

// 4. No inline GL writes in banking routes/services.
for (const [name, src] of [
  ["categorization.routes.ts", route],
  ["bank-feed-gl-posting.service.ts", service],
]) {
  if (/INSERT\s+INTO\s+accounting\.journal_entr/i.test(src)) {
    fail(`${name} must not write accounting.journal_entries/journal_entry_postings inline — post via the engine`);
  }
}

// 5. QBO Category = CoA account (Martin / owner 2026-10-09). Bank Categorize posts the CoA id the
// operator picked (categorization_gl_account_id) — NEVER through expense_category_account_map / Items.
// Items/Products & Services keep their own income/expense map; Category does not need a second map.
const builderBody = engine.slice(
  engine.indexOf("function buildBankCategorizationLines"),
  engine.indexOf("async function resolveTransferLegAccountId")
);
if (!/categorization_gl_account_id/.test(builderBody)) {
  fail("buildBankCategorizationLines must post against categorization_gl_account_id (CoA Category = the account)");
}
if (/expense_category_account_map/.test(builderBody)) {
  fail("bank Categorize must NOT resolve the category leg via expense_category_account_map (QBO: Category IS the CoA account)");
}
if (/catalogs\.items|default_expense_account|default_income_account/.test(builderBody)) {
  fail("bank Categorize CoA path must not require catalogs.items / item default accounts");
}

// 6. Account Register QBO parity — bank_categorization surfaces as Expense (money OUT) or Deposit
// (money IN), never a third "Bank Categorization" type. Expense/Deposit filters include those rows.
const register = readFileSync(join(root, "apps/backend/src/accounting/account-register.service.ts"), "utf8");
const registerFe = readFileSync(join(root, "apps/frontend/src/pages/accounting/AccountRegisterPage.tsx"), "utf8");
if (!/bank_is_credit === true[\s\S]*?"Deposit"[\s\S]*?"Expense"/.test(register) && !/bank_is_credit === true\s*\?\s*"Deposit"\s*:\s*"Expense"/.test(register)) {
  fail("account-register must label bank_categorization as Deposit (is_credit) or Expense (money-out)");
}
if (!/source_transaction_type = 'bank_categorization'[\s\S]*is_credit IS NOT TRUE/.test(register)) {
  fail("Expense type filter must include bank_categorization money-OUT (is_credit IS NOT TRUE)");
}
if (!/source_transaction_type = 'bank_categorization'[\s\S]*is_credit IS TRUE/.test(register)) {
  fail("Deposit type filter must include bank_categorization money-IN (is_credit IS TRUE)");
}
if (/"Bank Categorization"/.test(registerFe)) {
  fail("AccountRegisterPage must not expose a Bank Categorization chip — QBO uses Expense / Deposit only");
}

console.log("PASS verify-bank-feed-gl-posting");
