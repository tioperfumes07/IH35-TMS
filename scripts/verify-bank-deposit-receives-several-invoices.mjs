#!/usr/bin/env node
// ROUND 433 B8 (owner) — "when several transactions match one deposit, the user must be able to select SEVERAL
// invoices." A selection model, with money in it. This guard keeps the whole chain built:
//
//   1. ONE PAYMENT WRITER. accounting.payments rows for a receive payment are written by
//      apps/backend/src/accounting/payments/customer-payment-create.service.ts only; the Receive Payment route and the
//      Banking receive-and-match both call createCustomerPaymentInClient and neither INSERTs a payment itself.
//   2. THE BANK LINE IS THE SOURCE. receive-and-match creates its payments with payment_source_kind 'bank_feed_match'
//      and source_bank_transaction_id = the line, on the line's own bank account, then matches them through
//      acceptMultiDocumentMatchInClient in the SAME transaction (withLuciaBypass, line locked FOR UPDATE).
//   3. THE MONEY CLOSES. It refuses applications over the deposit and a remainder with no home
//      (customer credit or a named difference account posted by the multi accept's postDifferenceJournalEntry).
//   4. IT IS REACHABLE. The route exists with the reconcile role gate; MatchDrawer mounts ReceiveAgainstInvoicesPanel on a
//      deposit (bank_is_credit); the panel is checkboxes + per-invoice amounts + Deposit / Selected / Remainder.
//   5. The match drawer's multi-select is keyed kind+id, and 'deposit' is an acceptable route kind.
//
// COVERAGE COUNT (shrink-only the wrong way): the number of B8 chain checks that hold is printed; any regression fails.
//
// Usage: node scripts/verify-bank-deposit-receives-several-invoices.mjs [--selftest]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-deposit-receives-several-invoices";

export const FILES = {
  writer: "apps/backend/src/accounting/payments/customer-payment-create.service.ts",
  route: "apps/backend/src/accounting/customer-payments.routes.ts",
  service: "apps/backend/src/accounting/bank-recon/receive-and-match.service.ts",
  match: "apps/backend/src/accounting/bank-recon/match.service.ts",
  reconRoutes: "apps/backend/src/accounting/bank-recon/recon-worklist.routes.ts",
  drawer: "apps/frontend/src/pages/banking/components/MatchDrawer.tsx",
  panel: "apps/frontend/src/pages/banking/components/ReceiveAgainstInvoicesPanel.tsx",
};

const strip = (s) => String(s ?? "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

export function analyze(files) {
  const checks = [];
  const t = (ok, msg) => checks.push({ ok: Boolean(ok), msg });
  const f = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strip(v)]));

  t(/INSERT INTO accounting\.payments\b/.test(f.writer) && /postSourceTransactionInClientTx\(/.test(f.writer), "the payment writer inserts the payment and posts it in the caller's transaction");
  t(/getAppliedCreditMemoCents\(/.test(f.writer) && /apply_amount_exceeds_invoice_open/.test(f.writer), "the writer checks each invoice's open balance net of credit memos");
  t(/createCustomerPaymentInClient\(/.test(f.route) && !/INSERT INTO accounting\.payments\b/.test(f.route), "the Receive Payment route calls the one writer and inserts no payment itself");
  t(/createCustomerPaymentInClient\(/.test(f.service) && !/INSERT INTO accounting\.payments\b/.test(f.service), "receive-and-match calls the one writer and inserts no payment itself");
  t(/payment_source_kind:\s*"bank_feed_match"/.test(f.service) && /source_bank_transaction_id:\s*input\.bank_transaction_id/.test(f.service), "each payment points at the bank line it came from");
  t(/bank_account_id:\s*line\.bank_account_id/.test(f.service), "each payment is deposited to the bank line's own account");
  t(/withLuciaBypass\(/.test(f.service) && /FOR UPDATE/.test(f.service) && /acceptMultiDocumentMatchInClient\(/.test(f.service), "payments and match commit as one transaction on a locked line");
  t(/applications_exceed_bank_amount/.test(f.service) && /remainder_needs_a_home/.test(f.service), "the money closes: no over-application, no homeless remainder");
  t(/receive_payment_needs_a_deposit/.test(f.service), "only a deposit can receive customer payments");
  const multiBody = (() => {
    const i = f.match.indexOf("export async function acceptMultiDocumentMatchInClient");
    if (i < 0) return "";
    const j = f.match.indexOf("\nexport ", i + 10);
    return f.match.slice(i, j < 0 ? undefined : j);
  })();
  t(/postDifferenceJournalEntry\(client,\s*\{[\s\S]{0,200}difference_account_id:\s*input\.difference_account_id/.test(multiBody), "the multi accept posts a named difference through the 1:1 path's poster");
  t(/"\/api\/v1\/bank-recon\/receive-and-match"/.test(f.reconRoutes) && /receivePaymentsAndMatch\(/.test(f.reconRoutes), "the receive-and-match route is registered");
  t(/canReconcile\(user\.role\)[\s\S]{0,400}receiveAndMatchBodySchema/.test(f.reconRoutes), "the route carries the reconcile role gate");
  t(/z\.enum\(\[[^\]]*"deposit"[^\]]*\]\)/.test(f.reconRoutes), "'deposit' is an acceptable match kind on the routes");
  t(/<ReceiveAgainstInvoicesPanel\b/.test(f.drawer) && /bank_is_credit/.test(f.drawer), "the match drawer offers the invoice selection on a deposit");
  t(/selectedIds\.has\(multiKey\(c\)\)/.test(f.drawer) && !/selectedIds\.has\(c\.ledger_entry_id\)/.test(f.drawer), "the drawer's multi-select is keyed kind+id");
  t(/type="checkbox"/.test(f.panel) && /<MoneyInput\b/.test(f.panel) && /Remainder/.test(f.panel) && /receivePaymentsAndMatchBankLine\(/.test(f.panel), "the panel selects several invoices with an amount each and shows the remainder");
  return checks;
}

function readAll() {
  return Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, fs.readFileSync(path.join(ROOT, rel), "utf8")]));
}

function selftest() {
  const base = readAll();
  const failed = analyze(base).filter((c) => !c.ok);
  if (failed.length) { console.error(`${LABEL} --selftest: tree fails:\n  ${failed.map((c) => c.msg).join("\n  ")}`); process.exit(1); }
  const mut = (k, fn) => ({ ...base, [k]: fn(base[k]) });
  const cases = [
    ["route inserts a payment itself", mut("route", (s) => `${s}\nconst x = \`INSERT INTO accounting.payments (id) VALUES (1)\`;`)],
    ["payment loses its bank pointer", mut("service", (s) => s.replace("source_bank_transaction_id: input.bank_transaction_id", "source_bank_transaction_id: null"))],
    ["over-application allowed", mut("service", (s) => s.split("applications_exceed_bank_amount").join("ok"))],
    ["match outside the transaction", mut("service", (s) => s.replace("acceptMultiDocumentMatchInClient(", "acceptExactMultiDocumentMatch("))],
    ["difference no longer posted", mut("match", (s) => { const i = s.indexOf("export async function acceptMultiDocumentMatchInClient"); return s.slice(0, i) + s.slice(i).replace("difference_account_id: input.difference_account_id", "difference_account_id: null as never"); })],
    ["route dropped", mut("reconRoutes", (s) => s.replace('"/api/v1/bank-recon/receive-and-match"', '"/api/v1/bank-recon/x"'))],
    ["panel unmounted", mut("drawer", (s) => s.replace("<ReceiveAgainstInvoicesPanel", "<div data-x"))],
    ["multi keyed by id only", mut("drawer", (s) => s.replace("selectedIds.has(multiKey(c))", "selectedIds.has(c.ledger_entry_id)"))],
    ["deposit kind removed", mut("reconRoutes", (s) => s.replace(', "deposit"]', "]"))],
  ];
  let n = 0;
  for (const [name, files] of cases) {
    if (JSON.stringify(files) === JSON.stringify(base)) { console.error(`${LABEL} --selftest: "${name}" changed nothing`); process.exit(1); }
    if (!analyze(files).some((c) => !c.ok)) { console.error(`${LABEL} --selftest: mutation escaped: ${name}`); process.exit(1); }
    n++;
  }
  console.log(`${LABEL} --selftest PASS ${n + 1}/${cases.length + 1}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--selftest")) selftest();
  else {
    const checks = analyze(readAll());
    const failed = checks.filter((c) => !c.ok);
    if (failed.length) { console.error(`${LABEL}: FAIL — ${checks.length - failed.length}/${checks.length} chain checks hold\n  ${failed.map((c) => c.msg).join("\n  ")}`); process.exit(1); }
    console.log(`${LABEL}: PASS — ${checks.length}/${checks.length} chain checks hold: one deposit is received against several invoices through the one payment writer and matched in the same transaction`);
  }
}
