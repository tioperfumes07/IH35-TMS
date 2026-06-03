import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

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
      const operatingCompanyId = parsedQuery.data.operating_company_id;
      const customerId = parsedParams.data.customer_id;

      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
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
            pt.days_until_due AS credit_terms_days
          FROM mdata.customers c
          LEFT JOIN catalogs.payment_terms pt ON pt.id = c.payment_terms_id
          WHERE c.id = $1
            AND c.operating_company_id = $2
          LIMIT 1
        `,
        [customerId, operatingCompanyId]
      );
      const customer = customerRes.rows[0];
      if (!customer) return reply.code(404).send({ error: "mdata_customer_not_found" });

      const agingRes = await client.query(
        `
          SELECT
            current_cents,
            bucket_1_30_cents,
            bucket_31_60_cents,
            bucket_61_90_cents,
            bucket_91_plus_cents,
            total_open_cents,
            open_invoice_count
          FROM views.ar_aging
          WHERE operating_company_id = $1
            AND customer_id = $2
          LIMIT 1
        `,
        [operatingCompanyId, customerId]
      );

      const lastPaymentRes = await client.query(
        `
          SELECT MAX(payment_date) AS last_payment_at
          FROM accounting.payments
          WHERE customer_id = $1
            AND operating_company_id = $2
            AND voided_at IS NULL
        `,
        [customerId, operatingCompanyId]
      );

      const agingRow = (agingRes.rows[0] ??
        {
          current_cents: 0,
          bucket_1_30_cents: 0,
          bucket_31_60_cents: 0,
          bucket_61_90_cents: 0,
          bucket_91_plus_cents: 0,
          total_open_cents: 0,
          open_invoice_count: 0,
        }) as {
        current_cents: number | string | bigint;
        bucket_1_30_cents: number | string | bigint;
        bucket_31_60_cents: number | string | bigint;
        bucket_61_90_cents: number | string | bigint;
        bucket_91_plus_cents: number | string | bigint;
        total_open_cents: number | string | bigint;
        open_invoice_count: number | string;
      };

      const lastPaymentAt = ((lastPaymentRes.rows[0] as { last_payment_at?: string | null } | undefined)?.last_payment_at ?? null) as string | null;

      await appendCrudAudit(client, authUser.uuid, "mdata.customers.billing_summary_viewed", {
        resource_id: customerId,
        resource_type: "mdata.customers",
        operating_company_id: operatingCompanyId,
      });

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
        last_payment_at: lastPaymentAt,
        outstanding_balance_cents: Number(agingRow.total_open_cents ?? 0),
        aging_buckets: {
          current: Number(agingRow.current_cents ?? 0),
          bucket_1_30: Number(agingRow.bucket_1_30_cents ?? 0),
          bucket_31_60: Number(agingRow.bucket_31_60_cents ?? 0),
          bucket_61_90: Number(agingRow.bucket_61_90_cents ?? 0),
          bucket_91_plus: Number(agingRow.bucket_91_plus_cents ?? 0),
          total_open: Number(agingRow.total_open_cents ?? 0),
          open_invoice_count: Number(agingRow.open_invoice_count ?? 0),
        },
        status: "real",
      };
    });
  });
}
