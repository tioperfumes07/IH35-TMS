import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";

const paramsSchema = z.object({
  customer_id: z.string().uuid(),
});

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function registerCustomerBillingRoutes(app: FastifyInstance) {
  app.get("/api/v1/mdata/customers/:customer_id/billing-summary", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;

    const parsedParams = paramsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = querySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    return withCurrentUser(authUser.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${parsedQuery.data.operating_company_id}'`);
      const customerRes = await client.query(
        `
          SELECT
            c.id,
            c.ar_email,
            c.default_free_time_hours,
            c.default_detention_rate,
            c.factoring_eligible,
            c.factoring_company_vendor_id,
            c.factoring_recourse_type,
            c.factoring_advance_rate_override,
            c.factoring_reserve_pct_override,
            c.factoring_notes,
            c.payment_terms_id,
            c.layover_charge_per_day,
            c.layover_currency,
            c.layover_first_night_free,
            c.layover_max_days,
            c.layover_notes,
            c.free_time_pickup_minutes,
            c.free_time_delivery_minutes,
            pt.days_due AS credit_terms_days
          FROM mdata.customers c
          LEFT JOIN catalogs.payment_terms pt ON pt.id = c.payment_terms_id
          WHERE c.id = $1
            AND c.operating_company_id = $2
            AND c.deactivated_at IS NULL
          LIMIT 1
        `,
        [parsedParams.data.customer_id, parsedQuery.data.operating_company_id]
      );
      const customer = customerRes.rows[0];
      if (!customer) return reply.code(404).send({ error: "mdata_customer_not_found" });
      return {
        ar_email: customer.ar_email ?? null,
        credit_terms_days: customer.credit_terms_days ?? null,
        factoring_eligible: Boolean(customer.factoring_eligible),
        factoring_company_vendor_id: customer.factoring_company_vendor_id ?? null,
        factoring_recourse_type: customer.factoring_recourse_type ?? null,
        factoring_advance_rate_override: customer.factoring_advance_rate_override ?? null,
        factoring_reserve_pct_override: customer.factoring_reserve_pct_override ?? null,
        factoring_notes: customer.factoring_notes ?? null,
        default_detention_rate: customer.default_detention_rate ?? null,
        default_free_time_hours: customer.default_free_time_hours ?? null,
        layover_config: {
          layover_charge_per_day: customer.layover_charge_per_day ?? null,
          layover_currency: customer.layover_currency ?? null,
          layover_first_night_free: Boolean(customer.layover_first_night_free),
          layover_max_days: customer.layover_max_days ?? null,
          layover_notes: customer.layover_notes ?? null,
          free_time_pickup_minutes: customer.free_time_pickup_minutes ?? null,
          free_time_delivery_minutes: customer.free_time_delivery_minutes ?? null,
        },
        last_payment_at: null,
        outstanding_balance_cents: null,
        aging_buckets: {
          current: 0,
          "1_30": 0,
          "31_60": 0,
          "61_plus": 0,
        },
        status: "partial",
        partial_message: "Receivables aging requires accounting module which ships in Phase 5.",
      };
    });
  });
}
