import type { FastifyInstance, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { applyPayment as applyPaymentEngine, ApplyPaymentError } from "./payments/apply.service.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { canVoidCancel } from "../lib/authz/void-cancel-authz.js";

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

// ACCT-F5583: POST /:paymentId/applications (allocates a real payment to an invoice/bill) and DELETE
// /:paymentId/applications/:id (unapplies that allocation) had no role gate at all -- currentAuthUser
// only requires a valid session, and withCompanyScope's company-membership check is role-agnostic.
// Reuses the canonical void/cancel executor role predicate (Owner/Administrator/Accountant,
// Jorge-locked 2026-06-29), matching the fix already applied to the sibling
// customer-payments.routes.ts (ACCT-F5581) and vendor-bill-payments.routes.ts (ACCT-F5582).
function requirePaymentWriteRole(reply: FastifyReply, role: string) {
  if (!canVoidCancel(role)) {
    reply.code(403).send({ error: "forbidden", detail: "applying or unapplying a payment requires an accounting role" });
    return false;
  }
  return true;
}

export async function registerPaymentApplicationsRoutes(app: FastifyInstance) {
  // Rate-limited (CodeQL js/missing-rate-limiting). A money-mutating POST with no limit at all, since
  // the plugin is global:false. 30/min for a write path rather than the 60/min used for reads.
  app.post("/api/v1/accounting/payments/:paymentId/applications", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!requirePaymentWriteRole(reply, String(user.role ?? ""))) return;

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

      // ENTITY-SCOPED read-backs (CLS-JOIN-ENTITY-UNSCOPED). These two values are not display-only —
      // they are written straight into the CRUD audit record below as the post-application balances.
      // Read by id alone, an id belonging to another operating company still matches (RLS is no backstop:
      // org.user_accessible_company_ids() returns EVERY active company when the role is Owner), so the
      // audit trail could record another entity's unapplied/open balance as this application's outcome.
      // An audit row that is wrong is worse than one that is missing.
      const paymentAfterRes = await client.query(
        `SELECT amount_unapplied_cents FROM accounting.payments WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
        [params.data.paymentId, query.data.operating_company_id]
      );
      const invoiceAfterRes =
        targetKind === "invoice"
          ? await client.query(
              `SELECT amount_open_cents, status FROM accounting.invoices WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
              [targetId, query.data.operating_company_id]
            )
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

  app.delete("/api/v1/accounting/payments/:paymentId/applications/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!requirePaymentWriteRole(reply, String(user.role ?? ""))) return;

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
            AND operating_company_id = $2::uuid
          LIMIT 1
        `,
        [params.data.paymentId, query.data.operating_company_id]
      );
      const payment = paymentRes.rows[0] as { id: string; voided_at: string | null } | null;
      if (!payment) return { code: 404 as const, error: "payment_not_found" };
      if (payment.voided_at) return { code: 409 as const, error: "payment_voided" };

      // INV-2: void-never-delete — archive with unapplied_at, never hard-delete.
      const deleteRes = await client.query(
        `
          UPDATE accounting.payment_applications
          SET unapplied_at = now(), unapplied_by_user_id = $3
          WHERE id = $1
            AND payment_id = $2
            AND unapplied_at IS NULL
          RETURNING id, invoice_id, target_kind, target_id, amount_cents
        `,
        [params.data.id, params.data.paymentId, user.uuid]
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


export default fp(async (app) => {
  await registerPaymentApplicationsRoutes(app);
}, { name: "accounting.registerPaymentApplicationsRoutes" });
