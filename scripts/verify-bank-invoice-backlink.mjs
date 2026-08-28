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
// GO-0014 / BANK-F01-F02-F03-F07 query-back (CC-3 2026-08-28) — this guard covered only the FIRST call
// site. match.service.ts's own inline comment (ACCT-F5620, "re-applied a 3rd time — see
// DEVIN-A-STALE-BRANCH-REPEATEDLY-DELETES-MERGED-CODE-FIXES") documents that the SECOND call site —
// the reconciliation-accept re-attempt, needed because every live USMCA case applies a payment to its
// invoice BEFORE bank-matching it, so the apply-time attempt always fires with no source bank
// transaction yet — is the one that keeps getting silently deleted, which is exactly why hop.bank
// measured 0 even after the writer first shipped. Live-verified 2026-08-28 (Neon, lucia bypass):
// exactly 1 `banking.bank_transactions` row has `matched_invoice_id` set on all of prod, and it is the
// reconciliation-accept path's own output (created 2026-08-26) — the density this guard exists to
// protect is still that thin, so a second silent deletion would be invisible again without this check.
const RECON_CALLER = "apps/backend/src/accounting/bank-recon/match.service.ts";

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
  const reconCallerRaw = sources[RECON_CALLER] ?? "";
  const svc = stripCommentsAndStrings(svcRaw);
  const svcStr = stripCommentsOnly(svcRaw);
  const caller = stripCommentsAndStrings(callerRaw);
  const reconCaller = stripCommentsAndStrings(reconCallerRaw);

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

  // 1b. The reconciliation-accept re-attempt (ACCT-F5620) must also still call the same backlink.
  // Every live USMCA payment is applied to its invoice BEFORE being bank-matched, so the apply-path
  // call above always fires with no source bank transaction yet and can never link anything by
  // itself — this second call site is the one that actually produces every real matched_invoice_id on
  // prod, and it is the one that has been silently deleted before (this exact comment says "3rd time").
  if (!reconCallerRaw) {
    errors.push(
      `${RECON_CALLER}: missing — the reconciliation-accept re-attempt is gone, so matched_invoice_id ` +
        `can only ever be set on the apply-time call, which fires before a source bank transaction ` +
        `exists on every live ordering and therefore links nothing.`
    );
  } else if (!/backlinkBankTransactionToInvoice\s*\(/.test(reconCaller)) {
    errors.push(
      `${RECON_CALLER}: does not CALL backlinkBankTransactionToInvoice in its reconciliation-accept ` +
        `path — this is the re-attempt that fires AFTER source_bank_transaction_id is finally set; ` +
        `without it hop.bank silently returns to 0 even though the apply-path call still exists.`
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
  for (const f of [SVC, CALLER, RECON_CALLER]) {
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
    ["recon-accept re-attempt file deleted", (s) => ({ ...s, [RECON_CALLER]: "" })],
    ["recon-accept re-attempt call removed", (s) => ({ ...s, [RECON_CALLER]: s[RECON_CALLER].split("backlinkBankTransactionToInvoice").join("noopLink") })],
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
