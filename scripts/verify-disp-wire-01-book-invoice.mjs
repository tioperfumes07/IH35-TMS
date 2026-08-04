#!/usr/bin/env node
/**
 * GUARD — verify-disp-wire-01-book-invoice (CLS-DISP-WIRE-01, Phase 1 hop 7)
 *
 * THE HOP
 * Booking a load must produce the NON-POSTING proforma invoice the owner expects, by reusing
 * buildInvoiceFromLoad — never by inventing a second invoice writer and never by writing GL at book
 * time. This is the first money artifact on the walking skeleton.
 *
 * THE DEFECT THIS ASSERTS
 * The wire existed but its failure path did not. The code probed for
 * accounting.invoices.broker_advance_applied_cents and, when the column was absent, ran an EMPTY
 * `if` — no log, no error, no record — while the comment directly above it claimed "Failures are
 * loud so booking never silently skips the projection document the owner expects." The flag being
 * ON is an explicit instruction to produce that document; producing nothing and saying nothing is
 * the silent-failure class this codebase forbids. On prod today the column EXISTS, so the branch is
 * latent rather than live — which is exactly why it needs a guard: a fresh DB, a new entity, or an
 * unapplied migration would resurrect it invisibly.
 *
 * It must NOT throw: an accounting projection may never block dispatch from booking a real load.
 * The requirement is that the skip be COUNTABLE, not fatal.
 *
 * METHOD: comments and string literals are stripped before asserting, because guards of mine have
 * repeatedly passed by matching their own prose. --selftest mutates the REAL source and requires
 * every assertion to trip.
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-disp-wire-01-book-invoice";
const BOOK = "apps/backend/src/dispatch/book-load.service.ts";
const FROM_LOAD = "apps/backend/src/accounting/from-load.ts";

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
const read = (p) => stripComments(readFileSync(p, "utf8"));

/** The `else` branch attached to the column probe — where the silent skip lived. */
function columnProbeElseBranch(src) {
  const i = src.indexOf("broker_advance_applied_cents");
  if (i === -1) return "";
  const tail = src.slice(i, i + 2600);
  const e = tail.indexOf("} else {");
  return e === -1 ? "" : tail.slice(e, e + 1800);
}

function check(s) {
  const book = s[BOOK];
  const fromLoad = s[FROM_LOAD];
  const errors = [];

  if (!/import\s*\{[^}]*\bbuildInvoiceFromLoad\b[^}]*\}\s*from/.test(book)) {
    errors.push(`${BOOK}: buildInvoiceFromLoad is not imported — the book→invoice wire is gone`);
  }
  if (!/await buildInvoiceFromLoad\(/.test(book)) {
    errors.push(`${BOOK}: buildInvoiceFromLoad is never CALLED — booking produces no invoice`);
  }
  if (!/asProforma:\s*true/.test(book)) {
    errors.push(
      `${BOOK}: the book-time invoice is not asProforma:true — a posting invoice at book time would ` +
        `recognise revenue before delivery (rev-rec is the delivery latch, not booking)`
    );
  }
  if (!/INVOICE_PROFORMA_PIPELINE_ENABLED/.test(book)) {
    errors.push(`${BOOK}: the per-entity pipeline flag gate is gone — the hop is no longer entity-scoped`);
  }

  // The silent-skip fix: the probe's else branch must record something durable.
  const elseBranch = columnProbeElseBranch(book);
  if (!elseBranch) {
    errors.push(
      `${BOOK}: the broker_advance_applied_cents probe has NO else branch — when the column is ` +
        `absent the proforma is skipped silently (WIRE-01 silent-failure regression)`
    );
  } else {
    if (!/appendCrudAudit\(/.test(elseBranch)) {
      errors.push(`${BOOK}: the skip branch writes no durable audit row — the skip is not countable`);
    }
    if (!/proforma_skipped_missing_column/.test(elseBranch)) {
      errors.push(`${BOOK}: the skip branch has no canonical event_class — it cannot be queried`);
    }
    if (/\bthrow\b/.test(elseBranch)) {
      errors.push(
        `${BOOK}: the skip branch throws — an accounting projection must never block dispatch from ` +
          `booking a real load`
      );
    }
  }

  // Reuse, not reinvention: the proforma status must come from the shared builder.
  if (!/asProforma\s*\?\s*"proforma"\s*:\s*"draft"/.test(fromLoad)) {
    errors.push(`${FROM_LOAD}: buildInvoiceFromLoad no longer derives proforma vs draft status`);
  }
  if (!/INSERT INTO accounting\.invoices/.test(fromLoad)) {
    errors.push(`${FROM_LOAD}: buildInvoiceFromLoad no longer writes accounting.invoices`);
  }
  return errors;
}

function loadAll() {
  return { [BOOK]: read(BOOK), [FROM_LOAD]: read(FROM_LOAD) };
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
    ["import dropped", BOOK, (x) => x.replace(/import \{ buildInvoiceFromLoad \}[^\n]*\n/, "")],
    ["never called", BOOK, (x) => x.replace("await buildInvoiceFromLoad(", "await somethingElse(")],
    ["posting at book", BOOK, (x) => x.replace("asProforma: true", "asProforma: false")],
    ["flag gate removed", BOOK, (x) => x.split("INVOICE_PROFORMA_PIPELINE_ENABLED").join("ALWAYS_ON")],
    ["silent skip restored", BOOK, (x) => {
      const i = x.indexOf("broker_advance_applied_cents");
      const tail = x.slice(i);
      const e = tail.indexOf("} else {");
      const close = tail.indexOf("\n        }", e);
      return x.slice(0, i) + tail.slice(0, e) + "}" + tail.slice(close + 10);
    }],
    ["skip not countable", BOOK, (x) => x.split("proforma_skipped_missing_column").join("nothing_useful")],
    ["builder stops writing invoices", FROM_LOAD, (x) => x.replace("INSERT INTO accounting.invoices", "INSERT INTO accounting.other")],
  ];

  for (const [name, file, mutate] of mutations) {
    const broken = { ...real, [file]: mutate(real[file]) };
    if (broken[file] === real[file]) {
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
  console.error(`${LABEL} FAIL — ${errors.length} problem(s) on the book→invoice hop:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `${LABEL} PASS — booking creates a NON-POSTING proforma via the shared builder, entity-flag gated, ` +
    `and a missing-column skip is recorded durably instead of vanishing.`
);
