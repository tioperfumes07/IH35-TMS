import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser, withLuciaBypass } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { createLinkToken, exchangePublicToken } from "./plaid.service.js";
import { getPlaidClient } from "./plaid-client.js";

const ownerAdminRoles = new Set(["Owner", "Administrator"]);
const ownerOnlyRoles = new Set(["Owner"]);

const companyBodySchema = z.object({
  operating_company_id: z.string().uuid(),
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

    const body = companyBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const token = await createLinkToken(user.uuid, body.data.operating_company_id);
    return { link_token: token.link_token, expiration: token.expiration };
  });

  app.post("/api/v1/banking/plaid/exchange-public-token", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!ensureRole(reply, user.role, ownerAdminRoles)) return;

    const body = exchangeBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const exchanged = await exchangePublicToken(body.data.public_token, body.data.operating_company_id, user.uuid);
    const accounts = await loadBankAccountsByIds(exchanged.bankAccountIds, body.data.operating_company_id);
    return { accounts };
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
            account_mask,
            current_balance_cents,
            available_balance_cents,
            currency_code,
            sync_status,
            is_active,
            last_synced_at,
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
}

