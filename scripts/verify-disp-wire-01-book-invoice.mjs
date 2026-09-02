#!/usr/bin/env node
/**
 * GUARD — verify-disp-wire-01-book-invoice (GO-19 slice 04)
 *
 * THE HOP (updated 2026-09-02)
 * Booking must NOT mint a proforma. First pickup stop completion mints the NON-POSTING proforma
 * via buildInvoiceFromLoad(asProforma:true), entity-flag gated. Delivery conversion is a different
 * helper and must not be rewritten here.
 *
 * THE DEFECT THIS ASSERTS
 * book-load.service.ts used to mint at book (ND-INV-01), burning numbers for loads never picked up.
 * The mint now lives in accounting/proforma-mint-on-first-pickup.ts and every pickup-evidence path
 * must call it. Missing-column skip remains COUNTABLE (WIRE-01). Booking must not call
 * buildInvoiceFromLoad at all (so a zero-rate invoice refusal cannot roll back a book).
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-disp-wire-01-book-invoice";
const BOOK = "apps/backend/src/dispatch/book-load.service.ts";
const MINT = "apps/backend/src/accounting/proforma-mint-on-first-pickup.ts";
const FROM_LOAD = "apps/backend/src/accounting/from-load.ts";
const CALLERS = [
  "apps/backend/src/mdata/loads.routes.ts",
  "apps/backend/src/dispatch/driver-pwa/dispatch-view.routes.ts",
  "apps/backend/src/driver/loads.routes.ts",
  "apps/backend/src/telematics/geofence-detector.service.ts",
];

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
const read = (p) => stripComments(readFileSync(p, "utf8"));

function columnProbeElseBranch(src) {
  const i = src.indexOf("broker_advance_applied_cents");
  if (i === -1) return "";
  const tail = src.slice(i, i + 2600);
  const e = tail.indexOf("if (!Boolean(col.rows[0]?.ok))");
  return e === -1 ? "" : tail.slice(e, e + 1800);
}

function check(s) {
  const book = s[BOOK];
  const mint = s[MINT];
  const fromLoad = s[FROM_LOAD];
  const errors = [];

  if (/await buildInvoiceFromLoad\(/.test(book)) {
    errors.push(`${BOOK}: still calls buildInvoiceFromLoad — proforma must not mint at book (GO-19-04)`);
  }
  if (!/mintProformaInvoiceOnFirstPickup/.test(mint) && !/export async function mintProformaInvoiceOnFirstPickup/.test(readFileSync(MINT, "utf8"))) {
    errors.push(`${MINT}: mintProformaInvoiceOnFirstPickup export is gone`);
  }
  if (!/import\s*\{[^}]*\bbuildInvoiceFromLoad\b[^}]*\}\s*from/.test(mint)) {
    errors.push(`${MINT}: buildInvoiceFromLoad is not imported — pickup mint reinvented a writer`);
  }
  if (!/await buildInvoiceFromLoad\(/.test(mint)) {
    errors.push(`${MINT}: buildInvoiceFromLoad is never CALLED — pickup produces no invoice`);
  }
  if (!/asProforma:\s*true/.test(mint)) {
    errors.push(`${MINT}: pickup invoice is not asProforma:true`);
  }
  if (!/INVOICE_PROFORMA_PIPELINE_ENABLED/.test(mint)) {
    errors.push(`${MINT}: pipeline flag gate is gone`);
  }

  const elseBranch = columnProbeElseBranch(mint);
  if (!elseBranch) {
    errors.push(`${MINT}: broker_advance_applied_cents missing-column skip is gone`);
  } else {
    if (!/appendCrudAudit\(/.test(elseBranch)) {
      errors.push(`${MINT}: the skip branch writes no durable audit row`);
    }
    if (!/proforma_skipped_missing_column/.test(elseBranch)) {
      errors.push(`${MINT}: the skip branch has no canonical event_class`);
    }
  }

  if (!/asProforma\s*\?\s*"proforma"\s*:\s*"draft"/.test(fromLoad)) {
    errors.push(`${FROM_LOAD}: buildInvoiceFromLoad no longer derives proforma vs draft status`);
  }
  if (!/INSERT INTO accounting\.invoices/.test(fromLoad)) {
    errors.push(`${FROM_LOAD}: buildInvoiceFromLoad no longer writes accounting.invoices`);
  }

  for (const caller of CALLERS) {
    if (!/mintProformaInvoiceOnFirstPickup\(/.test(s[caller])) {
      errors.push(`${caller}: does not call mintProformaInvoiceOnFirstPickup — a pickup path can skip the mint`);
    }
  }
  return errors;
}

function loadAll() {
  const files = { [BOOK]: read(BOOK), [MINT]: read(MINT), [FROM_LOAD]: read(FROM_LOAD) };
  for (const c of CALLERS) files[c] = read(c);
  return files;
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
    ["book mints again", BOOK, (x) => x.replace("const load = loadRes.rows[0]", "await buildInvoiceFromLoad(client, { asProforma: true });\n    const load = loadRes.rows[0]")],
    ["never called", MINT, (x) => x.replace("await buildInvoiceFromLoad(", "await somethingElse(")],
    ["posting at pickup", MINT, (x) => x.replace("asProforma: true", "asProforma: false")],
    ["flag gate removed", MINT, (x) => x.split("INVOICE_PROFORMA_PIPELINE_ENABLED").join("ALWAYS_ON")],
    ["skip not countable", MINT, (x) => x.split("proforma_skipped_missing_column").join("nothing_useful")],
    ["builder stops writing invoices", FROM_LOAD, (x) => x.replace("INSERT INTO accounting.invoices", "INSERT INTO accounting.other")],
    ["office path unwired", CALLERS[0], (x) => x.replaceAll("mintProformaInvoiceOnFirstPickup(", "notTheMint(")],
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
  console.error(`${LABEL} FAIL — ${errors.length} problem(s) on the pickup→invoice hop:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `${LABEL} PASS — booking does not mint; first pickup mints a NON-POSTING proforma via the shared builder, entity-flag gated, ` +
    `and a missing-column skip is recorded durably.`
);
