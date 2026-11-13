import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import { voidDocument } from "../accounting/void-document.service.js";
import { companyBusinessDate } from "../lib/company-business-date.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

const voidBodySchema = z.object({
  payment_id: z.string().uuid(),
  operating_company_id: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
});

export async function registerCollectionVoidRoutes(app: FastifyInstance) {
  // POST /api/v1/factoring/collection-void
  // Voids a factoring collection payment (payment_source_kind='factoring_collection') and
  // reopens the invoice's factoring_status from 'collected' → 'advanced'.
  // GL reversal: Dr ar_control (1100) / Cr factoring_advance_liability (2150) — exact mirror of apply.
  app.post(
    "/api/v1/factoring/collection-void",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;

      const ALLOWED_ROLES = new Set(["Owner", "Administrator", "Accountant"]);
      if (!ALLOWED_ROLES.has(user.role)) {
        return reply.code(403).send({ error: "collection_void_role_required" });
      }

      const body = voidBodySchema.safeParse(req.body ?? {});
      if (!body.success) return validationError(reply, body.error);

      const { payment_id: paymentId, operating_company_id: oci, reason } = body.data;

      const result = await withCompanyScope(user.uuid, oci, async (client) => {
        // Verify this is a factoring collection payment
        const pmtRes = await (client as DbClient).query<{
          id: string;
          voided_at: string | null;
          payment_source_kind: string;
        }>(
          `SELECT id::text, voided_at::text, payment_source_kind
             FROM accounting.payments
            WHERE id = $1::uuid AND operating_company_id = $2::uuid
            LIMIT 1`,
          [paymentId, oci]
        );
        const pmt = pmtRes.rows[0];
        if (!pmt) return { code: 404 as const, error: "payment_not_found" };
        if (pmt.voided_at) return { code: 409 as const, error: "payment_already_voided" };
        if (pmt.payment_source_kind !== "factoring_collection") {
          return { code: 409 as const, error: "not_a_factoring_collection_payment" };
        }

        // Find invoices that will have their factoring_status reset.
        // Collect BEFORE the void (the trigger unapplies applications atomically with the void stamp).
        const invoiceRes = await (client as DbClient).query<{ invoice_id: string }>(
          `SELECT pa.invoice_id::text AS invoice_id
             FROM accounting.payment_applications pa
            WHERE pa.payment_id = $1::uuid
              AND pa.operating_company_id = $2::uuid
              AND pa.unapplied_at IS NULL
              AND EXISTS (
                SELECT 1 FROM accounting.invoices i
                 WHERE i.id = pa.invoice_id
                   AND i.operating_company_id = pa.operating_company_id
                   AND i.factoring_status = 'collected'
                   AND i.voided_at IS NULL
              )`,
          [paymentId, oci]
        );
        const invoiceIds = invoiceRes.rows.map((r) => r.invoice_id);

        // Void the payment — triggers cascade: trg_payment_void_unapplies_applications →
        // pmt_app_recompute_invoice → invoice.amount_open_cents / status update.
        const businessDate = companyBusinessDate();
        await voidDocument(client as never, {
          operatingCompanyId: oci,
          type: "customer_payment",
          id: paymentId,
          reason,
          actor: { userId: user.uuid, role: user.role },
          currentBusinessDate: businessDate,
        });

        // Reopen factoring_status for each invoice that was collected via this payment.
        if (invoiceIds.length > 0) {
          await (client as DbClient).query(
            `UPDATE accounting.invoices
                SET factoring_status = 'advanced',
                    updated_at = now(),
                    updated_by_user_id = $2::uuid
              WHERE id = ANY($1::uuid[])
                AND operating_company_id = $3::uuid
                AND factoring_status = 'collected'`,
            [invoiceIds, user.uuid, oci]
          );
        }

        return { code: 200 as const, reopened_invoice_ids: invoiceIds };
      });

      if ("error" in result) return reply.code(result.code).send({ error: result.error });
      return reply.code(result.code).send({
        ok: true,
        reopened_invoice_ids: result.reopened_invoice_ids,
      });
    }
  );
}
