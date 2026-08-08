#!/usr/bin/env node
/**
 * GUARD: the revenue double-post interlock must work in BOTH directions. ACCT-F59-INTERLOCK / FAIL-A1.
 *
 * Two posters can put the same freight on the books: the invoice GL poster (DR A/R / CR income) and the
 * two-event delivery latch (Event 1 earn, Event 2 bill). ACCT-F205 taught one of them to refuse when the
 * other had already fired — and only one.
 *
 * THE UNGUARDED DIRECTION IS THE ONE THAT ACTUALLY HAPPENED. Measured on prod
 * br-fancy-credit-akjnd07a: JE `7f2fff09` (source `invoice`) posted 07:14:33.413 and `f19cdf41` (the
 * latch) 07:14:33.836 — 423ms later. The INVOICE went first, then the latch. Both credit account 4000
 * Income 187550, neither is reversed, and INV-2026-00006 is `is_sample_data=false`, so USMCA income is
 * overstated by $1,875.50 in REAL money right now.
 *
 * A one-directional interlock is not an interlock; it is a coin flip on ordering. And a clean run does
 * not close it: the 2026-08-08 Delivered wave posted the invoice BETWEEN Event 1 and Event 2 — the
 * direction already covered — so it exercised the guarded half and left this half untested. That is
 * exactly how "we saw it work" becomes a false verdict.
 *
 * BOTH HALVES MUST ALSO EXCLUDE REVERSED JEs. If either side blocks on a voided or reversed journal
 * entry, that load can never be recognized again and the revenue is lost silently — the ACCT-F59 trap
 * the forward interlock already had to learn. A guard that only checked "an interlock exists" would
 * happily accept that regression, so this checks the standing-JE test on both sides.
 *
 * Run:  node scripts/verify-revrec-interlock-bidirectional.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const INVOICE_GL = "apps/backend/src/accounting/invoice-gl.service.ts";
const LATCH = "apps/backend/src/accounting/revrec-delivery-posting/poster.service.ts";
const LABEL = "verify-revrec-interlock-bidirectional";

export function stripComments(src) {
  return src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Forward: the invoice poster refuses when the delivery latch already posted. */
export function invoiceChecksLatch(src) {
  const clean = stripComments(src);
  return {
    checks: /load_revenue_recognition_postings/i.test(clean),
    excludesReversed: /reversed_by_je_id\s+IS\s+NULL/i.test(clean) || /standingLatchJePredicate\s*\(/.test(clean),
  };
}

/** Reverse: the latch refuses when an invoice already recognized this load. */
export function latchChecksInvoice(src) {
  const clean = stripComments(src);
  return {
    checks:
      /transaction_source_links/i.test(clean) &&
      /linked_object_type\s*=\s*'invoice'/i.test(clean) &&
      /FROM\s+accounting\.invoices/i.test(clean),
    excludesReversed: /je\.reversed_by_je_id\s+IS\s+NULL/i.test(clean),
    hasDistinctReason: /invoice_gl_already_recognized/.test(clean),
  };
}

export function collectProblems(invoiceSrc, latchSrc) {
  const problems = [];

  const fwd = invoiceChecksLatch(invoiceSrc);
  if (!fwd.checks) {
    problems.push(
      `${INVOICE_GL}: no interlock against accounting.load_revenue_recognition_postings — the invoice ` +
        `poster can double-recognize freight the delivery latch already booked (ACCT-F205).`
    );
  } else if (!fwd.excludesReversed) {
    problems.push(
      `${INVOICE_GL}: the interlock does not exclude reversed/voided latch JEs, so a reversed latch ` +
        `blocks that load's invoice FOREVER and the revenue is lost silently (ACCT-F59).`
    );
  }

  const rev = latchChecksInvoice(latchSrc);
  if (!rev.checks) {
    problems.push(
      `${LATCH}: the delivery latch does not check whether an INVOICE already posted this load's ` +
        `revenue/A-R. This is the direction that actually double-counted on prod — invoice at ` +
        `07:14:33.413, latch 423ms later, both crediting 4000 Income 187550, $1,875.50 of REAL money ` +
        `(ACCT-F59-INTERLOCK-IS-ONE-DIRECTIONAL).`
    );
  } else {
    if (!rev.excludesReversed) {
      problems.push(
        `${LATCH}: the reverse interlock does not exclude reversed/voided invoice JEs, so a reversed ` +
          `invoice posting would block recognition of that load forever (ACCT-F59).`
      );
    }
    if (!rev.hasDistinctReason) {
      problems.push(
        `${LATCH}: the reverse interlock reuses an existing refusal reason. It needs its own ` +
          `(invoice_gl_already_recognized) — conflating it with "already_posted" hides WHICH poster ` +
          `would have double-counted, which is the only useful thing the refusal records.`
      );
    }
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const GOOD_INV = "JOIN accounting.load_revenue_recognition_postings r ... AND ${standingLatchJePredicate('r')}";
  const GOOD_LATCH =
    "FROM accounting.invoices i JOIN accounting.transaction_source_links l ON l.linked_object_type = 'invoice' WHERE je.reversed_by_je_id IS NULL ... gate: 'invoice_gl_already_recognized'";

  if (collectProblems(GOOD_INV, GOOD_LATCH).length !== 0) failures.push("the bidirectional pair was flagged");

  if (!collectProblems(GOOD_INV, "const x = 1;").some((p) => /does not check whether an INVOICE/.test(p))) {
    failures.push("a missing REVERSE interlock was NOT caught — the whole point");
  }
  if (!collectProblems("const x = 1;", GOOD_LATCH).some((p) => /no interlock against/.test(p))) {
    failures.push("a missing FORWARD interlock was NOT caught");
  }
  const revNoReversal = GOOD_LATCH.replace("WHERE je.reversed_by_je_id IS NULL", "WHERE 1=1");
  if (!collectProblems(GOOD_INV, revNoReversal).some((p) => /reversed\/voided invoice JEs/.test(p))) {
    failures.push("a reverse interlock that blocks on reversed JEs was NOT caught");
  }
  const revNoReason = GOOD_LATCH.replace("gate: 'invoice_gl_already_recognized'", "gate: 'already_posted'");
  if (!collectProblems(GOOD_INV, revNoReason).some((p) => /reuses an existing refusal reason/.test(p))) {
    failures.push("a reverse interlock without its own reason was NOT caught");
  }
  const commentOnly = "// transaction_source_links linked_object_type = 'invoice' accounting.invoices";
  if (collectProblems(GOOD_INV, commentOnly).length < 1) {
    failures.push("a COMMENT satisfied the reverse check — false green");
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — 6/6 (bidirectional pair passes, missing reverse caught, missing forward ` +
      `caught, reversed-JE blocking caught both ways, distinct reason required, comment cannot fake)`
  );
  process.exit(0);
}

for (const f of [INVOICE_GL, LATCH]) {
  if (!fs.existsSync(path.join(root, f))) {
    console.error(`${LABEL} FAIL — ${f} is missing; the interlock cannot be verified.`);
    process.exit(1);
  }
}
const problems = collectProblems(
  fs.readFileSync(path.join(root, INVOICE_GL), "utf8"),
  fs.readFileSync(path.join(root, LATCH), "utf8")
);
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} gap(s) in the revenue double-post interlock:`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(
  `${LABEL} OK — the interlock refuses in BOTH directions and neither side blocks on a reversed JE.`
);
