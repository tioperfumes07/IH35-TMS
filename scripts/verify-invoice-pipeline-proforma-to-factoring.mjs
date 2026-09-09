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
// Proforma minting moved OFF book-load onto the first-pickup trigger (owner: mint the proforma when
// the load is first picked up, not at book). This is where asProforma:true + the pipeline flag now
// live — the old book-load.service.ts check was stale (red on main after the move).
const MINT = path.join(ROOT, "apps/backend/src/accounting/proforma-mint-on-first-pickup.ts");
const LOADS = path.join(ROOT, "apps/backend/src/dispatch/loads.routes.ts");
// ACCT-F351 moved the convertProformaToOfficial -> sendDraftInvoice call pair OUT of loads.routes.ts
// (which still triggers the delivered_pending_docs transition and now just calls
// latchOnDeliveryEvidence) and INTO this dedicated latch module — see loads.routes.ts's own inline
// comment at the call site. The pipeline is one coupled unit across both files; check() below reads
// them concatenated so the requirement still holds without demanding they live in one file.
const LATCH = path.join(ROOT, "apps/backend/src/dispatch/delivery-evidence-latch.ts");
const INVOICES = path.join(ROOT, "apps/backend/src/accounting/invoices.routes.ts");
const HELD = path.join(ROOT, "db/migrations/.held-migrations.json");
// FACT-DELIVERED-AUTO (owner 2026-09-09) — stage 2 of the pipeline: a delivered load whose invoice is
// sent and whose customer is factor-assigned auto-creates the factoring "purchase" (submitted advance).
const AUTO_SUBMIT = path.join(ROOT, "apps/backend/src/factoring/auto-submit-on-delivery.service.ts");

/** @param {Record<string, string>} sources */
export function check(sources) {
  const problems = [];
  const { mig, fromLoad, convert, mint, loads, invoices, held, autoSubmit } = sources;

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

  if (!mint) problems.push("missing proforma-mint-on-first-pickup.ts");
  else if (!/asProforma:\s*true/.test(mint) || !/INVOICE_PROFORMA_PIPELINE_ENABLED/.test(mint)) {
    problems.push("first-pickup mint must create proforma (asProforma:true) when INVOICE_PROFORMA_PIPELINE_ENABLED");
  }

  // `loads` here is loads.routes.ts + delivery-evidence-latch.ts concatenated (see LATCH comment
  // above) — ACCT-F351 split the transition trigger from the convert+send call pair across the
  // two files, so the checks below hold for the coupled pipeline, not a single file.
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

  // FACT-DELIVERED-AUTO — stage 2: delivery must ALSO auto-submit the sent invoice to the factor as a
  // submitted purchase, and it must do so WITHOUT posting a funding JE (funding posts later at real
  // Faro funding). `loads` here includes the delivery latch (see LATCH concat below).
  if (!/factoring-auto-submit/.test(loads) || !/autoSubmitDeliveredLoadToFactor/.test(loads)) {
    problems.push(
      "delivery latch must enqueue the factoring auto-submit (autoSubmitDeliveredLoadToFactor) so a " +
        "delivered, sent, factor-assigned invoice auto-creates its purchase (FACT-DELIVERED-AUTO)"
    );
  }
  if (!autoSubmit) {
    problems.push("missing factoring/auto-submit-on-delivery.service.ts");
  } else {
    if (!/'submitted'/.test(autoSubmit)) {
      problems.push("auto-submit service must create the advance in status 'submitted' (a purchase, not funded)");
    }
    // The correct method: NO funding JE at delivery. The GL poster is a funding-time call only.
    if (/postFactoringAdvanceEvent\s*\(/.test(autoSubmit)) {
      problems.push(
        "auto-submit service must NOT call postFactoringAdvanceEvent — funding posts at ACTUAL Faro " +
          "funding, never speculatively on delivery (would book cash Faro has not wired)"
      );
    }
    // Idempotency — a re-fired delivery / retry / prior manual submit must be a clean no-op.
    if (!/invoice_already_factored/.test(autoSubmit) || !/invoice_not_sent/.test(autoSubmit)) {
      problems.push("auto-submit service must gate on invoice_not_sent + invoice_already_factored (idempotent no-op)");
    }
    // Reuse, never re-derive: shared amount split + shared factor/vendor resolvers.
    if (!/computeFactoringSubmitAmounts/.test(autoSubmit)) {
      problems.push("auto-submit service must compute amounts via computeFactoringSubmitAmounts (independent reserve/fee split)");
    }
    if (!/resolveCanonicalActiveFactor/.test(autoSubmit) || !/getFactorForCustomer/.test(autoSubmit)) {
      problems.push(
        "auto-submit service must resolve the Faro vendor via resolveCanonicalActiveFactor and rates via " +
          "getFactorForCustomer — never a hardcoded vendor id or rate"
      );
    }
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
    mint: `asProforma: true\nINVOICE_PROFORMA_PIPELINE_ENABLED`,
    // ACCT-R-24 (#3868) added the two sendDraftInvoice requirements to check() but did not update
    // this fixture, so `good` was non-compliant and the selftest threw "compliant flagged" on every
    // push from every clone. A compliant tree carries sendDraftInvoice on BOTH the POD-convert path
    // (loads.routes.ts) and the invoice send route.
    loads: `convertProformaToOfficial\ndelivered_pending_docs\nsendDraftInvoice\nfactoring-auto-submit\nautoSubmitDeliveredLoadToFactor`,
    invoices: `invoice_is_proforma\nsendDraftInvoice`,
    held: `202609100090_nd_inv_01_proforma_invoice_pipeline.sql`,
    autoSubmit: `'submitted'\ninvoice_not_sent\ninvoice_already_factored\ncomputeFactoringSubmitAmounts\nresolveCanonicalActiveFactor\ngetFactorForCustomer`,
  };
  const bad = {
    mig: `ADD COLUMN x`,
    fromLoad: `INSERT INTO accounting.invoices`,
    convert: `export async function noop`,
    mint: `INSERT INTO mdata.loads`,
    loads: `UPDATE mdata.loads SET status`,
    invoices: `invoice_not_draft`,
    held: `[]`,
    autoSubmit: ``,
  };
  // A tree that is compliant EXCEPT that ACCT-R-24 auto-send was removed. `bad` above fails for
  // seven unrelated reasons, so it would still pass this selftest with the sendDraftInvoice checks
  // deleted entirely — it cannot prove those checks have teeth. This one can: it isolates the
  // single regression they exist to catch.
  // Drop only sendDraftInvoice, keep the factoring-auto-submit wiring, so exactly the 2 auto-send
  // problems fire (not the new FACT-DELIVERED-AUTO ones).
  const missingAutoSend = {
    ...good,
    loads: `convertProformaToOfficial\ndelivered_pending_docs\nfactoring-auto-submit\nautoSubmitDeliveredLoadToFactor`,
    invoices: `invoice_is_proforma`,
  };

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

  // FACT-DELIVERED-AUTO regressions — each must be caught in isolation.
  // (a) delivery latch stops enqueuing the factoring auto-submit.
  const noLatchFactoring = { ...good, loads: `convertProformaToOfficial\ndelivered_pending_docs\nsendDraftInvoice` };
  if (!check(noLatchFactoring).some((p) => /autoSubmitDeliveredLoadToFactor/.test(p))) {
    throw new Error(`${LABEL} selftest: dropping the factoring auto-submit enqueue was not caught`);
  }
  // (b) auto-submit service posts a funding JE at delivery (books cash Faro has not wired).
  const fundsAtDelivery = { ...good, autoSubmit: good.autoSubmit + `\npostFactoringAdvanceEvent(` };
  if (!check(fundsAtDelivery).some((p) => /postFactoringAdvanceEvent/.test(p))) {
    throw new Error(`${LABEL} selftest: a funding JE posted at delivery was not caught`);
  }
  // (c) auto-submit service loses its idempotency gate.
  const notIdempotent = { ...good, autoSubmit: `'submitted'\ncomputeFactoringSubmitAmounts\nresolveCanonicalActiveFactor\ngetFactorForCustomer` };
  if (!check(notIdempotent).some((p) => /idempotent/.test(p))) {
    throw new Error(`${LABEL} selftest: a non-idempotent auto-submit was not caught`);
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
  mint: read(MINT),
  loads: read(LOADS) + "\n" + read(LATCH),
  invoices: read(INVOICES),
  held: read(HELD),
  autoSubmit: read(AUTO_SUBMIT),
});
if (problems.length) {
  console.error(`[${LABEL}] FAIL`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`[${LABEL}] PASS`);
