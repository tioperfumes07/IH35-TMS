import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const accountIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const registerQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const transactionIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const categorizeBodySchema = z.object({
  action_type: z.enum([
    "create_expense",
    "apply_bill",
    "bill_payment",
    "transfer",
    "driver_settlement",
    "split_transaction",
    "factoring_advance",
    "manual_je",
  ]),
  linked_entity_id: z.string().uuid().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
});

const bulkCategorizeBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  transaction_ids: z.array(z.string().uuid()).min(1).max(200),
  action_type: categorizeBodySchema.shape.action_type,
});

const splitBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  lines: z
    .array(
      z.object({
        category: z.string().trim().min(1).max(120),
        amount: z.number(),
      })
    )
    .min(2),
});

const visibilityBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  accounts: z
    .array(
      z.object({
        id: z.string().uuid(),
        visible: z.boolean(),
        display_order: z.number().int().nonnegative(),
        tag: z.string().trim().max(60).optional(),
        is_dip: z.boolean().optional(),
      })
    )
    .max(200),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: {
    query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
  }) => Promise<T>
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${operatingCompanyId}'`);
    return fn(client);
  });
}

async function hasRelation(client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<{ ok: boolean }> }> }, rel: string) {
  const res = await client.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [rel]);
  return Boolean(res.rows[0]?.ok);
}

function virtualKind(accountId: string) {
  if (accountId === "00000000-0000-0000-0000-000000000059") return "factoring";
  if (accountId === "00000000-0000-0000-0000-000000000056") return "escrow";
  if (accountId === "00000000-0000-0000-0000-000000000060") return "advance_pool";
  return null;
}

export async function registerBankingRoutes(app: FastifyInstance) {
  app.get("/api/v1/banking/dashboard/kpis", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const payload = await withCompanyScope(user.uuid, companyId, async (client) => {
      const kpiRes = await client.query(
        `
          SELECT *
          FROM views.banking_dashboard_kpis
          WHERE operating_company_id = $1
          LIMIT 1
        `,
        [companyId]
      );
      const pendingBillsRes = await client
        .query<{ count: number }>(
          `
            SELECT COUNT(*)::int AS count
            FROM accounting.bills
            WHERE operating_company_id = $1
              AND status IN ('open','partially_paid')
          `,
          [companyId]
        )
        .catch(() => ({ rows: [{ count: 0 }] }));
      return {
        ...(kpiRes.rows[0] ?? {
          operating_company_id: companyId,
          total_cash: 0,
          total_dip_cash: 0,
          dip_operating: 0,
          dip_payroll: 0,
          factoring_reserve: 0,
          driver_escrow: 0,
          total_uncategorized: 0,
        }),
        pending_bills: Number(pendingBillsRes.rows[0]?.count ?? 0),
      };
    });
    return payload;
  });

  app.get("/api/v1/banking/account-tiles", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const tiles = await withCompanyScope(user.uuid, companyId, async (client) => {
      const res = await client.query(
        `
          SELECT *
          FROM views.banking_account_tiles
          WHERE operating_company_id = $1
          ORDER BY display_order, account_type, display_name
        `,
        [companyId]
      );
      return res.rows;
    });
    return { tiles };
  });

  app.get("/api/v1/banking/accounts/all", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const accounts = await withCompanyScope(user.uuid, companyId, async (client) => {
      if (!(await hasRelation(client, "banking.bank_accounts"))) return [];
      const res = await client.query(
        `
          SELECT *
          FROM banking.bank_accounts
          WHERE operating_company_id = $1
          ORDER BY display_order, display_name
        `,
        [companyId]
      );
      return res.rows;
    });
    return { accounts };
  });

  app.post("/api/v1/banking/accounts/visibility", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const body = visibilityBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const b = body.data;

    const updated = await withCompanyScope(user.uuid, b.operating_company_id, async (client) => {
      if (!(await hasRelation(client, "banking.bank_accounts"))) return [];
      const rows: Record<string, unknown>[] = [];
      for (const account of b.accounts) {
        const res = await client.query(
          `
            UPDATE banking.bank_accounts
            SET visible = $2,
                display_order = $3,
                tag = COALESCE($4, tag),
                is_dip = COALESCE($5, is_dip)
            WHERE id = $1
              AND operating_company_id = $6
            RETURNING *
          `,
          [account.id, account.visible, account.display_order, account.tag ?? null, account.is_dip ?? null, b.operating_company_id]
        );
        if ((res.rowCount ?? 0) > 0) rows.push(res.rows[0]);
      }
      return rows;
    });
    return { updated_accounts: updated };
  });

  app.get("/api/v1/banking/accounts/:id/register", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = accountIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = registerQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const q = query.data;

    const rows = await withCompanyScope(user.uuid, q.operating_company_id, async (client) => {
      const virtual = virtualKind(params.data.id);
      if (virtual === "factoring") {
        const res = await client
          .query(
            `
              SELECT
                fa.id,
                fa.created_at::date AS txn_date,
                COALESCE(fa.memo, fa.notes, 'Factoring activity') AS description,
                fa.advance_amount_cents AS amount,
                'virtual_factoring'::text AS category,
                'synced'::text AS status
              FROM accounting.factoring_advances fa
              WHERE fa.operating_company_id = $1
              ORDER BY fa.created_at DESC
              LIMIT $2 OFFSET $3
            `,
            [q.operating_company_id, q.limit, q.offset]
          )
          .catch(() => ({ rows: [] as Record<string, unknown>[] }));
        return res.rows;
      }
      if (virtual === "escrow") {
        const res = await client
          .query(
            `
              SELECT
                el.id,
                el.created_at::date AS txn_date,
                COALESCE(el.memo, el.entry_type, 'Escrow movement') AS description,
                el.amount,
                el.entry_type AS category,
                'synced'::text AS status
              FROM driver_finance.escrow_ledger el
              WHERE el.operating_company_id = $1
              ORDER BY el.created_at DESC
              LIMIT $2 OFFSET $3
            `,
            [q.operating_company_id, q.limit, q.offset]
          )
          .catch(() => ({ rows: [] as Record<string, unknown>[] }));
        return res.rows;
      }
      if (virtual === "advance_pool") {
        const res = await client
          .query(
            `
              SELECT
                da.id,
                da.created_at::date AS txn_date,
                COALESCE(da.memo, 'Cash advance outstanding') AS description,
                da.outstanding_balance AS amount,
                'cash_advance'::text AS category,
                'synced'::text AS status
              FROM driver_finance.driver_advances da
              WHERE da.operating_company_id = $1
                AND da.status = 'outstanding'
              ORDER BY da.created_at DESC
              LIMIT $2 OFFSET $3
            `,
            [q.operating_company_id, q.limit, q.offset]
          )
          .catch(() => ({ rows: [] as Record<string, unknown>[] }));
        return res.rows;
      }

      const res = await client
        .query(
          `
            SELECT
              bt.*,
              CASE WHEN bt.amount >= 0 THEN bt.amount ELSE 0 END AS deposits,
              CASE WHEN bt.amount < 0 THEN abs(bt.amount) ELSE 0 END AS withdrawals
            FROM banking.bank_transactions bt
            WHERE bt.operating_company_id = $1
              AND bt.account_id = $2
            ORDER BY bt.txn_date DESC, bt.created_at DESC
            LIMIT $3 OFFSET $4
          `,
          [q.operating_company_id, params.data.id, q.limit, q.offset]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      return res.rows;
    });
    return { register_rows: rows };
  });

  app.get("/api/v1/banking/transactions/uncategorized", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const rows = await withCompanyScope(user.uuid, companyId, async (client) => {
      const res = await client
        .query(
          `
            SELECT *
            FROM banking.bank_transactions
            WHERE operating_company_id = $1
              AND status = 'uncategorized'
            ORDER BY txn_date DESC, created_at DESC
            LIMIT 500
          `,
          [companyId]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      return res.rows;
    });
    return { transactions: rows };
  });

  app.get("/api/v1/banking/transactions/:id/suggestions", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = transactionIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const suggestions = await withCompanyScope(user.uuid, companyId, async (client) => {
      const targetRes = await client
        .query<{ description: string; amount: number }>(
          `
            SELECT description, amount
            FROM banking.bank_transactions
            WHERE id = $1
              AND operating_company_id = $2
            LIMIT 1
          `,
          [params.data.id, companyId]
        )
        .catch(() => ({ rows: [] as { description: string; amount: number }[] }));
      const target = targetRes.rows[0];
      if (!target) return [];
      const res = await client
        .query(
          `
            SELECT
              id,
              txn_date,
              description,
              amount,
              category,
              status
            FROM banking.bank_transactions
            WHERE operating_company_id = $1
              AND status <> 'uncategorized'
              AND abs(amount - $2) <= 5
              AND description ILIKE $3
            ORDER BY txn_date DESC
            LIMIT 3
          `,
          [companyId, Number(target.amount ?? 0), `%${String(target.description ?? "").slice(0, 18)}%`]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      return res.rows;
    });
    return { suggestions };
  });

  app.post("/api/v1/banking/transactions/:id/categorize", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = transactionIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = categorizeBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const companyId = query.data.operating_company_id;

    const result = await withCompanyScope(user.uuid, companyId, async (client) => {
      const txnRes = await client.query<{ id: string; status: string; amount: number; description: string }>(
        `
          SELECT id, status, amount, description
          FROM banking.bank_transactions
          WHERE id = $1
            AND operating_company_id = $2
          LIMIT 1
        `,
        [params.data.id, companyId]
      ).catch(() => ({ rows: [] as { id: string; status: string; amount: number; description: string }[] }));
      const txn = txnRes.rows[0];
      if (!txn) return { error: "not_found" as const };
      if (txn.status !== "uncategorized") return { error: "already_categorized" as const };

      // Single-link guard (WF-012): one action at a time per transaction.
      await client.query(
        `
          UPDATE banking.bank_transactions
          SET category = $2,
              status = 'categorized',
              linked_entity_id = $3,
              updated_at = now()
          WHERE id = $1
        `,
        [params.data.id, body.data.action_type, body.data.linked_entity_id ?? null]
      ).catch(async () => {
        await client.query(
          `
            UPDATE banking.bank_transactions
            SET category = $2,
                status = 'categorized',
                updated_at = now()
            WHERE id = $1
          `,
          [params.data.id, body.data.action_type]
        );
      });

      await appendCrudAudit(
        client,
        user.uuid,
        "banking.transaction.categorized",
        {
          resource_type: "banking.bank_transactions",
          resource_id: params.data.id,
          operating_company_id: companyId,
          action_type: body.data.action_type,
          linked_entity_uuid: body.data.linked_entity_id ?? null,
          payload: body.data.payload,
        },
        "info",
        "BT-3-BANKING-REBUILD"
      );
      return { ok: true as const };
    });

    if ("error" in result) {
      if (result.error === "not_found") return reply.code(404).send({ error: "transaction_not_found" });
      return reply.code(409).send({ error: "transaction_already_categorized" });
    }
    return result;
  });

  app.post("/api/v1/banking/transactions/bulk-categorize", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const body = bulkCategorizeBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const b = body.data;

    const updatedCount = await withCompanyScope(user.uuid, b.operating_company_id, async (client) => {
      let count = 0;
      for (const id of b.transaction_ids) {
        const res = await client.query(
          `
            UPDATE banking.bank_transactions
            SET category = $2,
                status = 'categorized',
                updated_at = now()
            WHERE id = $1
              AND operating_company_id = $3
              AND status = 'uncategorized'
          `,
          [id, b.action_type, b.operating_company_id]
        ).catch(() => ({ rowCount: 0 }));
        count += Number(res.rowCount ?? 0);
      }
      return count;
    });
    return { updated_count: updatedCount };
  });

  app.post("/api/v1/banking/transactions/:id/split", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = transactionIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = splitBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const total = body.data.lines.reduce((sum, line) => sum + Number(line.amount), 0);
    const result = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const txnRes = await client.query<{ amount: number; status: string }>(
        `
          SELECT amount, status
          FROM banking.bank_transactions
          WHERE id = $1
            AND operating_company_id = $2
          LIMIT 1
        `,
        [params.data.id, body.data.operating_company_id]
      ).catch(() => ({ rows: [] as { amount: number; status: string }[] }));
      const txn = txnRes.rows[0];
      if (!txn) return { error: "not_found" as const };
      if (txn.status !== "uncategorized") return { error: "already_categorized" as const };
      if (Math.abs(Number(txn.amount) - total) > 0.01) return { error: "split_mismatch" as const };

      await client.query(
        `
          UPDATE banking.bank_transactions
          SET category = 'split_transaction',
              status = 'categorized',
              updated_at = now()
          WHERE id = $1
        `,
        [params.data.id]
      ).catch(() => {});
      return { ok: true as const };
    });
    if ("error" in result) {
      if (result.error === "not_found") return reply.code(404).send({ error: "transaction_not_found" });
      if (result.error === "split_mismatch") return reply.code(400).send({ error: "split_total_must_equal_transaction_amount" });
      return reply.code(409).send({ error: "transaction_already_categorized" });
    }
    return result;
  });

  app.post("/api/v1/banking/transactions/:id/undo-categorization", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = transactionIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const ok = await withCompanyScope(user.uuid, companyId, async (client) => {
      const res = await client.query(
        `
          UPDATE banking.bank_transactions
          SET status = 'uncategorized',
              category = NULL,
              linked_entity_id = NULL,
              updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2
          RETURNING id
        `,
        [params.data.id, companyId]
      ).catch(() => ({ rows: [] as { id: string }[] }));
      if (!res.rows[0]) return false;
      await appendCrudAudit(
        client,
        user.uuid,
        "banking.transaction.reclassified",
        {
          resource_type: "banking.bank_transactions",
          resource_id: params.data.id,
          operating_company_id: companyId,
        },
        "info",
        "BT-3-BANKING-REBUILD"
      );
      return true;
    });
    if (!ok) return reply.code(404).send({ error: "transaction_not_found" });
    return { ok: true };
  });
}
