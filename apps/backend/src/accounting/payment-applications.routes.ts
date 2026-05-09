import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";

const paramsSchema = z.object({
  paymentId: z.string().uuid(),
});

const deleteParamsSchema = z.object({
  paymentId: z.string().uuid(),
  id: z.string().uuid(),
});

const createBodySchema = z.object({
  invoice_id: z.string().uuid(),
  amount_cents: z.coerce.number().int().positive(),
});

export async function registerPaymentApplicationsRoutes(app: FastifyInstance) {
  app.post("/api/v1/accounting/payments/:paymentId/applications", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const params = paramsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = createBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const paymentRes = await client.query(
        `
          SELECT id, customer_id, amount_unapplied_cents, voided_at
          FROM accounting.payments
          WHERE id = $1
            AND operating_company_id = $2
          LIMIT 1
        `,
        [params.data.paymentId, query.data.operating_company_id]
      );
      const payment = paymentRes.rows[0] as
        | {
            id: string;
            customer_id: string;
            amount_unapplied_cents: number;
            voided_at: string | null;
          }
        | null;
      if (!payment) return { code: 404 as const, error: "payment_not_found" };
      if (payment.voided_at) return { code: 409 as const, error: "payment_voided" };
      if (body.data.amount_cents > Number(payment.amount_unapplied_cents ?? 0)) {
        return { code: 400 as const, error: "amount_exceeds_payment_unapplied" };
      }

      const invoiceRes = await client.query(
        `
          SELECT id, status, amount_open_cents, customer_id
          FROM accounting.invoices
          WHERE id = $1
            AND operating_company_id = $2
          LIMIT 1
        `,
        [body.data.invoice_id, query.data.operating_company_id]
      );
      const invoice = invoiceRes.rows[0] as { id: string; status: string; amount_open_cents: number; customer_id: string } | null;
      if (!invoice) return { code: 404 as const, error: "invoice_not_found" };
      if (String(invoice.customer_id) !== String(payment.customer_id)) return { code: 409 as const, error: "invoice_customer_mismatch" };
      if (!["sent", "partial"].includes(String(invoice.status))) return { code: 409 as const, error: "invoice_not_open_for_payment" };
      if (body.data.amount_cents > Number(invoice.amount_open_cents ?? 0)) return { code: 400 as const, error: "amount_exceeds_invoice_open" };

      const insertRes = await client.query(
        `
          INSERT INTO accounting.payment_applications (
            operating_company_id,
            payment_id,
            invoice_id,
            amount_cents,
            applied_by_user_id
          ) VALUES ($1,$2,$3,$4,$5)
          RETURNING id
        `,
        [query.data.operating_company_id, params.data.paymentId, body.data.invoice_id, body.data.amount_cents, user.uuid]
      );
      const applicationId = insertRes.rows[0]?.id;
      if (!applicationId) return { code: 500 as const, error: "payment_application_create_failed" };

      const paymentAfterRes = await client.query(
        `SELECT amount_unapplied_cents FROM accounting.payments WHERE id = $1 LIMIT 1`,
        [params.data.paymentId]
      );
      const invoiceAfterRes = await client.query(
        `SELECT amount_open_cents, status FROM accounting.invoices WHERE id = $1 LIMIT 1`,
        [body.data.invoice_id]
      );

      await appendCrudAudit(
        client,
        user.uuid,
        "accounting.payment_applied",
        {
          resource_type: "accounting.payment_applications",
          resource_id: applicationId,
          operating_company_id: query.data.operating_company_id,
          payment_id: params.data.paymentId,
          invoice_id: body.data.invoice_id,
          amount_cents: body.data.amount_cents,
        },
        "info",
        "P3-T11.20.3-PAYMENT-RECORDING"
      );

      return {
        code: 201 as const,
        data: {
          id: applicationId,
          payment_amount_unapplied_cents: Number(paymentAfterRes.rows[0]?.amount_unapplied_cents ?? 0),
          invoice_amount_open_cents: Number(invoiceAfterRes.rows[0]?.amount_open_cents ?? 0),
          invoice_status: String(invoiceAfterRes.rows[0]?.status ?? ""),
        },
      };
    });

    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    return reply.code(result.code).send(result.data);
  });

  app.delete("/api/v1/accounting/payments/:paymentId/applications/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const params = deleteParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const paymentRes = await client.query(
        `
          SELECT id, voided_at
          FROM accounting.payments
          WHERE id = $1
            AND operating_company_id = $2
          LIMIT 1
        `,
        [params.data.paymentId, query.data.operating_company_id]
      );
      const payment = paymentRes.rows[0] as { id: string; voided_at: string | null } | null;
      if (!payment) return { code: 404 as const, error: "payment_not_found" };
      if (payment.voided_at) return { code: 409 as const, error: "payment_voided" };

      const deleteRes = await client.query(
        `
          DELETE FROM accounting.payment_applications
          WHERE id = $1
            AND payment_id = $2
          RETURNING id, invoice_id, amount_cents
        `,
        [params.data.id, params.data.paymentId]
      );
      const deleted = deleteRes.rows[0] ?? null;
      if (!deleted) return { code: 404 as const, error: "payment_application_not_found" };

      await appendCrudAudit(
        client,
        user.uuid,
        "accounting.payment_unapplied",
        {
          resource_type: "accounting.payment_applications",
          resource_id: deleted.id,
          operating_company_id: query.data.operating_company_id,
          payment_id: params.data.paymentId,
          invoice_id: deleted.invoice_id,
          amount_cents: deleted.amount_cents,
        },
        "warning",
        "P3-T11.20.3-PAYMENT-RECORDING"
      );

      return {
        code: 200 as const,
        data: { ok: true },
      };
    });

    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    return result.data;
  });
}
