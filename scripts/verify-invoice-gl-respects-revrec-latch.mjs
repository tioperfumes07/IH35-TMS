#!/usr/bin/env node
/**
 * GUARD: the invoice A/R poster must not post a load the delivery latch has already billed. ACCT-F205.
 *
 * THE DOUBLE-RECOGNITION, MEASURED ON PROD. The two-event delivery latch posts, per load:
 *   earn:  DR 1150 Unbilled Revenue / CR 4000 Income
 *   bill:  DR 1100 A/R              / CR 1150 Unbilled Revenue
 * so once `bill` has fired, A/R and revenue are both already on the books. The invoice poster then
 * posts DR ar_control / CR revenue for the SAME freight. On load L-20260806-0008 ($1,875.50):
 *   LATCH earn       DR 1150 187550 / CR 4000 187550
 *   LATCH bill       DR 1100 187550 / CR 1150 187550
 *   INVOICE f17a6483 DR 1100 187550 / CR 4000 187550   <-- A/R and Income each counted TWICE
 * A/R overstated by $1,875.50 and revenue overstated by $1,875.50, silently, on one load.
 *
 * WHY IT HAPPENED. The latch poster's header states the rule — "keep INVOICE_AR_GL_POSTING_ENABLED OFF
 * for load-sourced invoices ... otherwise bill-first A/R would double-recognize revenue. Coordination
 * is owner-gated; both flags default OFF." That coordination lived ONLY in a comment. Nothing checked
 * it, and on prod both flags are ON for USMCA and TRANSP. A flag convention that nothing enforces is
 * not a control; it is a hope. This guard is the enforcement.
 *
 * WHAT IT REQUIRES, and why the second half matters as much as the first:
 *   A. invoice-gl.service.ts must consult the load's revrec bill latch before posting.
 *   B. it must do so through standingLatchJePredicate (or an equivalent reversed/voided JE test).
 *      A latch whose journal entry was REVERSED must NOT block the invoice — otherwise the invoice is
 *      refused forever and the revenue is lost the other way. The latch poster's own header documents
 *      that trap by name ("the ACCT-F59 invoice interlock would refuse that load's invoice forever"),
 *      so a naive `event='bill' EXISTS` check would trade one silent money bug for another.
 *
 * Run:  node scripts/verify-invoice-gl-respects-revrec-latch.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/backend/src/accounting/invoice-gl.service.ts";
const LABEL = "verify-invoice-gl-respects-revrec-latch";

export function stripComments(src) {
  return src.replace(/--[^\n]*/g, "").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

export function checksLatch(src) {
  const clean = stripComments(src);
  return /load_revenue_recognition_postings/i.test(clean) && /'bill'/.test(clean);
}

export function usesStandingPredicate(src) {
  const clean = stripComments(src);
  if (/standingLatchJePredicate/.test(clean)) return true;
  // An inline equivalent is acceptable: it must exclude reversed AND voided journal entries.
  return /reversed_by_je_id/i.test(clean) && /voided_at/i.test(clean);
}

export function collectProblems(src, file = TARGET) {
  const problems = [];
  if (!checksLatch(src)) {
    problems.push(
      `${file}: posts invoice A/R without consulting the load's revrec bill latch. Once the latch has ` +
        `fired 'bill', A/R and revenue are ALREADY posted for that load, so this debits A/R and ` +
        `credits revenue a second time for the same freight — measured on prod at $1,875.50 on load ` +
        `L-20260806-0008 (ACCT-F205).`
    );
    return problems;
  }
  if (!usesStandingPredicate(src)) {
    problems.push(
      `${file}: consults the latch but does not exclude REVERSED or VOIDED latch journal entries. A ` +
        `reversed latch must not block the invoice, or that load can never be invoiced and the ` +
        `revenue is lost the other way — the trap the latch poster names as "would refuse that load's ` +
        `invoice forever". Use standingLatchJePredicate (ACCT-F205).`
    );
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];

  const noCheck =
    "export async function postInvoiceGlIfEnabled(){ const enabled = await isInvoiceGlPostingEnabled(); if(!enabled) return; return postSourceTransactionInClientTx(); }";
  if (collectProblems(noCheck).length !== 1) failures.push("the ACCT-F205 defect (no latch check) was NOT caught");

  const naive =
    "SELECT 1 FROM accounting.load_revenue_recognition_postings r WHERE r.event = 'bill' LIMIT 1";
  const naiveProblems = collectProblems(naive);
  if (!naiveProblems.some((p) => /REVERSED/.test(p))) {
    failures.push("a naive latch check that ignores reversed JEs was NOT caught");
  }

  const good =
    "SELECT 1 FROM accounting.load_revenue_recognition_postings r WHERE r.event = 'bill' AND ${standingLatchJePredicate('r')} LIMIT 1";
  if (collectProblems(good).length !== 0) failures.push("the corrected interlock was flagged");

  const inlineEquivalent =
    "SELECT 1 FROM accounting.load_revenue_recognition_postings r JOIN accounting.journal_entries je ON je.id=r.journal_entry_id WHERE r.event='bill' AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL";
  if (collectProblems(inlineEquivalent).length !== 0) {
    failures.push("an inline reversed/voided-aware equivalent was flagged");
  }

  // A comment describing the interlock must not satisfy it.
  const commentOnly =
    "// consults load_revenue_recognition_postings for 'bill' via standingLatchJePredicate\n" + noCheck;
  if (collectProblems(commentOnly).length !== 1) {
    failures.push("a COMMENT describing the interlock satisfied the check — false green");
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — 5/5 (missing interlock caught, naive check caught, standing predicate ` +
      `passes, inline equivalent passes, comment cannot fake a pass)`
  );
  process.exit(0);
}

const abs = path.join(root, TARGET);
if (!fs.existsSync(abs)) {
  console.error(`${LABEL} FAIL — ${TARGET} is missing; the invoice A/R interlock cannot be verified.`);
  process.exit(1);
}
const problems = collectProblems(fs.readFileSync(abs, "utf8"));
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} issue(s):`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(
  `${LABEL} OK — the invoice A/R poster consults the load's STANDING revrec bill latch before posting.`
);
