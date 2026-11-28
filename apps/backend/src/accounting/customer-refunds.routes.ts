/**
 * CUSTOMER REFUNDS routes (owner 2026-11-27 22:40 CT "Build refund engine"). The writer is customer-refunds.service.ts;
 * posting lines live in the posting engine (source type customer_refund: Dr A/R / Cr bank).
 *   GET  /api/v1/accounting/customer-refunds?operating_company_id=&customer_id=&credit_memo_id=
 *   POST /api/v1/accounting/customer-refunds?operating_company_id=          — refund a credit memo's unapplied amount
 *   POST /api/v1/accounting/customer-refunds/:id/void?operating_company_id= — void (never delete): reverses the posting
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { createCustomerRefundInClientTx, createRefundBodySchema, listCustomerRefunds, voidCustomerRefundInClientTx, voidRefundBodySchema } from "./customer-refunds.service.js";

const listQuerySchema = companyQuerySchema.extend({
  customer_id: z.string().trim().uuid().optional(),
  credit_memo_id: z.string().trim().uuid().optional(),
});
const idParamSchema = z.object({ id: z.string().trim().uuid() });

function canWriteRefunds(role: string) {
  return ["Owner", "Administrator", "Manager", "Accountant"].includes(role);
}

export async function registerCustomerRefundsRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/customer-refunds", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const refunds = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      listCustomerRefunds(client, query.data.operating_company_id, { customerId: query.data.customer_id, creditMemoId: query.data.credit_memo_id })
    );
    return reply.send({ refunds });
  });

  app.post("/api/v1/accounting/customer-refunds", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canWriteRefunds(user.role)) return reply.code(403).send({ error: "forbidden" });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = createRefundBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      createCustomerRefundInClientTx(client, { operatingCompanyId: query.data.operating_company_id, userId: user.uuid, input: body.data })
    );
    if ("error" in result) {
      const { code, ...payload } = result;
      return reply.code(code).send(payload);
    }
    return reply.code(result.code).send(result.data);
  });

  app.post("/api/v1/accounting/customer-refunds/:id/void", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canWriteRefunds(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = voidRefundBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      voidCustomerRefundInClientTx(client, { operatingCompanyId: query.data.operating_company_id, userId: user.uuid, refundId: params.data.id, reason: body.data.reason })
    );
    if ("error" in result) {
      const { code, ...payload } = result;
      return reply.code(code).send(payload);
    }
    return reply.code(result.code).send(result.data);
  });
}
