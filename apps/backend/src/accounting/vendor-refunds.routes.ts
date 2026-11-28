/**
 * VENDOR REFUNDS routes (mirror of customer-refunds.routes.ts). The writer is vendor-refunds.service.ts;
 * posting lines live in the posting engine (source type vendor_refund: Dr bank / Cr A/P).
 *   GET  /api/v1/accounting/vendor-refunds?operating_company_id=&vendor_id=&vendor_credit_id=
 *   POST /api/v1/accounting/vendor-refunds?operating_company_id=          — receive a vendor credit's refund
 *   POST /api/v1/accounting/vendor-refunds/:id/void?operating_company_id= — void (never delete): reverses the posting
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { createVendorRefundBodySchema, createVendorRefundInClientTx, listVendorRefunds, voidVendorRefundBodySchema, voidVendorRefundInClientTx } from "./vendor-refunds.service.js";

const listQuerySchema = companyQuerySchema.extend({
  vendor_id: z.string().trim().min(1).max(64).optional(),
  vendor_credit_id: z.string().trim().uuid().optional(),
});
const idParamSchema = z.object({ id: z.string().trim().uuid() });

function canWriteRefunds(role: string) {
  return ["Owner", "Administrator", "Manager", "Accountant"].includes(role);
}

export async function registerVendorRefundsRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/vendor-refunds", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const refunds = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      listVendorRefunds(client, query.data.operating_company_id, { vendorId: query.data.vendor_id, vendorCreditId: query.data.vendor_credit_id })
    );
    return reply.send({ refunds });
  });

  app.post("/api/v1/accounting/vendor-refunds", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canWriteRefunds(user.role)) return reply.code(403).send({ error: "forbidden" });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = createVendorRefundBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      createVendorRefundInClientTx(client, { operatingCompanyId: query.data.operating_company_id, userId: user.uuid, input: body.data })
    );
    if ("error" in result) {
      const { code, ...payload } = result;
      return reply.code(code).send(payload);
    }
    return reply.code(result.code).send(result.data);
  });

  app.post("/api/v1/accounting/vendor-refunds/:id/void", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canWriteRefunds(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = voidVendorRefundBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      voidVendorRefundInClientTx(client, { operatingCompanyId: query.data.operating_company_id, userId: user.uuid, refundId: params.data.id, reason: body.data.reason })
    );
    if ("error" in result) {
      const { code, ...payload } = result;
      return reply.code(code).send(payload);
    }
    return reply.code(result.code).send(result.data);
  });
}
