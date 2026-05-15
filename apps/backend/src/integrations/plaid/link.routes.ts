import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser, withLuciaBypass } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { createLinkToken, createUpdateModeLinkToken, exchangePublicToken } from "./plaid.service.js";
import { getPlaidClient } from "./plaid-client.js";

const ownerAdminRoles = new Set(["Owner", "Administrator"]);
const ownerOnlyRoles = new Set(["Owner"]);

const companyBodySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const linkTokenBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  accountType: z.enum(["bank", "credit_card", "all"]).optional(),
});

const linkTokenQuerySchema = z.object({
  accountType: z.enum(["bank", "credit_card", "all"]).optional(),
});

const exchangeBodySchema = z.object({
  public_token: z.string().trim().min(1),
  operating_company_id: z.string().uuid(),
});

const accountParamsSchema = z.object({
  id: z.string().uuid(),
});

const accountQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const transactionsQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  start_date: z.string().date().optional(),
  end_date: z.string().date().optional(),
});

const companyTransactionsQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(500).default(150),
  offset: z.coerce.number().int().min(0).default(0),
  q: z.string().trim().min(1).optional(),
  bank_account_id: z.string().uuid().optional(),
  sort: z.enum(["date_desc", "date_asc", "amount_desc", "amount_asc"]).default("date_desc"),
});

const updateLinkBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  plaid_item_id: z.string().trim().min(3),
});

const itemDisconnectBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  plaid_item_id: z.string().trim().min(3),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function ensureRole(reply: FastifyReply, role: string, allowedRoles: Set<string>) {
  if (!allowedRoles.has(role)) {
    reply.code(403).send({ error: "forbidden" });
    return false;
  }
  return true;
}

async function withCompanyScope<T>(userId: string, operatingCompanyId: string, fn: (client: { query: <R>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }> }) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    return fn(client);
  });
}

async function loadBankAccountsByIds(ids: string[], operatingCompanyId: string) {
  if (ids.length === 0) return [];
  return withLuciaBypass(async (client) => {
    const res = await client.query(
      `
        SELECT
          id,
          operating_company_id,
          institution_name,
          account_name,
          account_type,
          account_class,
          account_mask,
          current_balance_cents,
          available_balance_cents,
          currency_code,
          sync_status,
          is_active,
          last_synced_at
        FROM banking.bank_accounts
        WHERE operating_company_id = $1
          AND id = ANY($2::uuid[])
      `,
      [operatingCompanyId, ids]
    );
    return res.rows;
  });
}

export async function registerPlaidLinkRoutes(app: FastifyInstance) {
  app.post("/api/v1/banking/plaid/create-link-token", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!ensureRole(reply, user.role, ownerAdminRoles)) return;

    const body = linkTokenBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const query = linkTokenQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const accountType = body.data.accountType ?? query.data.accountType;

    const token = await createLinkToken(user.uuid, body.data.operating_company_id, accountType);
    return {
      link_token: token.link_token,
      expiration: token.expiration,
      accountType: token.accountType,
      products: token.products,
      account_filters: token.account_filters,
    };
  });

  app.post("/api/v1/banking/plaid/exchange-public-token", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!ensureRole(reply, user.role, ownerAdminRoles)) return;

    const body = exchangeBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const exchanged = await exchangePublicToken(body.data.public_token, body.data.operating_company_id, user.uuid);
    const accounts = await loadBankAccountsByIds(exchanged.bankAccountIds, body.data.operating_company_id);
    return { accounts, plaid_item_id: exchanged.item_id };
  });

  app.get("/api/v1/banking/plaid/accounts", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const query = accountQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const accounts = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT
            id,
            operating_company_id,
            institution_name,
            account_name,
            account_type,
            account_class,
            account_mask,
            current_balance_cents,
            available_balance_cents,
            currency_code,
            sync_status,
            is_active,
            last_synced_at,
            plaid_item_id,
            created_at,
            updated_at
          FROM banking.bank_accounts
          WHERE operating_company_id = $1
            AND deactivated_at IS NULL
          ORDER BY institution_name NULLS LAST, account_name NULLS LAST, created_at DESC
        `,
        [query.data.operating_company_id]
      );
      return res.rows;
    });

    return { accounts };
  });

  app.get("/api/v1/banking/plaid/accounts/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const params = accountParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = accountQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const account = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT
            id,
            operating_company_id,
            institution_name,
            account_name,
            account_type,
            account_mask,
            current_balance_cents,
            available_balance_cents,
            currency_code,
            sync_status,
            is_active,
            last_synced_at,
            plaid_item_id,
            created_at,
            updated_at
          FROM banking.bank_accounts
          WHERE id = $1
            AND operating_company_id = $2
          LIMIT 1
        `,
        [params.data.id, query.data.operating_company_id]
      );
      return res.rows[0] ?? null;
    });

    if (!account) return reply.code(404).send({ error: "bank_account_not_found" });
    return { account };
  });

  app.get("/api/v1/banking/plaid/accounts/:id/transactions", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const params = accountParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = transactionsQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const predicates: string[] = ["bt.bank_account_id = $1", "bt.operating_company_id = $2"];
      const values: unknown[] = [params.data.id, query.data.operating_company_id];
      let index = values.length + 1;

      if (query.data.start_date) {
        predicates.push(`bt.transaction_date >= $${index++}`);
        values.push(query.data.start_date);
      }
      if (query.data.end_date) {
        predicates.push(`bt.transaction_date <= $${index++}`);
        values.push(query.data.end_date);
      }

      values.push(query.data.limit, query.data.offset);
      const limitIdx = values.length - 1;
      const offsetIdx = values.length;

      const sql = `
        SELECT
          bt.id,
          bt.transaction_date,
          bt.posted_date,
          bt.amount_cents,
          bt.description,
          bt.merchant_name,
          bt.plaid_category,
          bt.pending,
          bt.is_credit,
          bt.matched_load_id,
          bt.matched_bill_id,
          bt.matched_settlement_id,
          bt.notes,
          bt.created_at
        FROM banking.bank_transactions bt
        WHERE ${predicates.join(" AND ")}
        ORDER BY bt.transaction_date DESC, bt.created_at DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `;
      const res = await client.query(sql, values);
      return res.rows;
    });

    return { transactions: rows };
  });

  app.post("/api/v1/banking/plaid/accounts/:id/disconnect", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!ensureRole(reply, user.role, ownerOnlyRoles)) return;

    const params = accountParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = companyBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const result = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const accountRes = await client.query<{ id: string; plaid_item_id: string | null }>(
        `
          SELECT id, plaid_item_id
          FROM banking.bank_accounts
          WHERE id = $1
            AND operating_company_id = $2
          LIMIT 1
        `,
        [params.data.id, body.data.operating_company_id]
      );
      const account = accountRes.rows[0];
      if (!account) return null;

      if (account.plaid_item_id) {
        const tokenRes = await client.query<{ plaid_access_token: string | null }>(
          `
            SELECT plaid_access_token
            FROM banking.bank_accounts
            WHERE plaid_item_id = $1
              AND operating_company_id = $2
              AND plaid_access_token IS NOT NULL
            LIMIT 1
          `,
          [account.plaid_item_id, body.data.operating_company_id]
        );
        const accessToken = tokenRes.rows[0]?.plaid_access_token ?? null;
        if (accessToken) {
          try {
            const plaid = getPlaidClient();
            await plaid.itemRemove({ access_token: accessToken });
          } catch {
            // Continue local deactivation even if Plaid revoke fails.
          }
        }
      }

      const update = await client.query<{ id: string }>(
        `
          UPDATE banking.bank_accounts
          SET
            is_active = false,
            sync_status = 'disconnected',
            deactivated_at = now(),
            plaid_access_token = NULL,
            updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2
          RETURNING id
        `,
        [params.data.id, body.data.operating_company_id]
      );
      const updated = update.rows[0] ?? null;
      if (!updated) return null;

      await appendCrudAudit(
        client,
        user.uuid,
        "banking.bank_account.deactivated",
        {
          resource_type: "banking.bank_accounts",
          resource_id: updated.id,
          operating_company_id: body.data.operating_company_id,
        },
        "warning",
        "P5-T1.3-PLAID"
      );
      return updated;
    });

    if (!result) return reply.code(404).send({ error: "bank_account_not_found" });
    return { ok: true, id: result.id };
  });

  app.post("/api/v1/banking/plaid/create-update-link-token", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!ensureRole(reply, user.role, ownerAdminRoles)) return;

    const body = updateLinkBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    try {
      const token = await createUpdateModeLinkToken(user.uuid, body.data.operating_company_id, body.data.plaid_item_id);
      return { link_token: token.link_token, expiration: token.expiration };
    } catch (err) {
      return reply.code(400).send({ error: "plaid_update_token_failed", message: String((err as Error).message) });
    }
  });

  app.post("/api/v1/banking/plaid/items/disconnect", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!ensureRole(reply, user.role, ownerOnlyRoles)) return;

    const body = itemDisconnectBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const result = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const tokenRes = await client.query<{ plaid_access_token: string | null }>(
        `
          SELECT plaid_access_token
          FROM banking.bank_accounts
          WHERE plaid_item_id = $1
            AND operating_company_id = $2
            AND plaid_access_token IS NOT NULL
          LIMIT 1
        `,
        [body.data.plaid_item_id, body.data.operating_company_id]
      );
      const accessToken = tokenRes.rows[0]?.plaid_access_token ?? null;
      if (accessToken) {
        try {
          const plaid = getPlaidClient();
          await plaid.itemRemove({ access_token: accessToken });
        } catch {
          /* continue */
        }
      }

      const updated = await client.query<{ id: string }>(
        `
          UPDATE banking.bank_accounts
          SET
            is_active = false,
            sync_status = 'disconnected',
            deactivated_at = now(),
            plaid_access_token = NULL,
            updated_at = now()
          WHERE plaid_item_id = $1
            AND operating_company_id = $2
          RETURNING id
        `,
        [body.data.plaid_item_id, body.data.operating_company_id]
      );

      if (updated.rows.length === 0) return null;

      await appendCrudAudit(
        client,
        user.uuid,
        "banking.plaid.item_disconnected",
        {
          resource_type: "banking.plaid_item",
          plaid_item_id: body.data.plaid_item_id,
          operating_company_id: body.data.operating_company_id,
          accounts_affected: updated.rows.length,
        },
        "warning",
        "P5-T1.3-PLAID"
      );

      return { count: updated.rows.length };
    });

    if (!result) return reply.code(404).send({ error: "plaid_item_not_found" });
    return { ok: true, deactivated_accounts: result.count };
  });

  app.get("/api/v1/banking/plaid/company-transactions", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const query = companyTransactionsQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const sortSql =
      query.data.sort === "date_asc"
        ? "bt.transaction_date ASC, bt.created_at ASC"
        : query.data.sort === "amount_desc"
          ? "bt.amount_cents DESC, bt.transaction_date DESC"
          : query.data.sort === "amount_asc"
            ? "bt.amount_cents ASC, bt.transaction_date DESC"
            : "bt.transaction_date DESC, bt.created_at DESC";

    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const predicates: string[] = ["bt.operating_company_id = $1"];
      const values: unknown[] = [query.data.operating_company_id];
      let idx = 2;
      if (query.data.bank_account_id) {
        predicates.push(`bt.bank_account_id = $${idx++}`);
        values.push(query.data.bank_account_id);
      }
      if (query.data.q) {
        predicates.push(`(bt.description ILIKE $${idx} OR bt.merchant_name ILIKE $${idx})`);
        values.push(`%${query.data.q}%`);
        idx++;
      }
      values.push(query.data.limit, query.data.offset);
      const limitIdx = values.length - 1;
      const offsetIdx = values.length;

      const sql = `
        SELECT
          bt.id,
          bt.bank_account_id,
          bt.transaction_date,
          bt.posted_date,
          bt.amount_cents,
          bt.description,
          bt.merchant_name,
          bt.plaid_category,
          bt.pending,
          bt.is_credit,
          bt.matched_load_id,
          bt.matched_bill_id,
          bt.matched_settlement_id,
          bt.notes,
          bt.created_at,
          ba.institution_name,
          ba.account_name,
          ba.account_mask,
          CASE
            WHEN bt.matched_load_id IS NOT NULL THEN 'load'
            WHEN bt.matched_settlement_id IS NOT NULL THEN 'settlement'
            WHEN bt.matched_bill_id IS NOT NULL THEN 'bill'
            ELSE NULL
          END AS matched_kind
        FROM banking.bank_transactions bt
        JOIN banking.bank_accounts ba ON ba.id = bt.bank_account_id
        WHERE ${predicates.join(" AND ")}
        ORDER BY ${sortSql}
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `;
      const res = await client.query(sql, values);
      return res.rows;
    });

    return { transactions: rows };
  });
}
