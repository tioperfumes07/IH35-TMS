#!/usr/bin/env node
/**
 * ACCT-F61 — the invoice send path must consult delivery evidence, using the SAME lookup the revenue
 * latch uses, and must not grow its own copy of the rule.
 *
 * WHY THIS EXISTS (verified on prod br-fancy-credit-akjnd07a + origin/main, 2026-08-01):
 * invoice-send.service.ts's own header calls itself the "POD auto-send" path and its proforma
 * refusal reads "Convert at POD (delivered) before send/A/R." In the code, POD meant only that
 * mdata.loads.status had reached delivered_pending_docs — a status three backend paths set by
 * validating a status graph without ever reading mdata.load_stops. Stated intent: bill at proof of
 * delivery. Enforced reality: bill when someone clicked a status.
 *
 * That gap sends a customer-facing document. IH35 factors receivables with Faro on a RECOURSE basis,
 * where the factor funds against the invoice plus a signed POD, so an invoice with no delivery
 * evidence behind it is precisely what returns as a chargeback. Live state at the time:
 * INVOICE_PROFORMA_PIPELINE_ENABLED = true for TRANSP and USMCA (the office transition auto-converts
 * AND auto-sends at delivered_pending_docs) while all 20 rows in mdata.load_stops carried 0
 * actual_departure_at. The GL half already refused (#3955); this half did not — so the customer
 * could be invoiced for a delivery the ledger correctly declined to recognize.
 *
 * WHAT WOULD SILENTLY REGRESS THIS:
 *  1. Deleting the gate so a test that expects a send goes green.
 *  2. Re-implementing the stop lookup locally instead of importing it. Two definitions of "final
 *     active delivery stop" drift, and this repo has already shipped a state machine in three copies.
 *     This guard fails if the send path grows its own mdata.load_stops query.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SEND = "apps/backend/src/accounting/invoice-send.service.ts";
const LABEL = "verify-invoice-send-delivery-evidence-gate";

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

export function auditSend(src) {
  const problems = [];
  const code = stripComments(src);

  if (!/finalActiveDeliveryDepartureAt/.test(code)) {
    problems.push(
      `${SEND} never consults delivery evidence — it sends a customer invoice on load STATUS alone, ` +
        `which three backend paths can set without reading a stop row.`
    );
    return problems;
  }
  if (!/import\s*\{[^}]*finalActiveDeliveryDepartureAt[^}]*\}\s*from/.test(code)) {
    problems.push(
      `${SEND} does not IMPORT finalActiveDeliveryDepartureAt — the evidence rule must have one ` +
        `definition shared with the revenue latch, not a private re-implementation.`
    );
  }
  if (/mdata\.load_stops/.test(code)) {
    problems.push(
      `${SEND} contains its own mdata.load_stops query. "Final active delivery stop" must mean ONE ` +
        `thing; a second copy drifts from the latch's definition.`
    );
  }
  if (!/source_load_id/.test(code)) {
    problems.push(`${SEND} does not gate the evidence check on source_load_id — only load-sourced invoices carry a delivery.`);
  }
  if (!/delivery_evidence_missing/.test(code)) {
    problems.push(`${SEND} has no delivery_evidence_missing refusal — the block must be a named, visible outcome.`);
  }
  if (!/INVOICE_SEND_REQUIRES_DELIVERY_EVIDENCE/.test(code)) {
    problems.push(`${SEND} does not consult INVOICE_SEND_REQUIRES_DELIVERY_EVIDENCE — enforcement must stay per-entity and default OFF.`);
  }
  // While OFF it must still record the exposure, or nobody can measure it before flipping.
  if (!/acct_f61_invoice_sent_without_delivery_evidence/.test(code)) {
    problems.push(
      `${SEND} does not warn when it sends without evidence and the flag is OFF. A gate that is ` +
        `silent while disabled hides the exposure it exists to measure.`
    );
  }
  return problems;
}

function auditTree() {
  return auditSend(readFileSync(join(ROOT, SEND), "utf8"));
}

function selftest() {
  const failures = [];

  const preFix = `
    export async function sendDraftInvoice(client, input) {
      if (String(current.status) !== "draft") return { ok: false, code: 409, error: "invoice_not_draft" };
      await recomputeInvoiceTotals(client, input.invoiceId);
    }
  `;
  if (auditSend(preFix).length === 0) failures.push("case1 FAIL — a send path with NO evidence check was not caught");

  const localCopy = `
    import { isEnabled } from "../lib/feature-flags/service.js";
    async function finalActiveDeliveryDepartureAt(client, opco, loadId) {
      return client.query("SELECT actual_departure_at FROM mdata.load_stops WHERE load_id = $1 ORDER BY sequence_number DESC LIMIT 1");
    }
    export async function sendDraftInvoice(client, input) {
      if (current.source_load_id && !(await finalActiveDeliveryDepartureAt(client, input.operatingCompanyId, current.source_load_id))) {
        const on = await isEnabled(client, "INVOICE_SEND_REQUIRES_DELIVERY_EVIDENCE", {});
        if (on) return { ok: false, code: 409, error: "delivery_evidence_missing" };
        console.warn("acct_f61_invoice_sent_without_delivery_evidence");
      }
    }
  `;
  const localProblems = auditSend(localCopy);
  if (!localProblems.some((p) => p.includes("does not IMPORT")))
    failures.push("case2 FAIL — a privately re-implemented lookup was not caught");
  if (!localProblems.some((p) => p.includes("its own mdata.load_stops query")))
    failures.push("case3 FAIL — a second load_stops query was not caught");

  const silentWhenOff = `
    import { finalActiveDeliveryDepartureAt } from "./revrec-delivery-posting/poster.service.js";
    import { isEnabled } from "../lib/feature-flags/service.js";
    export async function sendDraftInvoice(client, input) {
      if (current.source_load_id && !(await finalActiveDeliveryDepartureAt(client, o, l))) {
        if (await isEnabled(client, "INVOICE_SEND_REQUIRES_DELIVERY_EVIDENCE", {})) {
          return { ok: false, code: 409, error: "delivery_evidence_missing" };
        }
      }
    }
  `;
  if (!auditSend(silentWhenOff).some((p) => p.includes("silent while disabled")))
    failures.push("case4 FAIL — a gate that is silent while OFF was not caught");

  const tree = auditTree();
  if (tree.length !== 0) failures.push(`case5 FAIL — real source flagged: ${tree.join(" | ")}`);

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(
    `${LABEL}: selftest PASS — missing gate caught, private re-implementation caught, duplicate ` +
      `load_stops query caught, silent-while-OFF caught, real source clean`
  );
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} OK — the invoice send path consults the shared delivery-evidence lookup, refuses with ` +
      `delivery_evidence_missing when enforcement is on, and records the exposure while it is off`
  );
}

main();
