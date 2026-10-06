import type { FastifyInstance, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { DuplicateDocumentNumberError, nextPaymentDisplayId, resolvePaymentDisplayId } from "./display-id.js";
import { duplicateDocumentNumberBody } from "../lib/qbo-custom-document-number.js";
import { enqueueAccountingOutbox } from "./outbox-events.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { emitAccountingSpineEvent } from "./accounting-spine-emit.js";
import { assertBankAccountUsable } from "../banking/bank-account-visibility.js";
import { resolveRoleAccountOptional } from "./coa-roles/resolver.service.js";
import { postSourceTransactionInClientTx } from "./posting-engine.service.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { recordPostingFlagSkip } from "./posting-flag-skip-audit.js";
import { canVoidCancel } from "../lib/authz/void-cancel-authz.js";
import { createCustomerPaymentInClient } from "./payments/customer-payment-create.service.js";

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
  // FAIL-F2 sweep / ACCT-F264 — without this the flag cannot be SUPPLIED, so the INSERT has nothing to
  // write. Optional; only an explicit true marks sample.
  is_sample_data: z.boolean().optional(),
  display_id: z.string().trim().min(1).max(40).optional(),
  applications: z
    .array(
      z.object({
        invoice_id: z.string().uuid(),
        amount_cents: z.coerce.number().int().positive(),
      })
    )
    .default([]),
});

// ACCT-F5581: POST /:id/payments records a real cash receipt and, when
// CUSTOMER_PAYMENT_GL_POSTING_ENABLED is on, posts a real journal entry (see the CLS-SUBLEDGER-GL-DARK
// comment below on the route itself) -- yet had no role gate at all, any authenticated company member
// could fabricate a "payment received" record. Reuses the canonical void/cancel executor role set
// (Owner/Administrator/Accountant, Jorge-locked 2026-06-29) since recording cash receipt is the same
// tier of financial-executor operation, not because this is a void/cancel action.
function requirePaymentWriteRole(reply: FastifyReply, role: string) {
  if (!canVoidCancel(role)) {
    reply.code(403).send({ error: "forbidden", detail: "recording a customer payment requires an accounting role" });
    return false;
  }
  return true;
}

export async function registerCustomerPaymentsRoutes(app: FastifyInstance) {
  // Rate-limited (CodeQL js/missing-rate-limiting). Pre-existing gap surfaced because this PR touched
  // the file; the plugin is registered global:false so an un-configured route has NO limit at all.
  app.get("/api/v1/customers/:id/payments", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const params = customerIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = listCustomerPaymentsQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const custRes = await client.query(`SELECT id FROM mdata.customers WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`, [
        params.data.id,
        query.data.operating_company_id,
      ]);
      if (!custRes.rows[0]) return { code: 404 as const, error: "customer_not_found" as const };

      const whereSql = `p.customer_id = $2 AND p.operating_company_id = $1::uuid AND p.voided_at IS NULL`;
      const values: unknown[] = [query.data.operating_company_id, params.data.id];

      const countRes = await client.query(`SELECT COUNT(*)::int AS total FROM accounting.payments p WHERE ${whereSql}`, values);
      values.push(query.data.limit, query.data.offset);
      const limitIdx = values.length - 1;
      const offsetIdx = values.length;

      const rowsRes = await client.query(
        `
          SELECT
            p.id,
            -- LINK-F5170: the real, human-facing payment identity (format PMT-YYYY-NNNNN) was never
            -- selected, so the customer-detail UI could not render it and fell back to entityLabel's
            -- raw-uuid path.
            p.display_id,
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
                -- CUST-MONEY-F6105: the frontend's Unapply action needs the application row's OWN id
                -- to call the canonical DELETE /api/v1/accounting/payments/:paymentId/applications/:id
                -- route (payment_applications.id, not invoice_id) -- without it there is no contract
                -- path from this list to that route at all.
                'application_id', pa.id,
                'invoice_id', pa.invoice_id,
                'amount_cents', pa.amount_cents,
                'invoice_display_id', i.display_id
              )
              ORDER BY pa.applied_at
            ) AS applied_to_invoices
            FROM accounting.payment_applications pa
            -- ENTITY PREDICATE (CLS-JOIN-ENTITY-UNSCOPED): the payment p is scoped by the outer WHERE,
            -- but the invoice it resolves to was not. This join supplies invoice_display_id, and
            -- display_id is unique PER ENTITY, not globally — INV-2026-00004 exists on both USMCA (a $0
            -- test row) and TRANSP (a PAID $3,800 LONGSHIP invoice), verified live. So an unscoped join
            -- could label a payment application with another entity's invoice number, which reads as a
            -- legitimate reference and is impossible to spot downstream.
            JOIN accounting.invoices i ON i.id = pa.invoice_id
                                      AND i.operating_company_id = p.operating_company_id
            -- CUST-MONEY-F6105: also exclude already-unapplied rows -- otherwise a re-applied invoice
            -- would show its OLD (unapplied) application alongside the new one, and the Unapply action
            -- would try to unapply an application row that is already unapplied.
            WHERE pa.payment_id = p.id AND pa.unapplied_at IS NULL
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

  app.post(
    "/api/v1/customers/:id/payments",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!requirePaymentWriteRole(reply, String(user.role ?? ""))) return;

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

    let result;
    try {
    // ROUND 433 B8 — the payment writer is customer-payment-create.service.ts (one writer for this form and for Banking's
    // receive-and-match); this route keeps auth, validation and the HTTP shape.
    result = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      createCustomerPaymentInClient(client, user.uuid, {
        operating_company_id: query.data.operating_company_id,
        customer_id: params.data.id,
        received_at: body.data.received_at,
        amount_cents: body.data.amount_cents,
        payment_method: body.data.payment_method,
        bank_account_id: body.data.bank_account_id ?? null,
        reference_number: body.data.reference_number ?? null,
        is_sample_data: body.data.is_sample_data,
        display_id: body.data.display_id ?? null,
        applications: body.data.applications,
        payment_source_kind: "manual",
        source_bank_transaction_id: null,
        route: "POST /api/v1/customers/:id/payments",
      })
    );
    } catch (error) {
      if (error instanceof DuplicateDocumentNumberError) {
        return reply.code(409).send(duplicateDocumentNumberBody(error));
      }
      throw error;
    }

    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    return reply.code(result.code).send(result.data);
  });
}


export default fp(async (app) => {
  await registerCustomerPaymentsRoutes(app);
}, { name: "accounting.registerCustomerPaymentsRoutes" });
