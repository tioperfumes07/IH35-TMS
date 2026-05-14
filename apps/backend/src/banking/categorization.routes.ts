import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { enqueueAccountingOutbox } from "../accounting/outbox-events.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";

const transactionIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const uncategorizedQuerySchema = companyQuerySchema.extend({
  bank_account_id: z.string().uuid().optional(),
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
  amount_min_cents: z.coerce.number().int().optional(),
  amount_max_cents: z.coerce.number().int().optional(),
  search: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const categorizeBodySchema = z.object({
  category_kind: z.string().trim().min(1).max(120),
  customer_id: z.string().uuid().optional(),
  vendor_id: z.string().uuid().optional(),
  gl_account_id: z.string().uuid().optional(),
  project_id: z.string().uuid().optional(),
  memo: z.string().trim().max(4000).optional(),
  suggested_match_invoice_id: z.string().uuid().optional(),
  suggested_match_bill_id: z.string().uuid().optional(),
});

const bulkCategorizeBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  transaction_ids: z.array(z.string().uuid()).min(1).max(500),
  category_kind: z.string().trim().min(1).max(120),
  gl_account_id: z.string().uuid().optional(),
});

const transferBodySchema = z.object({
  destination_bank_account_id: z.string().uuid(),
  transfer_kind: z.enum(["in", "out"]),
  paired_transaction_id: z.string().uuid().optional(),
});

const skipBodySchema = z.object({
  reason: z.string().trim().min(1).max(2000),
});

const investigateBodySchema = z.object({
  note: z.string().trim().min(1).max(4000),
});

function pendingStatusesSql(): string {
  return `(bt.status = 'pending_categorization' OR bt.status = 'uncategorized')`;
}

export async function registerBankTxCategorizationRoutes(app: FastifyInstance) {
  app.get("/api/v1/banking/transactions/uncategorized", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const parsed = uncategorizedQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const q = parsed.data;

    const payload = await withCompanyScope(user.uuid, q.operating_company_id, async (client) => {
      const where: string[] = [`bt.operating_company_id = $1`, pendingStatusesSql()];
      const values: unknown[] = [q.operating_company_id];

      if (q.bank_account_id) {
        values.push(q.bank_account_id);
        where.push(`bt.bank_account_id = $${values.length}`);
      }
      if (q.date_from) {
        values.push(q.date_from);
        where.push(`bt.transaction_date >= $${values.length}::date`);
      }
      if (q.date_to) {
        values.push(q.date_to);
        where.push(`bt.transaction_date <= $${values.length}::date`);
      }
      if (q.amount_min_cents !== undefined) {
        values.push(q.amount_min_cents);
        where.push(`bt.amount_cents >= $${values.length}`);
      }
      if (q.amount_max_cents !== undefined) {
        values.push(q.amount_max_cents);
        where.push(`bt.amount_cents <= $${values.length}`);
      }
      if (q.search) {
        values.push(`%${q.search}%`);
        const idx = values.length;
        where.push(`(bt.description ILIKE $${idx} OR bt.merchant_name ILIKE $${idx} OR bt.notes ILIKE $${idx})`);
      }

      const whereSql = where.join(" AND ");

      const totalsRes = await client.query(
        `
          SELECT
            COUNT(*)::text AS total_count,
            COALESCE(SUM(ABS(bt.amount_cents)), 0)::text AS total_uncategorized_cents
          FROM banking.bank_transactions bt
          WHERE ${whereSql}
        `,
        values
      );

      values.push(q.limit, q.offset);
      const limitIdx = values.length - 1;
      const offsetIdx = values.length;

      const rowsRes = await client.query(
        `
          SELECT
            bt.*
          FROM banking.bank_transactions bt
          WHERE ${whereSql}
          ORDER BY bt.transaction_date DESC, bt.created_at DESC
          LIMIT $${limitIdx}
          OFFSET $${offsetIdx}
        `,
        values
      );

      return {
        rows: rowsRes.rows,
        total_count: Number(totalsRes.rows[0]?.total_count ?? 0),
        total_uncategorized_cents: Number(totalsRes.rows[0]?.total_uncategorized_cents ?? 0),
      };
    });

    return payload;
  });

  app.post("/api/v1/banking/transactions/:id/categorize", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const params = transactionIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = categorizeBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const companyId = query.data.operating_company_id;

    const result = await withCompanyScope(user.uuid, companyId, async (client) => {
      const txnRes = await client.query(
        `
          SELECT id, status
          FROM banking.bank_transactions
          WHERE id = $1
            AND operating_company_id = $2
          LIMIT 1
        `,
        [params.data.id, companyId]
      );
      const txn = txnRes.rows[0] as { id: string; status: string | null } | undefined;
      if (!txn) return { code: 404 as const, error: "transaction_not_found" };
      const st = String(txn.status ?? "");
      if (st !== "pending_categorization" && st !== "uncategorized") {
        return { code: 409 as const, error: "transaction_not_pending_categorization" };
      }

      const linked = body.data.customer_id ?? body.data.vendor_id ?? body.data.project_id ?? null;

      await client.query(
        `
          UPDATE banking.bank_transactions
          SET
            status = 'categorized',
            category = $2,
            category_kind = $2,
            categorization_customer_id = $3,
            categorization_vendor_id = $4,
            categorization_gl_account_id = $5,
            categorization_project_id = $6,
            categorization_memo = $7,
            suggested_match_invoice_id = $8,
            suggested_match_bill_id = $9,
            coa_account_id = COALESCE($10, coa_account_id),
            linked_entity_id = COALESCE($11, linked_entity_id),
            skip_reason = NULL,
            investigate_note = NULL,
            categorized_at = now(),
            updated_at = now()
          WHERE id = $1
            AND operating_company_id = $12
        `,
        [
          params.data.id,
          body.data.category_kind,
          body.data.customer_id ?? null,
          body.data.vendor_id ?? null,
          body.data.gl_account_id ?? null,
          body.data.project_id ?? null,
          body.data.memo ?? null,
          body.data.suggested_match_invoice_id ?? null,
          body.data.suggested_match_bill_id ?? null,
          body.data.gl_account_id ?? null,
          linked,
          companyId,
        ]
      );

      await enqueueAccountingOutbox(client, companyId, "qbo.bank_transaction.categorized", "bank_transaction", params.data.id, {
        bank_transaction_id: params.data.id,
        category_kind: body.data.category_kind,
        customer_id: body.data.customer_id ?? null,
        vendor_id: body.data.vendor_id ?? null,
        gl_account_id: body.data.gl_account_id ?? null,
      });

      await appendCrudAudit(
        client,
        user.uuid,
        "banking.transaction.categorized.p6_t11204",
        {
          resource_type: "banking.bank_transactions",
          resource_id: params.data.id,
          operating_company_id: companyId,
          category_kind: body.data.category_kind,
        },
        "info",
        "P6-T11204-BANK-TX"
      );

      return { code: 200 as const, data: { ok: true } };
    });

    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    return result.data;
  });

  app.post("/api/v1/banking/transactions/categorize-bulk", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const body = bulkCategorizeBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const result = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      let categorized = 0;
      const errors: Array<{ transaction_id: string; error: string }> = [];

      for (const id of body.data.transaction_ids) {
        try {
          const res = await client.query(
            `
              UPDATE banking.bank_transactions
              SET
                status = 'categorized',
                category = $2,
                category_kind = $2,
                categorization_gl_account_id = COALESCE($3, categorization_gl_account_id),
                coa_account_id = COALESCE($3, coa_account_id),
                categorized_at = now(),
                updated_at = now(),
                skip_reason = NULL,
                investigate_note = NULL
              WHERE id = $1
                AND operating_company_id = $4
                AND (status = 'pending_categorization' OR status = 'uncategorized')
              RETURNING id
            `,
            [id, body.data.category_kind, body.data.gl_account_id ?? null, body.data.operating_company_id]
          );
          if (!res.rows[0]) {
            errors.push({ transaction_id: id, error: "not_pending_or_missing" });
            continue;
          }
          categorized += 1;
          await enqueueAccountingOutbox(
            client,
            body.data.operating_company_id,
            "qbo.bank_transaction.categorized",
            "bank_transaction",
            id,
            {
              bank_transaction_id: id,
              category_kind: body.data.category_kind,
              bulk: true,
            }
          );
        } catch (e) {
          errors.push({ transaction_id: id, error: String((e as Error)?.message ?? "update_failed") });
        }
      }

      return { categorized_count: categorized, errors };
    });

    return result;
  });

  app.post("/api/v1/banking/transactions/:id/transfer", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const params = transactionIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = transferBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const companyId = query.data.operating_company_id;

    const result = await withCompanyScope(user.uuid, companyId, async (client) => {
      const txnRes = await client.query(
        `
          SELECT status
          FROM banking.bank_transactions
          WHERE id = $1 AND operating_company_id = $2
          LIMIT 1
        `,
        [params.data.id, companyId]
      );
      const txn = txnRes.rows[0] as { status: string | null } | undefined;
      if (!txn) return { code: 404 as const, error: "transaction_not_found" };
      const st = String(txn.status ?? "");
      if (st !== "pending_categorization" && st !== "uncategorized") {
        return { code: 409 as const, error: "transaction_not_pending_categorization" };
      }

      await client.query(
        `
          UPDATE banking.bank_transactions
          SET
            status = 'transfer',
            category = 'transfer',
            category_kind = 'transfer',
            destination_bank_account_id = $2,
            transfer_kind = $3,
            paired_transaction_id = $4,
            categorized_at = now(),
            updated_at = now(),
            skip_reason = NULL,
            investigate_note = NULL
          WHERE id = $1
            AND operating_company_id = $5
        `,
        [params.data.id, body.data.destination_bank_account_id, body.data.transfer_kind, body.data.paired_transaction_id ?? null, companyId]
      );

      if (body.data.paired_transaction_id) {
        await client.query(
          `
            UPDATE banking.bank_transactions
            SET
              status = 'transfer',
              category = 'transfer',
              category_kind = 'transfer',
              paired_transaction_id = $1,
              categorized_at = now(),
              updated_at = now()
            WHERE id = $2
              AND operating_company_id = $3
          `,
          [params.data.id, body.data.paired_transaction_id, companyId]
        );
      }

      await enqueueAccountingOutbox(client, companyId, "qbo.bank_transaction.categorized", "bank_transaction", params.data.id, {
        bank_transaction_id: params.data.id,
        category_kind: "transfer",
        transfer_kind: body.data.transfer_kind,
        paired_transaction_id: body.data.paired_transaction_id ?? null,
      });

      await appendCrudAudit(client, user.uuid, "banking.transaction.transfer.p6_t11204", {
        resource_type: "banking.bank_transactions",
        resource_id: params.data.id,
        operating_company_id: companyId,
      });

      return { code: 200 as const, data: { ok: true } };
    });

    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    return result.data;
  });

  app.post("/api/v1/banking/transactions/:id/skip", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const params = transactionIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = skipBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const companyId = query.data.operating_company_id;

    const res = await withCompanyScope(user.uuid, companyId, async (client) => {
      const upd = await client.query(
        `
          UPDATE banking.bank_transactions
          SET
            status = 'skipped',
            category = 'skipped',
            skip_reason = $3,
            categorized_at = now(),
            updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2
            AND (status = 'pending_categorization' OR status = 'uncategorized')
          RETURNING id
        `,
        [params.data.id, companyId, body.data.reason]
      );
      if (!upd.rows[0]) return { ok: false as const };
      await appendCrudAudit(client, user.uuid, "banking.transaction.skipped.p6_t11204", {
        resource_type: "banking.bank_transactions",
        resource_id: params.data.id,
        operating_company_id: companyId,
      });
      return { ok: true as const };
    });

    if (!res.ok) return reply.code(404).send({ error: "transaction_not_found" });
    return { ok: true };
  });

  app.post("/api/v1/banking/transactions/:id/investigate", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const params = transactionIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = investigateBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const companyId = query.data.operating_company_id;

    const res = await withCompanyScope(user.uuid, companyId, async (client) => {
      const upd = await client.query(
        `
          UPDATE banking.bank_transactions
          SET
            status = 'investigating',
            category = 'investigating',
            investigate_note = $3,
            updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2
            AND (status = 'pending_categorization' OR status = 'uncategorized')
          RETURNING id
        `,
        [params.data.id, companyId, body.data.note]
      );
      if (!upd.rows[0]) return { ok: false as const };
      await appendCrudAudit(client, user.uuid, "banking.transaction.investigating.p6_t11204", {
        resource_type: "banking.bank_transactions",
        resource_id: params.data.id,
        operating_company_id: companyId,
      });
      return { ok: true as const };
    });

    if (!res.ok) return reply.code(404).send({ error: "transaction_not_found" });
    return { ok: true };
  });
}
