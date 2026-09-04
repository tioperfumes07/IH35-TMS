// SET-24 (owner order 2026-09-04). See broker-advances.service.ts for the full business
// explanation. This route is the ONE write path for a broker advance receipt -- whatever hosts it
// (tab 13's SET-15 stacked entry, once built) calls this SAME endpoint, matching BLOCK-B rule 6.
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import {
  applyBrokerAdvanceToDriverBillInClientTx,
  BROKER_ADVANCE_CATEGORIES,
  BrokerAdvanceError,
  recordBrokerAdvanceInClientTx,
} from "./broker-advances.service.js";

const disburseToDriverBillBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  driver_bill_id: z.string().uuid(),
  amount_cents: z.number().int().positive(),
});

const createBrokerAdvanceBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  load_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  category: z.enum(BROKER_ADVANCE_CATEGORIES),
  instrument_type: z.string().trim().min(1),
  instrument_reference: z.string().trim().min(1),
  amount_cents: z.number().int().positive(),
  received_at: z.string().min(1),
  notes: z.string().trim().optional().nullable(),
});

export async function registerBrokerAdvancesRoutes(app: FastifyInstance) {
  app.post("/api/v1/accounting/broker-advances", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const body = createBrokerAdvanceBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    try {
      const result = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) =>
        recordBrokerAdvanceInClientTx(client, {
          operatingCompanyId: body.data.operating_company_id,
          loadId: body.data.load_id,
          customerId: body.data.customer_id,
          category: body.data.category,
          instrumentType: body.data.instrument_type,
          instrumentReference: body.data.instrument_reference,
          amountCents: body.data.amount_cents,
          receivedAt: body.data.received_at,
          notes: body.data.notes ?? null,
          actorUserId: user.uuid,
        })
      );
      return reply.code(201).send({
        broker_advance_id: result.brokerAdvanceId,
        applied_to_invoice_id: result.appliedToInvoiceId,
      });
    } catch (err) {
      if (err instanceof BrokerAdvanceError) {
        return reply.code(err.code === "load_not_found" || err.code === "customer_not_found" ? 404 : 400).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  // LOAD-COSTS-COMPLETE item (2) -- the broker paid the driver directly; record it as a bill
  // payment against the driver's existing driver_bills liability, linked to the SAME advance row.
  app.post(
    "/api/v1/accounting/broker-advances/:id/disburse-to-driver-bill",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
      if (!params.success) return validationError(reply, params.error);
      const body = disburseToDriverBillBodySchema.safeParse(req.body ?? {});
      if (!body.success) return validationError(reply, body.error);

      try {
        const result = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) =>
          applyBrokerAdvanceToDriverBillInClientTx(client, {
            operatingCompanyId: body.data.operating_company_id,
            brokerAdvanceId: params.data.id,
            driverBillId: body.data.driver_bill_id,
            amountCents: body.data.amount_cents,
            actorUserId: user.uuid,
          })
        );
        return reply.code(201).send({
          disbursed_amount_cents: result.disbursedAmountCents,
          journal_entry_id: result.journalEntryId,
        });
      } catch (err) {
        if (err instanceof BrokerAdvanceError) {
          const notFound = err.code === "broker_advance_not_found" || err.code === "driver_bill_not_found";
          return reply.code(notFound ? 404 : 400).send({ error: err.code, message: err.message });
        }
        throw err;
      }
    }
  );

  app.get("/api/v1/accounting/broker-advances", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.extend({ load_id: z.string().uuid().optional() }).safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const values: unknown[] = [query.data.operating_company_id];
      let loadFilter = "";
      if (query.data.load_id) {
        values.push(query.data.load_id);
        loadFilter = `AND load_id = $${values.length}::uuid`;
      }
      const res = await client.query(
        `
          SELECT id::text, load_id::text, customer_id::text, category, instrument_type,
                 instrument_reference, amount_cents::text, received_at::text, notes,
                 applied_to_invoice_id::text, applied_at::text, voided_at::text, created_at::text
          FROM accounting.broker_advances
          WHERE operating_company_id = $1::uuid
            ${loadFilter}
          ORDER BY received_at DESC
        `,
        values
      );
      return res.rows;
    });
    return reply.send({ rows });
  });
}

export default fp(
  async (app) => {
    await registerBrokerAdvancesRoutes(app);
  },
  { name: "accounting.registerBrokerAdvancesRoutes" }
);
