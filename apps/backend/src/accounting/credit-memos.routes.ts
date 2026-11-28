import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { entityIdFilterSchema, entityIdFilterValues } from "../_helpers/entity-filter-list.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
import { DuplicateDocumentNumberError, nextCreditMemoDisplayId } from "./display-id.js";
import { duplicateDocumentNumberBody, suggestFromLastSaved } from "../lib/qbo-custom-document-number.js";
import { PostingEngineError, reversePostedSourceTransactionInClientTx } from "./posting-engine.service.js";
import {
  reinstateDocumentThenVoidReversal,
  ReinstateDocumentError,
} from "./reinstate-document.service.js";
import { statusListCondition, statusListParam } from "../lib/status-list.js";
import { applyCreditMemoToInvoicesInClientTx } from "./credit-memo-apply.service.js";
import { createBodySchema, createCreditMemoInClientTx } from "./credit-memo-create.service.js";
import { liveRefundCentsForCreditMemo } from "./customer-refunds.service.js";

// ACCT-F5606 — AR credit memo CRUD + apply-to-invoice + void, mirroring vendor-credits.routes.ts's
// proven AP shape (CUSTVEND-PAR-1) column-for-column and check-for-check. Closes LV-CREDITMEMO-NOPATH's
// AR half: accounting.credit_memos existed with zero direct create/apply path (only ever written as a
// side effect inside payments/apply.service.ts's overpayment handler) and accounting.credit_memo_applications
// did not exist at all until this finding's migration (202612811300).
// ROUND 373.4 — a credit memo now POSTS at creation, on the creating transaction: Dr the income / contra-income account
// it names (account_id, required here) / Cr A/R, through the canonical engine (spine link, load stamp). Void reverses
// it through the engine in the same transaction. Applying it to invoices moves the subledger only.

const idParamSchema = z.object({ id: z.string().uuid() });

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
  customer_id: entityIdFilterSchema.optional(),
  // R-102-B item 5 ("DEFAULT FILTERS") — "active" is a frontend-facing pseudo-status (not a real
  // credit_memos.status value): draft/issued/applied are all live states, voided is the only dead
  // one, so "active" means "exclude voided" rather than matching one literal status column value.
  // U12 — multi-select: ?status=a&status=b (one value still accepted).
  status: statusListParam(["draft", "issued", "applied", "voided", "active"] as const),
  // ACCT-F11101 — the credit memos issued against one invoice (invoice detail: original + corrections, both on record).
  related_invoice_id: z.string().trim().uuid().optional(),
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
        params.push(entityIdFilterValues(query.data.customer_id));
        conditions.push(`cm.customer_id = ANY($${params.length}::uuid[])`);
      }
      if (query.data.related_invoice_id) {
        params.push(query.data.related_invoice_id);
        conditions.push(`cm.related_invoice_id = $${params.length}::uuid`);
      }
      const statusCond = statusListCondition("cm.status", query.data.status, (v) => {
        params.push(v);
        return `$${params.length}`;
      }, { notVoidedPseudo: { value: "active", excludes: ["voided"] } });
      if (statusCond) conditions.push(statusCond);

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
           cm.created_by_user_id,
           cm.voided_at,
           cm.void_reason,
           cm.voided_by_user_id,
           cm.related_invoice_id,
           ri.display_id AS related_invoice_display_id
         FROM accounting.credit_memos cm
         LEFT JOIN accounting.invoices ri
           ON ri.id = cm.related_invoice_id
          AND ri.operating_company_id = cm.operating_company_id
         LEFT JOIN mdata.customers c
           ON c.id = cm.customer_id
          AND c.operating_company_id = cm.operating_company_id
         WHERE ${conditions.join(" AND ")}
         ORDER BY cm.issue_date DESC, cm.created_at DESC
         LIMIT 500`,
        params
      );
      // R-102-B item 5 — disclosed count: company-wide, independent of every non-status filter.
      const voidedRes = await client.query(
        `SELECT count(*) AS n FROM accounting.credit_memos
          WHERE operating_company_id = $1::uuid AND status = 'voided'`,
        [query.data.operating_company_id]
      );
      return { rows: res.rows, voidedCount: Number(voidedRes.rows[0]?.n ?? 0) };
    });

    return { credit_memos: rows.rows, voided_count: rows.voidedCount };
  });

  app.get("/api/v1/accounting/credit-memos/next-number", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const check = typeof (req.query as { check?: string }).check === "string" ? String((req.query as { check?: string }).check).trim() : "";
    return withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      if (check) {
        const taken = await client.query(
          `SELECT 1 FROM accounting.credit_memos WHERE operating_company_id = $1::uuid AND display_id = $2 LIMIT 1`,
          [query.data.operating_company_id, check]
        );
        return { taken: Boolean(taken.rows[0]), suggested: check, derived_from: null, document_number: check };
      }
      return suggestFromLastSaved(
        client,
        {
          text: `SELECT display_id AS last_number FROM accounting.credit_memos WHERE operating_company_id = $1::uuid AND COALESCE(display_id,'') <> '' ORDER BY created_at DESC LIMIT 1`,
          values: [query.data.operating_company_id],
        },
        () => nextCreditMemoDisplayId(client, query.data.operating_company_id)
      );
    });
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
           cm.created_by_user_id,
           cm.voided_at,
           cm.void_reason,
           cm.voided_by_user_id,
           cm.related_invoice_id,
           ri.display_id AS related_invoice_display_id
         FROM accounting.credit_memos cm
         LEFT JOIN accounting.invoices ri
           ON ri.id = cm.related_invoice_id
          AND ri.operating_company_id = cm.operating_company_id
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

    let result;
    try {
      result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      return createCreditMemoInClientTx(client, { operatingCompanyId: query.data.operating_company_id, userId: user.uuid, input: body.data });
    });
    } catch (error) {
      if (error instanceof DuplicateDocumentNumberError) {
        return reply.code(409).send(duplicateDocumentNumberBody(error));
      }
      throw error;
    }

    if ("error" in result) {
      const { code, ...payload } = result;
      return reply.code(code).send(payload);
    }
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

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      applyCreditMemoToInvoicesInClientTx(client as never, {
        operatingCompanyId: query.data.operating_company_id, creditMemoId: params.data.id, userId: user.uuid, applications: body.data.applications,
      })
    );

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
      // ACCT-F5639 — FOR UPDATE, matching the sibling row-lock pattern this codebase already uses on
      // every other void writer (bills.service.ts, payments.routes.ts's ACCT-F5636 fix, every
      // governance/void-cancel-executors.ts executor). Without it, a concurrent /apply request can
      // INSERT a credit_memo_applications row and this /void call's status check can both read the
      // pre-apply state before either commits — the applications UPDATE below (voided_at IS NULL)
      // then misses the just-applied row entirely (invisible under READ COMMITTED), so the credit
      // memo ends up status='voided' while a live, non-voided application row still stands: a
      // permanently stranded application that every downstream netting query (verify-ar-aging-credit-
      // memo-netting, ACCT-F5633's customer-payment apply cap) will keep counting against the invoice
      // forever, understating its true open balance.
      const creditRes = await client.query(
        `SELECT id, status FROM accounting.credit_memos
         WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1
         FOR UPDATE`,
        [params.data.id, query.data.operating_company_id]
      );
      const credit = creditRes.rows[0];
      if (!credit) return { code: 404 as const, error: "credit_memo_not_found" };
      if (credit.status === "voided") return { code: 409 as const, error: "already_voided" };
      // CUSTOMER REFUNDS — a refunded credit memo cannot be voided while its refund stands (the refund's Dr A/R would be left
      // with nothing to clear): void the refund first, exactly like QuickBooks.
      if ((await liveRefundCentsForCreditMemo(client, query.data.operating_company_id, params.data.id)) > 0) {
        return { code: 409 as const, error: "credit_memo_has_refunds", detail: "Void the refund of this credit memo first" };
      }

      // Reverse active applications before voiding (void-never-delete: mark voided_at on each)
      await client.query(
        `UPDATE accounting.credit_memo_applications
         SET voided_at = now(), voided_by_user_id = $2, voided_reason = $3
         WHERE credit_memo_id = $1 AND voided_at IS NULL`,
        [params.data.id, user.uuid, body.data.reason]
      );
      // Zero out applied amount and mark voided (mirrors credit_memos' own voided_at/voided_by_user_id/
      // void_reason columns, which vendor_credits does not have — set both the generic status AND the
      // dedicated void columns so nothing reading either shape is left stale). Belt-and-suspenders
      // alongside the row lock: WHERE status <> 'voided', matching payments.routes.ts's own pattern.
      const flipped = await client.query(
        `UPDATE accounting.credit_memos
         SET status = 'voided',
             amount_applied_cents = 0,
             voided_at = now(),
             voided_by_user_id = $2,
             void_reason = $3
         WHERE id = $1
           AND status <> 'voided'`,
        [params.data.id, user.uuid, body.data.reason]
      );
      if (flipped.rowCount === 0) return { code: 409 as const, error: "already_voided" };

      // ROUND 373.4 — void REVERSES the credit memo's posting through the engine, on this transaction (never a delete).
      // A credit memo that never posted (GL owned elsewhere — payment overpayment, Faro short-pay) has nothing to reverse.
      let reversalJeId: string | null = null;
      try {
        const rev = await reversePostedSourceTransactionInClientTx(
          client as never,
          { operating_company_id: query.data.operating_company_id, source_transaction_type: "credit_memo", source_transaction_id: params.data.id },
          { userId: user.uuid },
          companyBusinessDate()
        );
        reversalJeId = (rev as { journal_entry_id?: string | null })?.journal_entry_id ?? null;
      } catch (err) {
        if (!(err instanceof PostingEngineError && err.code === "SOURCE_NOT_FOUND")) throw err;
      }

      await appendCrudAudit(
        client,
        user.uuid,
        "accounting.credit_memos.voided",
        { resource_type: "accounting.credit_memos", resource_id: params.data.id, reason: body.data.reason, reversal_journal_entry_id: reversalJeId },
        "warning",
        "ACCT-F5606"
      );

      return { code: 200 as const, data: { ok: true } };
    });

    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    return reply.code(result.code).send(result.data);
  });

  // R-191 — universal unvoid counterpart to credit-memo /void.
  app.post("/api/v1/accounting/credit-memos/:id/unvoid", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canWriteCreditMemos(user.role)) return reply.code(403).send({ error: "forbidden" });

    const params = idParamSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = voidBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    try {
      const result = await reinstateDocumentThenVoidReversal(
        // ROUND 215.2 (verify-caller-scoped-guc-membership): withCompanyScope already asserts
        // membership and sets app.operating_company_id internally before running this callback
        // (accounting/shared.ts) -- the redundant manual set_config here re-set the SAME
        // already-verified value, but the guard's static scanner can't see that, and a future
        // edit could have changed one of the two copies without the other. Removed; nothing else
        // needs it.
        (fn) => withCompanyScope(user.uuid, query.data.operating_company_id, (client) => fn(client as never)),
        {
          operatingCompanyId: query.data.operating_company_id,
          type: "credit_memo",
          id: params.data.id,
          reason: body.data.reason,
          actor: { userId: String(user.uuid), role: String(user.role ?? "") },
        }
      );
      return reply.code(200).send({
        ok: true,
        reinstated_at: result.reinstatedAt,
        reinstated_from_void_je_id: result.reinstatedFromVoidJeId,
        status: result.restoreStatus,
      });
    } catch (error) {
      if (error instanceof ReinstateDocumentError) {
        const code = error.code.includes("not_found") ? 404 : error.code.includes("not_void") ? 409 : 400;
        return reply.code(code).send({ error: error.code, message: error.message });
      }
      throw error;
    }
  });
}
