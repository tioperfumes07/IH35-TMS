import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { applyPayment as applyPaymentEngine, ApplyPaymentError } from "./payments/apply.service.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";

const paramsSchema = z.object({
  paymentId: z.string().uuid(),
});

const deleteParamsSchema = z.object({
  paymentId: z.string().uuid(),
  id: z.string().uuid(),
});

const createBodySchema = z.object({
  target_kind: z.enum(["invoice", "bill"]).default("invoice"),
  target_id: z.string().uuid().optional(),
  invoice_id: z.string().uuid().optional(),
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

    const targetKind = body.data.target_kind ?? "invoice";
    const targetId = body.data.target_id ?? body.data.invoice_id;
    if (!targetId) return reply.code(400).send({ error: "target_id_required" });

    let result;
    try {
      result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {

      const applied = await applyPaymentEngine(
        client,
        {
          operating_company_id: query.data.operating_company_id,
          payment_id: params.data.paymentId,
          applications: [
            {
              target_kind: targetKind,
              target_id: targetId,
              amount_cents: body.data.amount_cents,
            },
          ],
        },
        { user_id: user.uuid }
      );

      const applicationId = applied.application_ids[0];
      if (!applicationId) return { code: 500 as const, error: "payment_application_create_failed" };

      const paymentAfterRes = await client.query(
        `SELECT amount_unapplied_cents FROM accounting.payments WHERE id = $1 LIMIT 1`,
        [params.data.paymentId]
      );
      const invoiceAfterRes =
        targetKind === "invoice"
          ? await client.query(`SELECT amount_open_cents, status FROM accounting.invoices WHERE id = $1 LIMIT 1`, [targetId])
          : { rows: [{ amount_open_cents: 0, status: "n/a" }] };

      await appendCrudAudit(
        client,
        user.uuid,
        "accounting.payment_applied",
        {
          resource_type: "accounting.payment_applications",
          resource_id: applicationId,
          operating_company_id: query.data.operating_company_id,
          payment_id: params.data.paymentId,
          target_kind: body.data.target_kind,
          target_id: body.data.target_id ?? body.data.invoice_id,
          amount_cents: body.data.amount_cents,
          overpayment_credit_memo_display_id: applied.overpayment_credit_memo_display_id,
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
          overpayment_credit_memo_display_id: applied.overpayment_credit_memo_display_id,
        },
      };
      });
    } catch (error) {
      if (error instanceof ApplyPaymentError) {
        if (
          error.code === "payment_not_found" ||
          error.code === "invoice_not_found" ||
          error.code === "bill_not_found"
        ) {
          return reply.code(404).send({ error: error.code });
        }
        if (
          error.code === "payment_voided" ||
          error.code === "invoice_not_open_for_payment" ||
          error.code === "invoice_customer_mismatch" ||
          error.code === "bill_customer_mismatch"
        ) {
          return reply.code(409).send({ error: error.code });
        }
        return reply.code(400).send({ error: error.code });
      }
      throw error;
    }
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
          RETURNING id, invoice_id, target_kind, target_id, amount_cents
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
          target_kind: deleted.target_kind,
          target_id: deleted.target_id,
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
