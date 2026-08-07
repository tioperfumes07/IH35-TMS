import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { buildPatchChanges } from "../audit/crud-audit.js";
import { appendBulkCrudAudit, registerBulkRoute } from "../bulk/bulk-update.factory.js";
import type { BulkPerEntityContext, BulkPerEntityResult } from "../bulk/bulk.types.js";
import {
  type DispatchStatus,
  dispatchStatusSchema,
  fromMdataStatus,
  toMdataStatus,
  validateLoadStatusTransition,
} from "./load-state-machine.js";
import { emitDispatchSpineEvent } from "./dispatch-spine-emit.js";
import {
  loadStatusRequiresDeliveryDepartureStamp,
  stampFinalActiveDeliveryDeparture,
} from "./stamp-final-delivery-departure.js";
import { applyLoadStatusMoneyEffects } from "../accounting/load-status-money-effects.service.js";

// Transitions that fire escrow-proposal + settlement side-effects on the per-load endpoint
// (PATCH /dispatch/loads/:id/status). Bulk set_status does NOT run those financial hooks, so moving a
// load into one of these states in bulk would silently skip the escrow proposal and the settlement ping.
// Route them to the per-load action instead of losing the side-effects. (financial hooks are Jorge-gated)
const PER_LOAD_ONLY_TRANSITIONS = new Set<DispatchStatus>(["abandoned", "driver_walkoff", "driver_no_show"]);

const setStatusPayloadSchema = z.object({
  transition: dispatchStatusSchema,
  /** Optional office-attested delivery time; COALESCE(now()) when omitted (WIRE-07). */
  delivered_at: z.string().datetime({ offset: true }).optional(),
});

const markFactoredPayloadSchema = z.object({
  factor_id: z.string().uuid(),
});

const markPaidPayloadSchema = z.object({});

type LoadBulkPayload =
  | z.infer<typeof setStatusPayloadSchema>
  | z.infer<typeof markFactoredPayloadSchema>
  | z.infer<typeof markPaidPayloadSchema>;

const PAID_ELIGIBLE_MDATA_STATUSES = new Set(["invoiced", "completed_docs_received", "delivered_pending_docs", "paid"]);

async function handleLoadBulk(ctx: BulkPerEntityContext<LoadBulkPayload>): Promise<BulkPerEntityResult> {
  const { id, action, payload, reason, operatingCompanyId, actorUserId, bulkCallId, client } = ctx;

  const oldRes = await client.query(
    `
      SELECT *
      FROM mdata.loads
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
        AND soft_deleted_at IS NULL
      LIMIT 1
    `,
    [id, operatingCompanyId]
  );
  const oldRow = oldRes.rows[0] as Record<string, unknown> | undefined;
  if (!oldRow) {
    return { ok: false, code: "E_NOT_FOUND", message: "Load not found" };
  }

  const auditPayload: Record<string, unknown> = {
    resource_id: id,
    resource_type: "mdata.loads",
    operating_company_id: operatingCompanyId,
    reason: reason ?? null,
  };

  if (action === "set_status") {
    const statusPayload = payload as z.infer<typeof setStatusPayloadSchema>;
    if (PER_LOAD_ONLY_TRANSITIONS.has(statusPayload.transition)) {
      return {
        ok: false,
        code: "E_REQUIRES_PER_LOAD",
        message: `Transition to ${statusPayload.transition} runs escrow/settlement side-effects and must use the per-load status action`,
      };
    }
    const validation = validateLoadStatusTransition(String(oldRow.status), statusPayload.transition);
    if (!validation.ok) {
      return {
        ok: false,
        code: "E_STATE_INVALID",
        message: `Invalid transition from ${validation.from} to ${validation.to}`,
      };
    }

    const mdataStatus = toMdataStatus(statusPayload.transition);
    const updateRes = await client.query(
      `
        UPDATE mdata.loads
        SET status = $3::mdata.load_status_enum,
            updated_at = now()
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        RETURNING *
      `,
      [id, operatingCompanyId, mdataStatus]
    );
    if (updateRes.rows.length === 0) {
      return { ok: false, code: "E_UPDATE_FAILED", message: "Load status update failed" };
    }
    // CLS-DISP-WIRE-07 — office bulk "Mark delivered" must stamp final delivery departure
    // (same as PATCH /dispatch/loads/:id/transition). COALESCE(now()) when client omits delivered_at.
    if (loadStatusRequiresDeliveryDepartureStamp(mdataStatus)) {
      await stampFinalActiveDeliveryDeparture(client, id, statusPayload.delivered_at ?? null);
    }

    // ACCT-F170 / LV-TXN-004 — bulk status change must carry the SAME money side-effects as the
    // per-load endpoints. PER_LOAD_ONLY_TRANSITIONS above already forces abandoned/driver_walkoff/
    // driver_no_show to the per-load route precisely BECAUSE they have financial hooks — but it does
    // not cover delivered_pending_docs / completed_docs_received (the revenue-latch statuses) or
    // in_transit (a settlement-ping status). So a dispatcher could bulk-move loads straight through
    // the two states that MATTER to the ledger and silently skip both. Rather than widen the block
    // list and make bulk less useful, bulk now runs the same shared effects the per-load paths run.
    await applyLoadStatusMoneyEffects({
      // Same narrowing the sibling emitDispatchSpineEvent call uses below: this route's client is
      // typed with an untyped-row query signature, so it is cast to the shared service's DbClient.
      client: client as unknown as Parameters<typeof applyLoadStatusMoneyEffects>[0]["client"],
      operatingCompanyId,
      loadId: id,
      targetStatus: String(mdataStatus),
      actorUserId,
    });
    // Parity with the per-load endpoint: a bulk status change must land on the dispatch event spine so
    // downstream workflow consumers (timeline, notifications) see it. (Non-financial event-bus write.)
    await emitDispatchSpineEvent(client as unknown as Parameters<typeof emitDispatchSpineEvent>[0], {
      operating_company_id: operatingCompanyId,
      actor_user_id: actorUserId,
      event_type: "load.status_changed",
      load_id: id,
      payload: {
        from_status: fromMdataStatus(String(oldRow.status)),
        to_status: statusPayload.transition,
        source: "bulk",
      },
    });
    auditPayload.changes = buildPatchChanges(
      { status: mdataStatus, transition: statusPayload.transition },
      oldRow,
      updateRes.rows[0] as Record<string, unknown>
    );
  } else if (action === "mark_factored") {
    const factoredPayload = payload as z.infer<typeof markFactoredPayloadSchema>;
    const factorRes = await client.query(
      `
        SELECT id::text
        FROM mdata.vendors
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        LIMIT 1
      `,
      [factoredPayload.factor_id, operatingCompanyId]
    );
    if (!factorRes.rows[0]) {
      return { ok: false, code: "E_FACTOR_INVALID", message: "Factoring vendor not found" };
    }

    const invoiceRes = await client.query(
      `
        SELECT id::text, factoring_status, status
        FROM accounting.invoices
        WHERE source_load_id = $1::uuid
          AND operating_company_id = $2::uuid
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [id, operatingCompanyId]
    );
    const invoice = invoiceRes.rows[0] as { id: string; factoring_status: string | null; status: string } | undefined;
    if (!invoice) {
      return { ok: false, code: "E_NOT_FOUND", message: "No invoice linked to load" };
    }
    if (String(invoice.factoring_status ?? "not_factored") !== "not_factored") {
      return { ok: false, code: "E_ALREADY_FACTORED", message: "Load invoice is already factored" };
    }

    const updateRes = await client.query(
      `
        UPDATE accounting.invoices
        SET factoring_status = 'submitted',
            updated_at = now(),
            updated_by_user_id = $3
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        RETURNING *
      `,
      [invoice.id, operatingCompanyId, actorUserId]
    );
    auditPayload.changes = buildPatchChanges(
      { factoring_status: "submitted", factor_id: factoredPayload.factor_id, invoice_id: invoice.id },
      oldRow,
      updateRes.rows[0] as Record<string, unknown>
    );
  } else if (action === "mark_paid") {
    const currentStatus = String(oldRow.status);
    if (!PAID_ELIGIBLE_MDATA_STATUSES.has(currentStatus)) {
      return {
        ok: false,
        code: "E_STATE_INVALID",
        message: `Load status ${currentStatus} cannot be marked paid`,
      };
    }

    const updateRes = await client.query(
      `
        UPDATE mdata.loads
        SET status = 'paid'::mdata.load_status_enum,
            updated_at = now()
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        RETURNING *
      `,
      [id, operatingCompanyId]
    );
    if (updateRes.rows.length === 0) {
      return { ok: false, code: "E_UPDATE_FAILED", message: "Load mark paid failed" };
    }
    auditPayload.changes = buildPatchChanges({ status: "paid" }, oldRow, updateRes.rows[0] as Record<string, unknown>);
  } else {
    return { ok: false, code: "E_UNKNOWN_ACTION", message: `Unknown action: ${action}` };
  }

  await appendBulkCrudAudit(client, actorUserId, "load", action, bulkCallId, auditPayload);
  return { ok: true };
}

export async function registerLoadsBulkRoutes(app: FastifyInstance) {
  registerBulkRoute({
    app,
    path: "/api/v1/dispatch/loads/bulk-update",
    domain: "dispatch",
    resource: "loads",
    entityType: "load",
    requireReasonActions: ["set_status", "mark_paid"],
    destructiveActions: ["mark_paid"],
    actionMap: {
      set_status: setStatusPayloadSchema,
      mark_factored: markFactoredPayloadSchema,
      mark_paid: markPaidPayloadSchema,
    },
    perEntityHandler: handleLoadBulk,
  });
}
