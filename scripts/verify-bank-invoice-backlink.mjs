#!/usr/bin/env node
/**
 * GUARD — verify-bank-invoice-backlink (HOP 9, bank path)
 *
 * THE DEFECT THIS ASSERTS — measured by repo-wide search, and by the tracker on prod
 * `banking.bank_transactions.matched_invoice_id` and `.matched_payment_id` existed, the Banking UI read
 * them, and NOTHING IN THE BACKEND EVER WROTE THEM. The scenario tracker's hop.bank predicate is
 * exactly "a bank line matched to an invoice" and measured **0 on prod** — the final hop of the money
 * slice was structurally unreachable. A customer could pay, the payment could apply, the GL could post,
 * and the bank line carrying the cash stayed unlinked forever.
 *
 * The consequences are reconciliation-grade, not cosmetic: bank rec cannot tell a settled receipt from
 * an uncategorized deposit, an invoice's drill-through stops at the payment and never reaches the cash,
 * and collections cannot prove WHICH deposit paid an invoice when a customer disputes it.
 *
 * WHAT IS ASSERTED
 *   1. a writer for matched_invoice_id still exists and is reached from the payment-apply path — if the
 *      call is dropped the column silently returns to having no writer at all, which is invisible;
 *   2. the UPDATE stays entity-scoped, so one company's payment can never stamp another's bank row;
 *   3. it only fills a NULL (`matched_invoice_id IS NULL`) — silently repointing a bank line a human
 *      already reconciled is worse than not linking;
 *   4. the multi-invoice case refuses rather than guessing. One bank line settling three invoices has
 *      no single matched_invoice_id, and picking one would invent a fact the ledger does not support;
 *   5. the back-link cannot throw into the payment path — linkage must never undo money that moved.
 *
 * METHOD: comments and string literals stripped before structural assertions. --selftest mutates the
 * REAL sources and requires every assertion to trip.
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-bank-invoice-backlink";
const SVC = "apps/backend/src/accounting/payments/bank-invoice-backlink.service.ts";
const CALLER = "apps/backend/src/accounting/payments/apply.service.ts";

function stripCommentsAndStrings(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/`(?:\\[\s\S]|[^\\`])*`/g, "``")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}
function stripCommentsOnly(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function check(sources) {
  const errors = [];
  const svcRaw = sources[SVC] ?? "";
  const callerRaw = sources[CALLER] ?? "";
  const svc = stripCommentsAndStrings(svcRaw);
  const svcStr = stripCommentsOnly(svcRaw);
  const caller = stripCommentsAndStrings(callerRaw);

  if (!svcRaw) {
    errors.push(`${SVC}: missing — matched_invoice_id would have no writer at all again (hop.bank unreachable).`);
    return errors;
  }

  // 1. Still writes the column, and is actually called from the apply path.
  if (!/UPDATE banking\.bank_transactions/i.test(svcStr) || !/matched_invoice_id\s*=/i.test(svcStr)) {
    errors.push(`${SVC}: no UPDATE writing banking.bank_transactions.matched_invoice_id.`);
  }
  if (!/backlinkBankTransactionToInvoice\s*\(/.test(caller)) {
    errors.push(
      `${CALLER}: does not CALL backlinkBankTransactionToInvoice — the writer exists but is unreachable, ` +
        `so matched_invoice_id silently goes back to never being set.`
    );
  }

  // 2. Entity-scoped on the write.
  if (!/UPDATE banking\.bank_transactions[\s\S]{0,600}operating_company_id\s*=\s*\$4::uuid/i.test(svcStr)) {
    errors.push(
      `${SVC}: the UPDATE is not scoped by operating_company_id — one company's payment could stamp ` +
        `another company's bank transaction.`
    );
  }

  // 3. Fill-only-NULL, never repoint.
  if (!/matched_invoice_id\s+IS\s+NULL/i.test(svcStr)) {
    errors.push(
      `${SVC}: the UPDATE does not require matched_invoice_id IS NULL — it would silently repoint a ` +
        `bank line a human already reconciled.`
    );
  }

  // 4. Refuses to guess when several invoices share one payment.
  if (!/no_single_invoice/.test(svcStr) || !/unique\.length\s*!==\s*1/.test(svc)) {
    errors.push(
      `${SVC}: the multi-invoice refusal is gone. One bank line settling several invoices has no single ` +
        `matched_invoice_id; picking one invents a fact accounting.payment_applications does not support.`
    );
  }

  // 5. Never throws into the payment path.
  if (!/try\s*\{/.test(svc) || !/catch\s*\(/.test(svc)) {
    errors.push(
      `${SVC}: no try/catch — a linkage failure would propagate into applyPayment and could undo a ` +
        `payment whose GL entry already posted.`
    );
  }
  return errors;
}

function loadAll() {
  const out = {};
  for (const f of [SVC, CALLER]) {
    try {
      out[f] = readFileSync(f, "utf8");
    } catch {
      out[f] = "";
    }
  }
  return out;
}

function selftest() {
  const real = loadAll();
  const baseline = check(real);
  if (baseline.length) {
    console.error(`${LABEL} --selftest FAIL — real sources do not pass:`);
    for (const e of baseline) console.error(`  - ${e}`);
    process.exit(1);
  }
  const mutations = [
    ["writer deleted", (s) => ({ ...s, [SVC]: "" })],
    ["call removed from apply path", (s) => ({ ...s, [CALLER]: s[CALLER].split("backlinkBankTransactionToInvoice").join("noopLink") })],
    ["update loses entity scope", (s) => ({ ...s, [SVC]: s[SVC].replace("AND operating_company_id = $4::uuid", "") })],
    ["repoints an existing match", (s) => ({ ...s, [SVC]: s[SVC].replace("AND matched_invoice_id IS NULL", "") })],
    ["guesses on multi-invoice", (s) => ({ ...s, [SVC]: s[SVC].replace("unique.length !== 1", "false") })],
    ["throws into the payment path", (s) => ({ ...s, [SVC]: s[SVC].replace("try {", "if (true) {").replace(/\} catch \([\s\S]*?\n  \}/, "}") })],
  ];
  for (const [name, mutate] of mutations) {
    const broken = mutate(real);
    if (JSON.stringify(broken) === JSON.stringify(real)) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" changed nothing (guard is stale).`);
      process.exit(1);
    }
    if (check(broken).length === 0) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" was NOT detected.`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS — ${mutations.length} mutations all detected.`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const errors = check(loadAll());
if (errors.length) {
  console.error(`${LABEL} FAIL — ${errors.length} problem(s) on the bank→invoice back-link:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `${LABEL} PASS — the bank line that carried a receipt is linked to the invoice it settled: ` +
    `entity-scoped, fill-only-NULL, refuses to guess across invoices, and never throws into the payment.`
);
