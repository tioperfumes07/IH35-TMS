/**
 * CLS-DISP-WIRE-07 — every path that moves a load INTO a delivery-evidence status must fire the
 * two-event revenue latch, not just the office one.
 *
 * THE DEFECT THIS EXISTS FOR: `PATCH /api/v1/dispatch/loads/:id/transition` (office) calls
 * postLoadRevenueLatch() when the target status is `delivered_pending_docs` /
 * `completed_docs_received`. The two DRIVER capture paths set that SAME status with a bare
 * `UPDATE mdata.loads SET status = $2` and never latched. So the only party who actually performs a
 * delivery — the driver, in the PWA — could not trigger revenue recognition, and hops 4→9
 * (deliver → revenue → invoice → GL → bank) could not flow from real field activity. Delivery
 * evidence existed in `mdata.load_stops` while the ledger never heard about it.
 *
 * ONE HELPER, NOT THREE COPIES (§9.0.17): the trigger condition and the swallow-and-log policy live
 * here once. A fourth delivery path added later calls this and is correct by construction; the guard
 * `verify-delivery-evidence-latch-wired` fails if it forgets.
 *
 * SWALLOW-AND-LOG IS DELIBERATE, and matches the office path exactly: a latch failure must never
 * 500 the driver's "I departed the delivery" tap. Losing the stop capture is worse than deferring
 * recognition, which the twice-daily reconcile and the scenario tracker both surface.
 *
 * ★ AFTER-COMMIT (LV-REVREC-NOT-FIRING, live-proven on prod 2026-08-07 — the reason this helper now
 * takes the transaction client). Every caller invokes this from INSIDE an open `withCurrentUser()`
 * transaction, immediately after stamping the delivery departure — which reads correctly and was
 * wrong. `postLoadRevenueLatch` opens its OWN connection through `withLuciaBypass`, and under READ
 * COMMITTED that second connection cannot see the caller's uncommitted stamp. The poster's evidence
 * gate re-read `actual_departure_at`, found NULL, returned `missing_delivery_evidence` and posted
 * NOTHING — a gate is a return value, not a throw, so even the deliberate swallow-and-log above
 * never fired. Then the caller committed, the row appeared, and nothing retried. Every path was
 * dark and every static guard was green.
 *
 * The fix is ordering, and it lives HERE rather than in five route files: the latch is enqueued on
 * the transaction's after-commit queue (lib/after-commit.ts) and runs once the write it depends on
 * is durable. Callers keep the call where it belongs in the code. A caller outside a managed
 * transaction (none today) still fires inline, because there is nothing to wait for — never dropped.
 */
import { postLoadRevenueLatch } from "../accounting/revrec-delivery-posting/poster.service.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
import { enqueueAfterCommit } from "../lib/after-commit.js";
import { convertProformaToOfficial } from "../accounting/proforma-convert.service.js";
import { sendDraftInvoice } from "../accounting/invoice-send.service.js";
import { isEnabled } from "../lib/feature-flags/service.js";
// SYS-F5509 — moved to its own leaf module so accounting/posting-engine.service.ts can depend on the
// status definition without depending on this whole latch module (which itself depends on
// accounting/invoice-send.service.ts) — that indirect path was the import cycle. Re-imported here so
// this file's own call site below keeps working unchanged.
import { isDeliveryEvidenceStatus } from "./delivery-evidence-status.js";

/**
 * The caller's transaction client. Used as the after-commit queue key AND (ACCT-F351) to run the
 * proforma conversion + send on the caller's own transaction. Typed structurally so a caller outside a
 * managed transaction, or a test double without `query`, still works — the invoice half is skipped
 * rather than crashing a delivery capture.
 */
type QueryableClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};
export type LatchClient = object | QueryableClient;

export type DeliveryEvidenceLatchInput = {
  operatingCompanyId: string;
  loadId: string;
  targetStatus: string;
  actorUserId: string;
  /** Defaults to the COMPANY business date (America/Chicago), never UTC. */
  entryDateIso?: string;
};

async function firePostLoadRevenueLatch(input: DeliveryEvidenceLatchInput): Promise<void> {
  try {
    await postLoadRevenueLatch({
      operating_company_id: input.operatingCompanyId,
      load_id: input.loadId,
      target_status: input.targetStatus,
      // Resolved at FIRE time, not enqueue time: the business date the entry belongs to is the date
      // the write became durable.
      entry_date_iso: input.entryDateIso ?? companyBusinessDate(),
      actor_user_id: input.actorUserId,
    });
  } catch (err) {
    console.warn(
      { err, load_id: input.loadId, target_status: input.targetStatus },
      "disp_wire_07_revrec_latch_failed"
    );
  }
}

/**
 * ACCT-F351 — REVENUE AND THE RECEIVABLE MUST BE WIRED TO THE SAME EVENT.
 *
 * The revenue latch was extracted into this helper precisely because five delivery paths existed and
 * only one of them recognized revenue. The INVOICE half was never given the same treatment: the
 * proforma -> draft conversion + auto-send lived INLINE in `dispatch/loads.routes.ts` and had exactly
 * ONE caller, while `latchOnDeliveryEvidence` had five. So on the four other paths — including BOTH
 * driver-PWA capture paths, which is where a delivery is actually performed — the load reached a
 * delivery-evidence status, revenue was recognized, and the customer invoice was never converted and
 * never sent. Freight the books had already earned had no receivable to collect against.
 *
 * That is the CLS-DISP-WIRE-07 defect exactly, one layer up, and the same rule fixes it: ONE HELPER,
 * NOT FIVE COPIES. Coupling the two into a single call is deliberate — recognizing revenue and
 * raising the receivable are two halves of one event, and anything that can drift will.
 *
 * Runs INLINE on the caller's transaction (unlike the latch, which must wait for COMMIT): the
 * conversion is a plain UPDATE on rows the caller already owns, and the office path has always done
 * it this way. Swallow-and-log matches the latch: a failure here must never 500 a driver's
 * "I delivered" tap — losing the delivery capture is worse than deferring the invoice.
 */
async function convertAndSendInvoiceOnDelivery(
  client: LatchClient,
  input: DeliveryEvidenceLatchInput
): Promise<void> {
  if (typeof (client as QueryableClient).query !== "function") return;
  const db = client as QueryableClient;
  // SAVEPOINT: a SQL failure inside convert/send aborts the Postgres txn (25P02). JS try/catch
  // alone cannot un-poison it — later spine SQL on the same client then 500s the load transition
  // (L-20260808-0099). Isolate invoice work so delivery status can still commit.
  await db.query("SAVEPOINT delivery_invoice_convert_send");
  try {
    const pipelineOn = await isEnabled(db as never, "INVOICE_PROFORMA_PIPELINE_ENABLED", {
      operating_company_id: input.operatingCompanyId,
      user_uuid: input.actorUserId,
    });
    if (!pipelineOn) {
      await db.query("RELEASE SAVEPOINT delivery_invoice_convert_send");
      return;
    }

    const converted = await convertProformaToOfficial(db as never, {
      operatingCompanyId: input.operatingCompanyId,
      loadId: input.loadId,
      userId: input.actorUserId,
    });
    if (!converted.converted || !converted.invoiceId) {
      await db.query("RELEASE SAVEPOINT delivery_invoice_convert_send");
      return;
    }

    const sent = await sendDraftInvoice(db as never, {
      invoiceId: converted.invoiceId,
      operatingCompanyId: input.operatingCompanyId,
      userId: input.actorUserId,
    });
    if (!sent.ok) {
      console.warn(
        { load_id: input.loadId, invoice_id: converted.invoiceId, error: sent.error },
        "acct_f351_auto_send_after_delivery_failed"
      );
    }
    await db.query("RELEASE SAVEPOINT delivery_invoice_convert_send");
  } catch (err) {
    try {
      await db.query("ROLLBACK TO SAVEPOINT delivery_invoice_convert_send");
    } catch {
      /* nested rollback already failed — outer still swallows */
    }
    console.warn({ err, load_id: input.loadId }, "acct_f351_proforma_convert_failed");
  }
}

/**
 * Fire the revenue latch for a load that just reached a delivery-evidence status, and raise the
 * receivable for the same event (ACCT-F351).
 * No-op for any other status. Never throws — see the swallow-and-log note above.
 *
 * @param client the transaction client the caller is writing on. Used ONLY as the after-commit
 *        queue key — this helper issues no SQL on it. Required, not optional: an optional client
 *        would make the pre-commit ordering bug re-introducible by omission, which is exactly how
 *        it got here.
 * @returns "deferred" when queued to run after the caller's COMMIT (the normal path),
 *          "fired" when run inline because the client is not inside a managed transaction,
 *          "skipped" when the status is not delivery evidence.
 */
export async function latchOnDeliveryEvidence(
  client: LatchClient,
  input: DeliveryEvidenceLatchInput
): Promise<"deferred" | "fired" | "skipped"> {
  if (!isDeliveryEvidenceStatus(input.targetStatus)) return "skipped";
  // ACCT-F351 — raise the receivable in the caller's transaction, BEFORE queueing the revenue latch,
  // so no delivery path can recognize revenue without also invoicing the customer.
  await convertAndSendInvoiceOnDelivery(client, input);
  const queued = enqueueAfterCommit(client, {
    label: `revrec-latch:${input.loadId}:${input.targetStatus}`,
    run: () => firePostLoadRevenueLatch(input),
  });
  if (queued) return "deferred";
  await firePostLoadRevenueLatch(input);
  return "fired";
}
