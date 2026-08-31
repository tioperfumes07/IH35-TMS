/**
 * Customer payments bulk void — postVoidReversal per row; fail-stop; never bare set_status.
 */
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { registerBulkRoute } from "../bulk/bulk-update.factory.js";
import type { BulkPerEntityContext, BulkPerEntityResult } from "../bulk/bulk.types.js";
import { canVoidCancel } from "../lib/authz/void-cancel-authz.js";
import { emitAccountingSpineEvent } from "./accounting-spine-emit.js";
import { BATCH_VOID_ACTION, voidCustomerPaymentInBulk } from "./bulk-void.service.js";

const emptyPayloadSchema = z.object({}).default({});

async function handlePaymentBulk(ctx: BulkPerEntityContext<Record<string, unknown>>): Promise<BulkPerEntityResult> {
  if (ctx.action !== BATCH_VOID_ACTION) {
    return { ok: false, code: "E_UNKNOWN_ACTION", message: `Unknown action: ${ctx.action}` };
  }
  return voidCustomerPaymentInBulk(ctx, ctx.actorRole, {
    emitSpine: async ({ client, operatingCompanyId, actorUserId, paymentId, voidReason }) => {
      await emitAccountingSpineEvent(client as never, {
        operating_company_id: operatingCompanyId,
        actor_user_id: actorUserId,
        event_type: "payment.voided",
        entity_id: paymentId,
        entity_type: "payment",
        source_table: "accounting.payments",
        payload: { void_reason: voidReason },
      });
    },
  });
}

export async function registerPaymentsBulkRoutes(app: FastifyInstance) {
  registerBulkRoute({
    app,
    path: "/api/v1/accounting/payments/bulk-update",
    domain: "accounting",
    resource: "payments",
    entityType: "payment",
    requireReasonActions: [BATCH_VOID_ACTION],
    atomicFailStopActions: [BATCH_VOID_ACTION],
    actionRoleGate: (role, action) => {
      if (action !== BATCH_VOID_ACTION) return { ok: true };
      if (!canVoidCancel(role)) {
        return { ok: false, code: "E_FORBIDDEN", message: "Owner, Administrator, or Accountant required to void" };
      }
      return { ok: true };
    },
    actionMap: {
      [BATCH_VOID_ACTION]: emptyPayloadSchema,
    },
    perEntityHandler: handlePaymentBulk,
  });
}

export default fp(
  async (app) => {
    await registerPaymentsBulkRoutes(app);
  },
  { name: "accounting.registerPaymentsBulkRoutes" }
);
