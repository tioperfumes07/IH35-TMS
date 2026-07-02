import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { countPendingBills } from "../kpi/canonical-kpis.js";
import { countDriverEscrowKpis } from "./driver-escrow-counts.js";
import { countUncategorizedTransactions } from "./pending-categorization.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const accountsAllQuerySchema = companyQuerySchema.extend({
  include_inactive: z.coerce.boolean().optional().default(false),
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
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [operatingCompanyId]);
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
          WITH tiles AS (
            SELECT t.*
            FROM views.banking_account_tiles t
            WHERE t.operating_company_id = $1
              AND (
                t.tile_kind <> 'real'
                OR EXISTS (
                  SELECT 1 FROM banking.bank_accounts b
                  WHERE b.id = t.id AND b.is_active = true
                )
              )
          )
          SELECT
            $1::uuid AS operating_company_id,
            COALESCE(SUM(CASE WHEN tile_kind = 'real' THEN current_balance ELSE 0 END), 0) AS total_cash,
            COALESCE(SUM(CASE WHEN tag IN ('DIP Operating','DIP Payroll','DIP Other') THEN current_balance ELSE 0 END), 0) AS total_dip_cash,
            COALESCE(SUM(CASE WHEN tag = 'DIP Operating' THEN current_balance ELSE 0 END), 0) AS dip_operating,
            COALESCE(SUM(CASE WHEN tag = 'DIP Payroll' THEN current_balance ELSE 0 END), 0) AS dip_payroll,
            COALESCE(SUM(CASE WHEN tag = 'Factoring' THEN current_balance ELSE 0 END), 0) AS factoring_reserve,
            COALESCE(SUM(CASE WHEN tag = 'Escrow' THEN current_balance ELSE 0 END), 0) AS driver_escrow,
            COALESCE(SUM(uncategorized_count), 0) AS total_uncategorized
          FROM tiles
        `,
        [companyId]
      );
      const pendingBills = await countPendingBills(client, companyId).catch(() => 0);
      const escrowCounts = await countDriverEscrowKpis(client, companyId).catch(() => ({
        active_drivers: 0,
        drivers_with_escrow_balance: 0,
        drivers_with_active_escrow_account: 0,
      }));
      // total_cash must read the AUTHORITATIVE depository balances (same source as
      // /banking/accounts/all and the cash-flow opening), not the tile view — the tile-derived
      // total_cash returned 0 while accounts/all showed real cash, a reconciliation bug. All three
      // cash surfaces now agree on banking.bank_accounts.current_balance_cents (account_class='depository').
      const cashRes = await client
        .query<{ total_cash: string | number | null }>(
          `
          SELECT COALESCE(SUM(current_balance_cents), 0)::bigint AS total_cash
          FROM banking.bank_accounts
          WHERE operating_company_id = $1
            AND account_class = 'depository'
            AND is_active = true
          `,
          [companyId]
        )
        .catch(() => ({ rows: [{ total_cash: 0 }] }));
      const authoritativeTotalCash = Number(cashRes.rows[0]?.total_cash ?? 0);
      // BANKING-1: the UNCATEGORIZED headline must count the SAME population the Transactions
      // "For review" queue lists — entity-scoped status IN ('pending_categorization','uncategorized')
      // across all accounts. The tile view's uncategorized_count counts only 'uncategorized', so it
      // read 0 while ~2,650 CSV-imported 'pending_categorization' rows sat in the queue. One shared
      // count (pending-categorization.ts) now feeds both so they can never diverge.
      const uncategorizedCount = await countUncategorizedTransactions(client, companyId).catch(() =>
        Number(kpiRes.rows[0]?.total_uncategorized ?? 0)
      );
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
        total_cash: authoritativeTotalCash,
        total_uncategorized: uncategorizedCount,
        pending_bills: pendingBills,
        ...escrowCounts,
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
          SELECT t.*
          FROM views.banking_account_tiles t
          WHERE t.operating_company_id = $1
            AND (
              t.tile_kind <> 'real'
              OR EXISTS (
                SELECT 1 FROM banking.bank_accounts b
                WHERE b.id = t.id AND b.is_active = true
              )
            )
          ORDER BY t.display_order, t.account_type, t.display_name
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
    const query = accountsAllQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;
    const includeInactive = query.data.include_inactive;

    const accounts = await withCompanyScope(user.uuid, companyId, async (client) => {
      if (!(await hasRelation(client, "banking.bank_accounts"))) return [];
      const activeClause = includeInactive ? "" : " AND is_active = true";
      const res = await client.query(
        `
          SELECT *
          FROM banking.bank_accounts
          WHERE operating_company_id = $1
          ${activeClause}
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
              -- amount_cents is stored SIGNED on the Plaid convention: NEGATIVE = money IN (deposit),
              -- POSITIVE = money OUT (withdrawal). The register previously mapped >=0 -> deposits, which
              -- SWAPPED the two columns (a deposit showed under Withdrawals). Corrected to match the sign.
              CASE WHEN bt.amount_cents < 0 THEN abs(bt.amount_cents)::numeric / 100 ELSE 0 END AS deposits,
              CASE WHEN bt.amount_cents > 0 THEN bt.amount_cents::numeric / 100 ELSE 0 END AS withdrawals
            FROM banking.bank_transactions bt
            WHERE bt.operating_company_id = $1
              AND bt.bank_account_id = $2
            ORDER BY bt.transaction_date DESC, bt.created_at DESC
            LIMIT $3 OFFSET $4
          `,
          [q.operating_company_id, params.data.id, q.limit, q.offset]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      return res.rows;
    });
    return { register_rows: rows };
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
        .query<{ description: string | null; amount_cents: number }>(
          `
            SELECT description, amount_cents
            FROM banking.bank_transactions
            WHERE id = $1
              AND operating_company_id = $2
            LIMIT 1
          `,
          [params.data.id, companyId]
        )
        .catch(() => ({ rows: [] as { description: string | null; amount_cents: number }[] }));
      const target = targetRes.rows[0];
      if (!target) return [];
      const res = await client
        .query(
          `
            SELECT
              id,
              transaction_date AS txn_date,
              description,
              amount_cents AS amount,
              category,
              status
            FROM banking.bank_transactions
            WHERE operating_company_id = $1
              AND NOT (status IN ('pending_categorization','uncategorized'))
              AND abs(amount_cents - $2) <= 500
              AND description ILIKE $3
            ORDER BY transaction_date DESC
            LIMIT 3
          `,
          [companyId, Number(target.amount_cents ?? 0), `%${String(target.description ?? "").slice(0, 18)}%`]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      return res.rows;
    });
    return { suggestions };
  });

  app.post("/api/v1/banking/transactions/:id/split", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = transactionIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = splitBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    // HONEST INTERIM (QA-sweep): a real bank-transaction split needs a persisted multi-line
    // split-lines model that does not exist yet — banking.bank_transactions has a single `category`
    // column and there is no split-lines table. The previous implementation silently wrote
    // category='split_transaction' / status='categorized' with NO line allocation, mis-categorizing
    // the transaction (and the client even toasted "Split posted as single-line placeholder").
    // Until a true balanced N-line split is built (financial — requires a new table + migration),
    // this endpoint performs NO write and returns 501 so nothing is mis-categorized.
    return reply.code(501).send({
      error: "split_not_implemented",
      message:
        "Multi-line transaction split is not implemented yet (no split-lines model). The transaction was left unchanged.",
      transaction_id: params.data.id,
      requested_line_count: body.data.lines.length,
    });
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
          SET
            status = 'pending_categorization',
            category = NULL,
            category_kind = NULL,
            linked_entity_id = NULL,
            categorization_customer_id = NULL,
            categorization_vendor_id = NULL,
            categorization_gl_account_id = NULL,
            categorization_project_id = NULL,
            categorization_memo = NULL,
            suggested_match_invoice_id = NULL,
            suggested_match_bill_id = NULL,
            destination_bank_account_id = NULL,
            transfer_kind = NULL,
            paired_transaction_id = NULL,
            skip_reason = NULL,
            investigate_note = NULL,
            categorized_at = NULL,
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

  // ── Cash-GL setup (B-1, fork-A: reuse banking.bank_accounts.ledger_account_id) ───────────────────────
  // Maps each bank account → its COA cash GL account, per entity. NO posting, NO flag — setup only.
  // GET returns the bank accounts + their current mapping + the entity's COA asset accounts to choose from.
  app.get("/api/v1/banking/accounts/cash-gl-mapping", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;
    const payload = await withCompanyScope(user.uuid, companyId, async (client) => {
      const banks = await client.query<{ id: string; account_name: string; ledger_account_id: string | null; ledger_account_name: string | null; ledger_account_number: string | null }>(
        `SELECT ba.id::text, ba.account_name,
                ba.ledger_account_id::text,
                a.account_name AS ledger_account_name, a.account_number AS ledger_account_number
           FROM banking.bank_accounts ba
           LEFT JOIN catalogs.accounts a ON a.id = ba.ledger_account_id
          WHERE ba.operating_company_id = $1 AND ba.deactivated_at IS NULL
          ORDER BY ba.account_name ASC`,
        [companyId]
      );
      const coa = await client.query<{ id: string; account_number: string; account_name: string }>(
        `SELECT id::text, account_number, account_name
           FROM catalogs.accounts
          WHERE operating_company_id = $1 AND deactivated_at IS NULL AND account_type ILIKE 'asset'
          ORDER BY account_number ASC`,
        [companyId]
      );
      return { bank_accounts: banks.rows, coa_cash_accounts: coa.rows };
    });
    return payload;
  });

  // PUT sets a bank account's cash GL account. Owner/Administrator only. Cross-entity is rejected fail-loud:
  // the chosen COA account's operating_company_id MUST equal the bank account's (both already entity-scoped).
  app.put("/api/v1/banking/accounts/:id/cash-gl", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!["Owner", "Administrator"].includes(String((user as { role?: string }).role ?? ""))) {
      return reply.code(403).send({ error: "forbidden", detail: "cash-GL mapping is Owner/Administrator only" });
    }
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = z.object({ ledger_account_id: z.string().uuid().nullable() }).safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const companyId = query.data.operating_company_id;

    const result = await withCompanyScope(user.uuid, companyId, async (client) => {
      const bank = await client.query<{ id: string }>(
        `SELECT id FROM banking.bank_accounts WHERE id = $1 AND operating_company_id = $2 AND deactivated_at IS NULL LIMIT 1`,
        [params.data.id, companyId]
      );
      if (!bank.rows[0]) return { error: "bank_account_not_found" as const };
      // Cross-entity guard: the chosen COA account must belong to THIS entity.
      if (body.data.ledger_account_id) {
        const acct = await client.query<{ id: string }>(
          `SELECT id FROM catalogs.accounts WHERE id = $1 AND operating_company_id = $2 AND deactivated_at IS NULL LIMIT 1`,
          [body.data.ledger_account_id, companyId]
        );
        if (!acct.rows[0]) return { error: "account_not_in_entity" as const };
      }
      await client.query(
        `UPDATE banking.bank_accounts SET ledger_account_id = $1, updated_at = now() WHERE id = $2 AND operating_company_id = $3`,
        [body.data.ledger_account_id, params.data.id, companyId]
      );
      await appendCrudAudit(
        client,
        user.uuid,
        "banking.bank_account.cash_gl_mapped",
        { resource_type: "banking.bank_accounts", resource_id: params.data.id, operating_company_id: companyId, ledger_account_id: body.data.ledger_account_id },
        "info",
        "B-1-CASH-GL-SETUP"
      );
      return { ok: true as const };
    });
    if ("error" in result) {
      const code = result.error === "bank_account_not_found" ? 404 : 400;
      return reply.code(code).send({ error: result.error });
    }
    return result;
  });
}
