import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { nextPaymentDisplayId } from "./display-id.js";
import { enqueueAccountingOutbox } from "./outbox-events.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { emitAccountingSpineEvent } from "./accounting-spine-emit.js";

const paymentMethodSchema = z.enum([
  "ach",
  "wire",
  "check",
  "cash",
  "factoring_advance",
  "factoring_reserve",
  "credit_card",
  "other",
]);

const customerIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const listCustomerPaymentsQuerySchema = companyQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const createCustomerPaymentBodySchema = z.object({
  received_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount_cents: z.coerce.number().int().positive(),
  payment_method: paymentMethodSchema,
  bank_account_id: z.string().uuid().optional(),
  reference_number: z.string().trim().max(200).optional(),
  applications: z
    .array(
      z.object({
        invoice_id: z.string().uuid(),
        amount_cents: z.coerce.number().int().positive(),
      })
    )
    .default([]),
});

export async function registerCustomerPaymentsRoutes(app: FastifyInstance) {
  app.get("/api/v1/customers/:id/payments", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const params = customerIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = listCustomerPaymentsQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const custRes = await client.query(`SELECT id FROM mdata.customers WHERE id = $1 AND operating_company_id = $2 LIMIT 1`, [
        params.data.id,
        query.data.operating_company_id,
      ]);
      if (!custRes.rows[0]) return { code: 404 as const, error: "customer_not_found" as const };

      const whereSql = `p.customer_id = $2 AND p.operating_company_id = $1 AND p.voided_at IS NULL`;
      const values: unknown[] = [query.data.operating_company_id, params.data.id];

      const countRes = await client.query(`SELECT COUNT(*)::int AS total FROM accounting.payments p WHERE ${whereSql}`, values);
      values.push(query.data.limit, query.data.offset);
      const limitIdx = values.length - 1;
      const offsetIdx = values.length;

      const rowsRes = await client.query(
        `
          SELECT
            p.id,
            p.payment_date::text AS date,
            p.amount_cents,
            p.payment_source_kind AS source_kind,
            p.source_bank_transaction_id,
            p.qbo_payment_id,
            COALESCE(apps.applied_to_invoices, '[]'::json) AS applied_to_invoices
          FROM accounting.payments p
          LEFT JOIN LATERAL (
            SELECT json_agg(
              json_build_object(
                'invoice_id', pa.invoice_id,
                'amount_cents', pa.amount_cents,
                'invoice_display_id', i.display_id
              )
              ORDER BY pa.applied_at
            ) AS applied_to_invoices
            FROM accounting.payment_applications pa
            JOIN accounting.invoices i ON i.id = pa.invoice_id
            WHERE pa.payment_id = p.id
          ) apps ON true
          WHERE ${whereSql}
          ORDER BY p.payment_date DESC, p.created_at DESC
          LIMIT $${limitIdx}
          OFFSET $${offsetIdx}
        `,
        values
      );

      return {
        code: 200 as const,
        data: {
          rows: rowsRes.rows,
          total: Number(countRes.rows[0]?.total ?? 0),
        },
      };
    });

    if ("code" in payload && payload.code === 404) return reply.code(404).send({ error: payload.error });
    return payload.data;
  });

  app.post("/api/v1/customers/:id/payments", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const params = customerIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = createCustomerPaymentBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const sumApplied = body.data.applications.reduce((sum, row) => sum + Number(row.amount_cents ?? 0), 0);
    if (sumApplied > body.data.amount_cents) {
      return reply.code(400).send({ error: "payment_apply_exceeds_total" });
    }

    const dup = new Set<string>();
    for (const row of body.data.applications) {
      if (dup.has(row.invoice_id)) return reply.code(400).send({ error: "duplicate_invoice_in_applications" });
      dup.add(row.invoice_id);
    }

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const customerRes = await client.query(
        `SELECT id FROM mdata.customers WHERE id = $1 AND operating_company_id = $2 LIMIT 1`,
        [params.data.id, query.data.operating_company_id]
      );
      if (!customerRes.rows[0]) return { code: 404 as const, error: "customer_not_found" as const };

      if (body.data.bank_account_id) {
        const acctRes = await client.query(
          `SELECT id FROM banking.bank_accounts WHERE id = $1 AND operating_company_id = $2 LIMIT 1`,
          [body.data.bank_account_id, query.data.operating_company_id]
        );
        if (!acctRes.rows[0]) return { code: 400 as const, error: "bank_account_not_found" };
      }

      const displayId = await nextPaymentDisplayId(client, query.data.operating_company_id, new Date(`${body.data.received_at}T00:00:00.000Z`));

      const paymentRes = await client.query(
        `
          INSERT INTO accounting.payments (
            operating_company_id,
            customer_id,
            display_id,
            payment_method,
            payment_date,
            reference,
            amount_cents,
            deposited_to_account_id,
            notes,
            created_by_user_id,
            payment_source_kind,
            source_bank_transaction_id
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          RETURNING id, display_id, amount_unapplied_cents
        `,
        [
          query.data.operating_company_id,
          params.data.id,
          displayId,
          body.data.payment_method,
          body.data.received_at,
          body.data.reference_number ?? null,
          body.data.amount_cents,
          body.data.bank_account_id ?? "ops_checking",
          null,
          user.uuid,
          "manual",
          null,
        ]
      );
      const payment = paymentRes.rows[0] as { id: string; display_id: string; amount_unapplied_cents: number } | undefined;
      if (!payment?.id) return { code: 500 as const, error: "payment_create_failed" as const };

      let applicationsCount = 0;
      for (const applyRow of body.data.applications) {
        const invoiceRes = await client.query(
          `
            SELECT id, amount_open_cents, status
            FROM accounting.invoices
            WHERE id = $1
              AND operating_company_id = $2
              AND customer_id = $3
            LIMIT 1
          `,
          [applyRow.invoice_id, query.data.operating_company_id, params.data.id]
        );
        const invoice = invoiceRes.rows[0] as { id: string; amount_open_cents: number; status: string } | null;
        if (!invoice) return { code: 404 as const, error: "invoice_not_found_for_customer" as const };
        if (!["sent", "partial"].includes(String(invoice.status))) return { code: 409 as const, error: "invoice_not_open_for_payment" as const };
        if (Number(applyRow.amount_cents) > Number(invoice.amount_open_cents ?? 0)) return { code: 400 as const, error: "apply_amount_exceeds_invoice_open" as const };

        await client.query(
          `
            INSERT INTO accounting.payment_applications (
              operating_company_id,
              payment_id,
              invoice_id,
              target_kind,
              target_id,
              amount_cents,
              amount_applied,
              applied_by_user_id,
              applied_by_user_uuid
            ) VALUES ($1,$2,$3,'invoice',$3,$4,$5,$6,$6)
          `,
          [
            query.data.operating_company_id,
            payment.id,
            applyRow.invoice_id,
            applyRow.amount_cents,
            applyRow.amount_cents / 100,
            user.uuid,
          ]
        );
        applicationsCount += 1;
      }

      const refreshedRes = await client.query(`SELECT amount_unapplied_cents FROM accounting.payments WHERE id = $1 LIMIT 1`, [payment.id]);
      const refreshed = refreshedRes.rows[0] ?? { amount_unapplied_cents: 0 };

      await enqueueAccountingOutbox(client, query.data.operating_company_id, "qbo.customer_payment.created", "customer_payment", payment.id, {
        payment_id: payment.id,
        customer_id: params.data.id,
        amount_cents: body.data.amount_cents,
        payment_date: body.data.received_at,
      });

      await appendCrudAudit(
        client,
        user.uuid,
        "accounting.customer_payment.created.p6_t11204",
        {
          resource_type: "accounting.payments",
          resource_id: payment.id,
          operating_company_id: query.data.operating_company_id,
          customer_id: params.data.id,
          display_id: payment.display_id,
          applications_count: applicationsCount,
        },
        "info",
        "P6-T11204-PAYMENTS"
      );

      return {
        code: 201 as const,
        data: {
          id: payment.id,
          display_id: payment.display_id,
          amount_unapplied_cents: Number(refreshed.amount_unapplied_cents ?? 0),
          applications_count: applicationsCount,
        },
      };
    });

    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    void withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      emitAccountingSpineEvent(client, {
        operating_company_id: query.data.operating_company_id,
        actor_user_id: String(user.uuid),
        event_type: "customer_payment.created",
        entity_id: (result as { data?: { id?: string } })?.data?.id ?? "",
        entity_type: "customer_payment",
        source_table: "accounting.payments",
      })
    ).catch(() => undefined);
    return reply.code(result.code).send(result.data);
  });
}


export default fp(async (app) => {
  await registerCustomerPaymentsRoutes(app);
}, { name: "accounting.registerCustomerPaymentsRoutes" });
