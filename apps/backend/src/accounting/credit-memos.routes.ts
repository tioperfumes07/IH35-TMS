import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
import { nextCreditMemoDisplayId } from "./display-id.js";

// ACCT-F5606 — AR credit memo CRUD + apply-to-invoice + void, mirroring vendor-credits.routes.ts's
// proven AP shape (CUSTVEND-PAR-1) column-for-column and check-for-check. Closes LV-CREDITMEMO-NOPATH's
// AR half: accounting.credit_memos existed with zero direct create/apply path (only ever written as a
// side effect inside payments/apply.service.ts's overpayment handler) and accounting.credit_memo_applications
// did not exist at all until this finding's migration (202612811300).
// NO GL posting — marks QBO-parity data only, same as the AP side. GL rides the existing
// invoice/payment chain when flags turn ON.

const idParamSchema = z.object({ id: z.string().uuid() });

const CREDIT_MEMO_REASONS = ["damage", "shortage", "rate_dispute", "duplicate_billing", "detention_dispute", "other"] as const;

const createBodySchema = z.object({
  customer_id: z.string().trim().uuid(),
  issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  amount_cents: z.coerce.number().int().positive(),
  reason: z.enum(CREDIT_MEMO_REASONS),
  notes: z.string().trim().max(2000).optional().nullable(),
});

const applyBodySchema = z.object({
  applications: z.array(
    z.object({
      invoice_id: z.string().uuid(),
      applied_cents: z.coerce.number().int().positive(),
      // Retry-safety, same shape as vendor_credit_applications.idempotency_key: a double-submit or a
      // retry after a timeout inserts once instead of decrementing the credit memo twice.
      idempotency_key: z.string().trim().min(1).max(200).optional(),
    })
  ).min(1).max(50),
});

const voidBodySchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

const listQuerySchema = companyQuerySchema.extend({
  customer_id: z.string().trim().optional(),
  status: z.enum(["draft", "issued", "applied", "voided"]).optional(),
});

function canWriteCreditMemos(role: string) {
  return ["Owner", "Administrator", "Manager", "Accountant"].includes(role);
}

export async function registerCreditMemosRoutes(app: FastifyInstance) {
  // GET /api/v1/accounting/credit-memos?operating_company_id=...&customer_id=...&status=...
  app.get("/api/v1/accounting/credit-memos", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const conditions: string[] = ["cm.operating_company_id = $1::uuid"];
      const params: unknown[] = [query.data.operating_company_id];

      if (query.data.customer_id) {
        params.push(query.data.customer_id);
        conditions.push(`cm.customer_id = $${params.length}::uuid`);
      }
      if (query.data.status) {
        params.push(query.data.status);
        conditions.push(`cm.status = $${params.length}`);
      }

      const res = await client.query(
        `SELECT
           cm.id,
           cm.customer_id,
           c.customer_name,
           cm.display_id,
           cm.status,
           cm.reason,
           cm.issue_date,
           cm.amount_cents,
           cm.amount_applied_cents,
           (cm.amount_cents - cm.amount_applied_cents) AS amount_unapplied_cents,
           cm.notes,
           cm.created_at,
           cm.created_by_user_id
         FROM accounting.credit_memos cm
         LEFT JOIN mdata.customers c
           ON c.id = cm.customer_id
          AND c.operating_company_id = cm.operating_company_id
         WHERE ${conditions.join(" AND ")}
         ORDER BY cm.issue_date DESC, cm.created_at DESC
         LIMIT 500`,
        params
      );
      return res.rows;
    });

    return { credit_memos: rows };
  });

  // Law §9 reverse drill-through: a credit memo must expose every invoice it reduced.
  // Read-only and company-scoped; this route does not calculate or post any GL.
  app.get("/api/v1/accounting/credit-memos/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const detail = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const creditRes = await client.query(
        `SELECT
           cm.id,
           cm.customer_id,
           c.customer_name,
           cm.display_id,
           cm.status,
           cm.reason,
           cm.issue_date,
           cm.amount_cents,
           cm.amount_applied_cents,
           (cm.amount_cents - cm.amount_applied_cents) AS amount_unapplied_cents,
           cm.notes,
           cm.created_at,
           cm.created_by_user_id
         FROM accounting.credit_memos cm
         LEFT JOIN mdata.customers c
           ON c.id = cm.customer_id
          AND c.operating_company_id = cm.operating_company_id
         WHERE cm.id = $1
           AND cm.operating_company_id = $2::uuid
         LIMIT 1`,
        [params.data.id, query.data.operating_company_id]
      );
      const credit = creditRes.rows[0];
      if (!credit) return null;

      const applicationsRes = await client.query(
        `SELECT
           cma.id,
           cma.invoice_id,
           i.display_id AS invoice_display_id,
           cma.applied_cents,
           cma.applied_at,
           cma.voided_at
         FROM accounting.credit_memo_applications cma
         JOIN accounting.invoices i
           ON i.id = cma.invoice_id
          AND i.operating_company_id = cma.operating_company_id
         WHERE cma.credit_memo_id = $1
           AND cma.operating_company_id = $2::uuid
         ORDER BY cma.applied_at DESC, cma.id DESC`,
        [params.data.id, query.data.operating_company_id]
      );
      return { credit_memo: credit, applications: applicationsRes.rows };
    });

    if (!detail) return reply.code(404).send({ error: "credit_memo_not_found" });
    return detail;
  });

  // POST /api/v1/accounting/credit-memos
  app.post("/api/v1/accounting/credit-memos", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canWriteCreditMemos(user.role)) return reply.code(403).send({ error: "forbidden" });

    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = createBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const customerRes = await client.query(
        `SELECT id FROM mdata.customers WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
        [body.data.customer_id, query.data.operating_company_id]
      );
      if (!customerRes.rows[0]) return { code: 404 as const, error: "customer_not_found" };

      const issueDate = body.data.issue_date ?? companyBusinessDate();

      // Canonical generator (same advisory-lock + MAX pattern nextVendorCreditDisplayId uses).
      const displayId = await nextCreditMemoDisplayId(
        client,
        query.data.operating_company_id,
        new Date(`${issueDate}T00:00:00Z`)
      );

      const insRes = await client.query(
        `INSERT INTO accounting.credit_memos
           (operating_company_id, customer_id, display_id, status, reason, issue_date, amount_cents, notes, created_by_user_id)
         VALUES ($1, $2, $3, 'issued', $4, $5, $6, $7, $8)
         RETURNING id, display_id, status, reason, issue_date, amount_cents, amount_applied_cents, (amount_cents - amount_applied_cents) AS amount_unapplied_cents`,
        [
          query.data.operating_company_id,
          body.data.customer_id,
          displayId,
          body.data.reason,
          issueDate,
          body.data.amount_cents,
          body.data.notes ?? null,
          user.uuid,
        ]
      );
      const credit = insRes.rows[0];
      if (!credit) return { code: 500 as const, error: "credit_memo_create_failed" };

      await appendCrudAudit(
        client,
        user.uuid,
        "accounting.credit_memos.created",
        { resource_type: "accounting.credit_memos", resource_id: String(credit.id), display_id: displayId, customer_id: body.data.customer_id },
        "info",
        "ACCT-F5606"
      );

      return { code: 201 as const, data: credit };
    });

    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    return reply.code(result.code).send(result.data);
  });

  // POST /api/v1/accounting/credit-memos/:id/apply — apply credit memo to one or more invoices
  app.post("/api/v1/accounting/credit-memos/:id/apply", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canWriteCreditMemos(user.role)) return reply.code(403).send({ error: "forbidden" });

    const params = idParamSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = applyBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const creditRes = await client.query(
        `SELECT id, status, customer_id, (amount_cents - amount_applied_cents) AS amount_unapplied_cents
         FROM accounting.credit_memos
         WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
        [params.data.id, query.data.operating_company_id]
      );
      const credit = creditRes.rows[0];
      if (!credit) return { code: 404 as const, error: "credit_memo_not_found" };
      if (credit.status === "voided") return { code: 409 as const, error: "credit_memo_voided" };

      // ACCT-F5618 — resolve idempotent replays FIRST, before the over-apply check. A retried
      // request (double-click, client timeout+retry) with the same idempotency_key must return the
      // SAME success result, never a fresh INSERT and never a stale over-apply rejection computed
      // against a balance that ALREADY reflects the first successful call. Mirrors
      // settlement-posting.service.ts's own findExistingPostedJe pre-check pattern (look up by the
      // uq_credit_memo_app_idempotency unique index before inserting) rather than catching 23505 —
      // catching after the fact would still 500/409 on the retry instead of transparently replaying.
      const applicationIds: string[] = [];
      const newApplications: typeof body.data.applications = [];
      for (const appReq of body.data.applications) {
        if (appReq.idempotency_key) {
          const existing = await client.query(
            `SELECT id FROM accounting.credit_memo_applications
              WHERE operating_company_id = $1::uuid AND idempotency_key = $2 AND voided_at IS NULL
              LIMIT 1`,
            [query.data.operating_company_id, appReq.idempotency_key]
          );
          if (existing.rows[0]) {
            applicationIds.push(String(existing.rows[0].id));
            continue;
          }
        }
        newApplications.push(appReq);
      }

      const totalApplying = newApplications.reduce((s, a) => s + a.applied_cents, 0);
      const unapplied = Number(credit.amount_unapplied_cents);
      if (totalApplying > unapplied) {
        return {
          code: 422 as const,
          error: "over_apply_refused",
          unapplied_cents: unapplied,
          requested_cents: totalApplying,
        };
      }

      for (const appReq of newApplications) {
        // customer_id on both sides is a direct mdata.customers.id uuid (unlike the AP side's
        // vendor_id, which bridges a canonical/QBO-mirror text space) — a plain equality check is
        // the correct, sufficient cross-customer guard here, no identity-set resolution needed.
        const invoiceRes = await client.query(
          `SELECT id, customer_id, total_cents, amount_paid_cents
             FROM accounting.invoices
            WHERE id = $1 AND operating_company_id = $2::uuid AND voided_at IS NULL LIMIT 1`,
          [appReq.invoice_id, query.data.operating_company_id]
        );
        const invoice = invoiceRes.rows[0];
        if (!invoice) return { code: 404 as const, error: `invoice_not_found:${appReq.invoice_id}` };

        if (String(invoice.customer_id) !== String(credit.customer_id)) {
          return {
            code: 422 as const,
            error: "invoice_customer_mismatch",
            detail: {
              invoice_id: appReq.invoice_id,
              invoice_customer_id: invoice.customer_id,
              credit_memo_customer_id: credit.customer_id,
            },
          };
        }

        // CAP THE APPLICATION AT THE INVOICE'S TRUE REMAINING BALANCE. amount_open_cents is a
        // GENERATED column (total_cents - amount_paid_cents, migration 0123) that has NO knowledge
        // of credit-memo applications — a naive check against it alone would let a credit memo
        // overshoot an invoice that a PRIOR credit-memo application had already partially covered.
        // Net off already-applied, non-voided credit-memo cents against this invoice, mirroring the
        // AP side's own "already-applied" ceiling fix (vendor-credits.routes.ts) exactly, so this
        // route ships with that class of bug already closed rather than repeating it here first.
        const alreadyAppliedRes = await client.query(
          `SELECT COALESCE(SUM(applied_cents), 0)::text AS applied_cents
             FROM accounting.credit_memo_applications
            WHERE invoice_id = $1
              AND operating_company_id = $2::uuid
              AND voided_at IS NULL`,
          [appReq.invoice_id, query.data.operating_company_id]
        );
        const invoiceRemainingCents =
          Number(invoice.total_cents ?? 0)
          - Number(invoice.amount_paid_cents ?? 0)
          - Number(alreadyAppliedRes.rows[0]?.applied_cents ?? 0);
        if (appReq.applied_cents > invoiceRemainingCents) {
          return {
            code: 422 as const,
            error: "applied_cents_exceeds_invoice_balance",
            detail: {
              invoice_id: appReq.invoice_id,
              applied_cents: appReq.applied_cents,
              invoice_remaining_cents: Math.max(0, invoiceRemainingCents),
            },
          };
        }

        const appRes = await client.query(
          `INSERT INTO accounting.credit_memo_applications
             (operating_company_id, credit_memo_id, invoice_id, applied_cents, applied_by_user_id, idempotency_key)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [
            query.data.operating_company_id,
            params.data.id,
            appReq.invoice_id,
            appReq.applied_cents,
            user.uuid,
            appReq.idempotency_key ?? null,
          ]
        );
        applicationIds.push(String(appRes.rows[0]?.id ?? ""));
      }

      await client.query(
        `UPDATE accounting.credit_memos
         SET amount_applied_cents = amount_applied_cents + $2,
             status = CASE
               WHEN amount_applied_cents + $2 >= amount_cents THEN 'applied'
               ELSE status
             END
         WHERE id = $1`,
        [params.data.id, totalApplying]
      );

      await appendCrudAudit(
        client,
        user.uuid,
        "accounting.credit_memos.applied",
        {
          resource_type: "accounting.credit_memos",
          resource_id: params.data.id,
          total_applied_cents: totalApplying,
          invoice_count: newApplications.length,
        },
        "info",
        "ACCT-F5606"
      );

      return { code: 200 as const, data: { applicationIds } };
    });

    if ("error" in result) {
      const { code, ...payload } = result;
      return reply.code(code).send(payload);
    }
    return reply.code(result.code).send(result.data);
  });

  // POST /api/v1/accounting/credit-memos/:id/void — void (never delete)
  app.post("/api/v1/accounting/credit-memos/:id/void", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canWriteCreditMemos(user.role)) return reply.code(403).send({ error: "forbidden" });

    const params = idParamSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = voidBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const creditRes = await client.query(
        `SELECT id, status FROM accounting.credit_memos
         WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
        [params.data.id, query.data.operating_company_id]
      );
      const credit = creditRes.rows[0];
      if (!credit) return { code: 404 as const, error: "credit_memo_not_found" };
      if (credit.status === "voided") return { code: 409 as const, error: "already_voided" };

      // Reverse active applications before voiding (void-never-delete: mark voided_at on each)
      await client.query(
        `UPDATE accounting.credit_memo_applications
         SET voided_at = now(), voided_by_user_id = $2, voided_reason = $3
         WHERE credit_memo_id = $1 AND voided_at IS NULL`,
        [params.data.id, user.uuid, body.data.reason]
      );
      // Zero out applied amount and mark voided (mirrors credit_memos' own voided_at/voided_by_user_id/
      // void_reason columns, which vendor_credits does not have — set both the generic status AND the
      // dedicated void columns so nothing reading either shape is left stale).
      await client.query(
        `UPDATE accounting.credit_memos
         SET status = 'voided',
             amount_applied_cents = 0,
             voided_at = now(),
             voided_by_user_id = $2,
             void_reason = $3
         WHERE id = $1`,
        [params.data.id, user.uuid, body.data.reason]
      );

      await appendCrudAudit(
        client,
        user.uuid,
        "accounting.credit_memos.voided",
        { resource_type: "accounting.credit_memos", resource_id: params.data.id, reason: body.data.reason },
        "warning",
        "ACCT-F5606"
      );

      return { code: 200 as const, data: { ok: true } };
    });

    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    return reply.code(result.code).send(result.data);
  });
}
