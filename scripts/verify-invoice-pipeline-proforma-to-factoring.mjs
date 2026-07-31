#!/usr/bin/env node
/**
 * ND-INV-01 — proforma → official invoice pipeline (stage 1).
 * Bites: missing proforma status, missing bookLoad create, missing send gate, missing POD convert.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-invoice-pipeline-proforma-to-factoring";
const SELFTEST = process.argv.includes("--selftest");

const MIG = path.join(ROOT, "db/migrations/202609100090_nd_inv_01_proforma_invoice_pipeline.sql");
const FROM_LOAD = path.join(ROOT, "apps/backend/src/accounting/from-load.ts");
const CONVERT = path.join(ROOT, "apps/backend/src/accounting/proforma-convert.service.ts");
const BOOK = path.join(ROOT, "apps/backend/src/dispatch/book-load.service.ts");
const LOADS = path.join(ROOT, "apps/backend/src/dispatch/loads.routes.ts");
const INVOICES = path.join(ROOT, "apps/backend/src/accounting/invoices.routes.ts");
const HELD = path.join(ROOT, "db/migrations/.held-migrations.json");

/** @param {Record<string, string>} sources */
export function check(sources) {
  const problems = [];
  const { mig, fromLoad, convert, book, loads, invoices, held } = sources;

  if (!mig) problems.push("missing migration 202609100090_nd_inv_01_proforma_invoice_pipeline.sql");
  else {
    if (!/HOLD-FOR-JORGE/.test(mig)) problems.push("migration must carry HOLD-FOR-JORGE");
    if (!/DO NOT RUN ON PROD/.test(mig)) problems.push("migration must carry DO NOT RUN ON PROD");
    if (!/'proforma'/.test(mig)) problems.push("migration must admit invoices.status=proforma");
    if (!/broker_customer_advance_liability/.test(mig)) {
      problems.push("migration must admit broker_customer_advance_liability CoA role");
    }
    if (!/INVOICE_PROFORMA_PIPELINE_ENABLED/.test(mig)) {
      problems.push("migration must seed INVOICE_PROFORMA_PIPELINE_ENABLED");
    }
  }

  if (!fromLoad) problems.push("missing from-load.ts");
  else if (!/asProforma/.test(fromLoad) || !/"proforma"/.test(fromLoad)) {
    problems.push("buildInvoiceFromLoad must support asProforma → status proforma");
  }

  if (!convert) problems.push("missing proforma-convert.service.ts");
  else if (!/convertProformaToOfficial/.test(convert) || !/status = 'draft'/.test(convert)) {
    problems.push("convertProformaToOfficial must flip proforma → draft");
  }

  if (!book) problems.push("missing book-load.service.ts");
  else if (!/asProforma:\s*true/.test(book) || !/INVOICE_PROFORMA_PIPELINE_ENABLED/.test(book)) {
    problems.push("bookLoad must create proforma when INVOICE_PROFORMA_PIPELINE_ENABLED");
  }

  if (!loads) problems.push("missing loads.routes.ts");
  else {
    if (!/convertProformaToOfficial/.test(loads) || !/delivered_pending_docs/.test(loads)) {
      problems.push("load transition to delivered_pending_docs must convert proforma");
    }
    // ACCT-R-24 / owner B2d — POD convert must auto-send via the SAME sendDraftInvoice path.
    if (!/sendDraftInvoice/.test(loads)) {
      problems.push("POD convert must call sendDraftInvoice (ACCT-R-24 auto-send; no silent draft park)");
    }
  }

  if (!invoices) problems.push("missing invoices.routes.ts");
  else if (!/sendDraftInvoice/.test(invoices) && !/invoice_is_proforma/.test(invoices)) {
    problems.push("invoice send must use sendDraftInvoice (shared path) or refuse proforma");
  } else if (!/sendDraftInvoice/.test(invoices)) {
    problems.push("invoice POST /send must call sendDraftInvoice (shared with POD auto-send)");
  }

  if (!held) problems.push("missing .held-migrations.json");
  else if (!/202609100090_nd_inv_01_proforma_invoice_pipeline\.sql/.test(held)) {
    problems.push("held registry must list 202609100090");
  }

  return problems;
}

function read(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}

function selftest() {
  const good = {
    mig: `HOLD-FOR-JORGE\nDO NOT RUN ON PROD\n'proforma'\nbroker_customer_advance_liability\nINVOICE_PROFORMA_PIPELINE_ENABLED`,
    fromLoad: `asProforma\n"proforma"`,
    convert: `convertProformaToOfficial\nstatus = 'draft'`,
    book: `asProforma: true\nINVOICE_PROFORMA_PIPELINE_ENABLED`,
    // ACCT-R-24 (#3868) added the two sendDraftInvoice requirements to check() but did not update
    // this fixture, so `good` was non-compliant and the selftest threw "compliant flagged" on every
    // push from every clone. A compliant tree carries sendDraftInvoice on BOTH the POD-convert path
    // (loads.routes.ts) and the invoice send route.
    loads: `convertProformaToOfficial\ndelivered_pending_docs\nsendDraftInvoice`,
    invoices: `invoice_is_proforma\nsendDraftInvoice`,
    held: `202609100090_nd_inv_01_proforma_invoice_pipeline.sql`,
  };
  const bad = {
    mig: `ADD COLUMN x`,
    fromLoad: `INSERT INTO accounting.invoices`,
    convert: `export async function noop`,
    book: `INSERT INTO mdata.loads`,
    loads: `UPDATE mdata.loads SET status`,
    invoices: `invoice_not_draft`,
    held: `[]`,
  };
  // A tree that is compliant EXCEPT that ACCT-R-24 auto-send was removed. `bad` above fails for
  // seven unrelated reasons, so it would still pass this selftest with the sendDraftInvoice checks
  // deleted entirely — it cannot prove those checks have teeth. This one can: it isolates the
  // single regression they exist to catch.
  const missingAutoSend = { ...good, loads: `convertProformaToOfficial\ndelivered_pending_docs`, invoices: `invoice_is_proforma` };

  const goodProblems = check(good);
  if (goodProblems.length) {
    throw new Error(`${LABEL} selftest: compliant flagged — ${goodProblems.join("; ")}`);
  }
  if (!check(bad).length) throw new Error(`${LABEL} selftest: missing pipeline not caught`);

  const autoSendProblems = check(missingAutoSend);
  if (autoSendProblems.length !== 2 || !autoSendProblems.every((p) => /sendDraftInvoice/.test(p))) {
    throw new Error(
      `${LABEL} selftest: ACCT-R-24 auto-send removal not caught — expected exactly the 2 ` +
        `sendDraftInvoice problems, got ${JSON.stringify(autoSendProblems)}`,
    );
  }
  console.log(`[${LABEL}] SELFTEST PASS`);
}

if (SELFTEST) {
  selftest();
  process.exit(0);
}

const problems = check({
  mig: read(MIG),
  fromLoad: read(FROM_LOAD),
  convert: read(CONVERT),
  book: read(BOOK),
  loads: read(LOADS),
  invoices: read(INVOICES),
  held: read(HELD),
});
if (problems.length) {
  console.error(`[${LABEL}] FAIL`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`[${LABEL}] PASS`);
