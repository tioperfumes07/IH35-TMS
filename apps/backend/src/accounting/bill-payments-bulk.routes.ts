/**
 * Bill payments bulk void — voidBillPaymentInClientTx per row; fail-stop.
 */
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { registerBulkRoute } from "../bulk/bulk-update.factory.js";
import type { BulkPerEntityContext, BulkPerEntityResult } from "../bulk/bulk.types.js";
import { canVoidCancel } from "../lib/authz/void-cancel-authz.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
import { voidBillPaymentInClientTx } from "./bills.service.js";
import { BATCH_VOID_ACTION, voidBillPaymentInBulk } from "./bulk-void.service.js";

const emptyPayloadSchema = z.object({}).default({});

async function handleBillPaymentBulk(ctx: BulkPerEntityContext<Record<string, unknown>>): Promise<BulkPerEntityResult> {
  if (ctx.action !== BATCH_VOID_ACTION) {
    return { ok: false, code: "E_UNKNOWN_ACTION", message: `Unknown action: ${ctx.action}` };
  }
  return voidBillPaymentInBulk(ctx, ctx.actorRole, voidBillPaymentInClientTx as never, companyBusinessDate());
}

export async function registerBillPaymentsBulkRoutes(app: FastifyInstance) {
  registerBulkRoute({
    app,
    path: "/api/v1/accounting/bill-payments/bulk-update",
    domain: "accounting",
    resource: "bill-payments",
    entityType: "bill_payment",
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
    perEntityHandler: handleBillPaymentBulk,
  });
}

export default fp(
  async (app) => {
    await registerBillPaymentsBulkRoutes(app);
  },
  { name: "accounting.registerBillPaymentsBulkRoutes" }
);
