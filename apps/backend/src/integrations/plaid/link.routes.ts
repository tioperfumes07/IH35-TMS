import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser, withLuciaBypass } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { createLinkToken, createUpdateModeLinkToken, exchangePublicToken } from "./plaid.service.js";
import { getPlaidClient } from "./plaid-client.js";
import { decryptPlaidAccessToken } from "./plaid-token-crypto.js";
import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";
import {
  deriveInternalWalletBalanceCents,
  withInternalWalletBalances,
  type BankAccountBalanceFields,
} from "../../banking/internal-wallet-balance.js";

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

// Doc-18 GAP B — governed edit of a MANUAL transaction's date (QBO parity). Only manual, non-bank-fed
// rows are editable; bank-fed rows (plaid/qbo_import/csv_import, or any row carrying a plaid_transaction_id)
// stay locked.
const manualTxnDatePatchBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  transaction_date: z.string().date(),
});

// ACCT-F5621 — bank transaction notes. Deliberately a SEPARATE route from the manual-date PATCH
// above rather than a branch inside it: that route is intentionally locked to manual, non-bank-fed
// rows (QBO-style date immutability for bank-fed data), but a note is an operator annotation, not an
// edit to the bank's own reported facts — it must work on ANY row, Plaid-fed included. Deliberately
// NOT gated by assertBankTxnNotInReconciledSession (unlike skip/investigate/categorize in
// categorization.routes.ts): those routes change WHICH ledger entry a transaction resolves to, which
// reconciliation closure must freeze; a note is pure metadata and never affects reconciliation state,
// so there is no reason to block it once a session is closed.
const bankTxnNotePatchBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  note: z.string().trim().min(1).max(2000),
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
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
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
        WHERE operating_company_id = $1::uuid
          AND id = ANY($2::uuid[])
      `,
      [operatingCompanyId, ids]
    );
    return res.rows;
  });
}

export async function registerPlaidLinkRoutes(app: FastifyInstance) {
  app.post("/api/v1/banking/plaid/create-link-token", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
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

  app.post("/api/v1/banking/plaid/exchange-public-token", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
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
      const res = await client.query<BankAccountBalanceFields>(
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
          WHERE operating_company_id = $1::uuid
            AND deactivated_at IS NULL
          ORDER BY institution_name NULLS LAST, account_name NULLS LAST, created_at DESC
        `,
        [query.data.operating_company_id]
      );
      // RELAY-WALLET-BALANCE-1: root-cause fix — a non-Plaid internal wallet (Relay Fuel Wallet) never
      // gets current_balance_cents/available_balance_cents synced (that only happens via the Plaid
      // webhook/exchange path). Derive its balance from its own bank_transactions ledger instead of
      // trusting a column frozen at its seed value of 0. See internal-wallet-balance.ts.
      return withInternalWalletBalances(client, query.data.operating_company_id, res.rows);
    });

    return { accounts };
  });

  app.get(
    "/api/v1/banking/plaid/accounts/:id",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const params = accountParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = accountQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const account = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query<BankAccountBalanceFields>(
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
            AND operating_company_id = $2::uuid
          LIMIT 1
        `,
        [params.data.id, query.data.operating_company_id]
      );
      const row = res.rows[0];
      if (!row) return null;
      // RELAY-WALLET-BALANCE-1: see /banking/plaid/accounts above — same derivation for the single-
      // account detail route BankAccountDetail.tsx reads its "Current balance"/"Available balance" from.
      if (!row.plaid_item_id) {
        const derivedCents = String(
          await deriveInternalWalletBalanceCents(client, query.data.operating_company_id, row.id)
        );
        return { ...row, current_balance_cents: derivedCents, available_balance_cents: derivedCents };
      }
      return row;
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
      const predicates: string[] = [
        "bt.bank_account_id = $1",
        "bt.operating_company_id = $2::uuid",
        "bt.voided_at IS NULL",
        "bt.transaction_date <= (CURRENT_DATE + INTERVAL '1 day')",
      ];
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
          -- BANK-F5662 — the per-account register selected the matched-entity FKs with NO human-label
          -- joins at all, so BankAccountDetail's Matched column could only ever render "— not visible"
          -- tombstones for fully-resolvable loads/bills/settlements/JEs. Same ACCT-F5153 convention as
          -- the company-transactions SELECT below: entity-scoped LEFT JOINs, label alongside FK.
          -- BANK-F5746 (2026-08-22) — verified this join was already correct and complete; the residual
          -- gap was entirely on the frontend, where ReconciliationWorkspace.tsx's matched-entity
          -- EntityLinks hardcoded entityLabel(null, ...) instead of threading these already-joined
          -- matched_*_number/_display_id columns through. Fixed there, not here — noting it here so a
          -- future reader tracing "why does this join exist" finds both halves of the story.
          l.load_number AS matched_load_number,
          bt.matched_bill_id,
          bill.bill_number AS matched_bill_number,
          bt.matched_settlement_id,
          settlement.display_id AS matched_settlement_display_id,
          bt.matched_journal_entry_id::text AS matched_journal_entry_id,
          je.memo AS matched_journal_entry_memo,
          bt.matched_transfer_id::text AS matched_transfer_id,
          COALESCE(NULLIF(TRIM(transfer.reference_number), ''), NULLIF(TRIM(transfer.memo), '')) AS matched_transfer_label,
          bt.matched_expense_id::text AS matched_expense_id,
          expense.expense_number AS matched_expense_number,
          CASE
            WHEN bt.matched_transfer_id IS NOT NULL THEN 'transfer'
            WHEN bt.matched_expense_id IS NOT NULL THEN 'expense'
            WHEN bt.matched_journal_entry_id IS NOT NULL THEN 'je'
            WHEN bt.matched_load_id IS NOT NULL THEN 'load'
            WHEN bt.matched_settlement_id IS NOT NULL THEN 'settlement'
            WHEN bt.matched_bill_id IS NOT NULL THEN 'bill'
            ELSE NULL
          END AS matched_kind,
          ARRAY_REMOVE(ARRAY[
            CASE WHEN bt.matched_transfer_id IS NOT NULL THEN 'transfer' END,
            CASE WHEN bt.matched_journal_entry_id IS NOT NULL THEN 'je' END,
            CASE WHEN bt.matched_expense_id IS NOT NULL THEN 'expense' END,
            CASE WHEN bt.matched_load_id IS NOT NULL THEN 'load' END,
            CASE WHEN bt.matched_settlement_id IS NOT NULL THEN 'settlement' END,
            CASE WHEN bt.matched_bill_id IS NOT NULL THEN 'bill' END
          ], NULL) AS matched_kinds,
          (bt.matched_load_id IS NOT NULL OR bt.matched_bill_id IS NOT NULL OR
           bt.matched_settlement_id IS NOT NULL OR bt.matched_expense_id IS NOT NULL OR
           bt.matched_transfer_id IS NOT NULL OR bt.matched_journal_entry_id IS NOT NULL) AS is_matched,
          bt.notes,
          bt.created_at
        FROM banking.bank_transactions bt
        LEFT JOIN mdata.loads l
          ON l.id = bt.matched_load_id
         AND l.operating_company_id = bt.operating_company_id
        LEFT JOIN accounting.bills bill
          ON bill.id = bt.matched_bill_id
         AND bill.operating_company_id = bt.operating_company_id
        LEFT JOIN driver_finance.driver_settlements settlement
          ON settlement.id = bt.matched_settlement_id
         AND settlement.operating_company_id = bt.operating_company_id
        LEFT JOIN accounting.journal_entries je
          ON je.id = bt.matched_journal_entry_id
         AND je.operating_company_id = bt.operating_company_id
        LEFT JOIN banking.transfers transfer
          ON transfer.id = bt.matched_transfer_id
         AND transfer.operating_company_id = bt.operating_company_id
        LEFT JOIN accounting.expenses expense
          ON expense.id = bt.matched_expense_id
         AND expense.operating_company_id = bt.operating_company_id
        WHERE ${predicates.join(" AND ")}
        ORDER BY bt.transaction_date DESC, bt.created_at DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `;
      const res = await client.query(sql, values);
      return res.rows;
    });

    return { transactions: rows };
  });

  app.post(
    "/api/v1/banking/plaid/accounts/:id/disconnect",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
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
            AND operating_company_id = $2::uuid
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
              AND operating_company_id = $2::uuid
              AND plaid_access_token IS NOT NULL
            LIMIT 1
          `,
          [account.plaid_item_id, body.data.operating_company_id]
        );
        // G10-H5: decrypt at rest (backward-compatible with legacy plaintext rows).
        const accessToken = decryptPlaidAccessToken(tokenRes.rows[0]?.plaid_access_token ?? null);
        if (accessToken) {
          try {
            // CI-ALLOWLIST: registerPlaidLinkRoutes invokes Plaid item revoke in request path for explicit user disconnect intent — see DS-AUDIT-B-016.
            const plaid = getPlaidClient();
            await plaid.itemRemove({ access_token: accessToken });
          // local deactivation must complete even if the remote Plaid revoke fails — see DS-AUDIT-B-016
          // intentional swallow
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
            AND operating_company_id = $2::uuid
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

  app.post(
    "/api/v1/banking/plaid/items/disconnect",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
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
            AND operating_company_id = $2::uuid
            AND plaid_access_token IS NOT NULL
          LIMIT 1
        `,
        [body.data.plaid_item_id, body.data.operating_company_id]
      );
      // G10-H5: decrypt at rest (backward-compatible with legacy plaintext rows).
      const accessToken = decryptPlaidAccessToken(tokenRes.rows[0]?.plaid_access_token ?? null);
      if (accessToken) {
        try {
          // CI-ALLOWLIST: registerPlaidLinkRoutes invokes Plaid item revoke in request path for explicit user disconnect intent — see DS-AUDIT-B-016.
          const plaid = getPlaidClient();
          await plaid.itemRemove({ access_token: accessToken });
        // local deactivation must complete even if the remote Plaid revoke fails — see DS-AUDIT-B-016
        // intentional swallow
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
            AND operating_company_id = $2::uuid
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

  app.get(
    "/api/v1/banking/plaid/company-transactions",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
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
      const predicates: string[] = [
        "bt.operating_company_id = $1::uuid",
        "bt.voided_at IS NULL",
        "bt.transaction_date <= (CURRENT_DATE + INTERVAL '1 day')",
      ];
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
          matched_load.load_number AS matched_load_number,
          COALESCE(bt.categorization_load_id, bt.matched_load_id)::text AS resolved_load_id,
          COALESCE(l.load_number, matched_load.load_number) AS resolved_load_number,
          bt.matched_bill_id,
          -- ACCT-F5153 (OWNER-EXECUTION-PLAN §2 money-cells sweep): matched_bill_id was selected but
          -- never joined to a human label, so the FE could only ever render a raw UUID or drop the
          -- reference entirely — same convention already followed for the driver/unit/trailer/load
          -- joins below.
          bill.bill_number AS matched_bill_number,
          bt.matched_settlement_id,
          settlement.display_id AS matched_settlement_display_id,
          bt.matched_journal_entry_id::text AS matched_journal_entry_id,
          -- Same ACCT-F5153 human-label convention as bill/settlement above: the JE id was selected
          -- but never joined to a label, so the FE's entityLabel(null, …) rendered every matched JE
          -- as "Journal entry — not visible" even when fully resolvable. The by-linkage sibling
          -- endpoint already returns matched_journal_entry_memo; mirror it here.
          je.memo AS matched_journal_entry_memo,
          bt.matched_transfer_id::text AS matched_transfer_id,
          COALESCE(NULLIF(TRIM(transfer.reference_number), ''), NULLIF(TRIM(transfer.memo), '')) AS matched_transfer_label,
          bt.matched_expense_id::text AS matched_expense_id,
          expense.expense_number AS matched_expense_number,
          bt.notes,
          bt.created_at,
          bt.source,
          bt.source_ref,
          bt.plaid_transaction_id,
          bt.categorization_driver_id::text AS categorization_driver_id,
          NULLIF(TRIM(CONCAT(d.first_name, ' ', d.last_name)), '') AS categorization_driver_name,
          bt.categorization_unit_id::text AS categorization_unit_id,
          u.unit_number AS categorization_unit_number,
          bt.categorization_trailer_id::text AS categorization_trailer_id,
          eq.equipment_number AS categorization_trailer_number,
          bt.categorization_load_id::text AS categorization_load_id,
          l.load_number AS categorization_load_number,
          -- 0441-mod8-tx-fields-captured-not-sent — persisted capture fields (held migration
          -- 202607690000): the categorize panel hydrates from these instead of losing them on reload.
          -- Class label derived by JOIN on catalogs.classes (linkage law — FK stored, label never).
          bt.check_number,
          bt.categorization_class_id::text AS categorization_class_id,
          cls.class_name AS categorization_class_name,
          bt.categorization_location,
          bt.is_billable,
          bt.tags,
          bt.categorization_recover_from_driver,
          bt.categorization_recover_deduction_type,
          ba.institution_name,
          ba.account_name,
          ba.account_mask,
          CASE
            WHEN bt.matched_transfer_id IS NOT NULL THEN 'transfer'
            WHEN bt.matched_journal_entry_id IS NOT NULL THEN 'je'
            WHEN bt.matched_expense_id IS NOT NULL THEN 'expense'
            WHEN bt.matched_load_id IS NOT NULL THEN 'load'
            WHEN bt.matched_settlement_id IS NOT NULL THEN 'settlement'
            WHEN bt.matched_bill_id IS NOT NULL THEN 'bill'
            ELSE NULL
          END AS matched_kind,
          ARRAY_REMOVE(ARRAY[
            CASE WHEN bt.matched_transfer_id IS NOT NULL THEN 'transfer' END,
            CASE WHEN bt.matched_journal_entry_id IS NOT NULL THEN 'je' END,
            CASE WHEN bt.matched_expense_id IS NOT NULL THEN 'expense' END,
            CASE WHEN bt.matched_load_id IS NOT NULL THEN 'load' END,
            CASE WHEN bt.matched_settlement_id IS NOT NULL THEN 'settlement' END,
            CASE WHEN bt.matched_bill_id IS NOT NULL THEN 'bill' END
          ], NULL) AS matched_kinds,
          (bt.matched_load_id IS NOT NULL OR bt.matched_bill_id IS NOT NULL OR
           bt.matched_settlement_id IS NOT NULL OR bt.matched_expense_id IS NOT NULL OR
           bt.matched_transfer_id IS NOT NULL OR bt.matched_journal_entry_id IS NOT NULL) AS is_matched,
          -- QBO-parity Relay register: expose diesel/reefer/DEF/fee lines already stored at ingest
          -- (not a single total). Join only when source_ref is a Relay fuel mirror.
          COALESCE((
            SELECT json_agg(
              json_build_object(
                'line_index', rfl.line_index,
                'fuel_type', rfl.fuel_type,
                'fuel_type_description', rfl.fuel_type_description,
                'fuel_product_code', rfl.fuel_product_code,
                'volume', rfl.volume,
                'volume_uom', rfl.volume_uom,
                'total_discounted_price_cents', rfl.total_discounted_price_cents,
                'fee_type', rfl.fee_type,
                'fee_amount_cents', rfl.fee_amount_cents
              )
              ORDER BY rfl.line_index
            )
            FROM integrations.relay_fuel_transactions rft
            JOIN integrations.relay_fuel_transaction_lines rfl
              ON rfl.relay_fuel_transaction_id = rft.id
             AND rfl.operating_company_id = rft.operating_company_id
             AND COALESCE(rfl.is_active, true) = true
             AND rfl.voided_at IS NULL
            WHERE bt.source_ref LIKE 'relay_fuel:%'
              AND rft.operating_company_id = bt.operating_company_id
              AND rft.transaction_id = substring(bt.source_ref FROM length('relay_fuel:') + 1)
          ), '[]'::json) AS relay_fuel_lines
        FROM banking.bank_transactions bt
        JOIN banking.bank_accounts ba
          ON ba.id = bt.bank_account_id
         AND ba.operating_company_id = bt.operating_company_id
        LEFT JOIN mdata.drivers d
          ON d.id = bt.categorization_driver_id
         AND d.operating_company_id = bt.operating_company_id
        LEFT JOIN mdata.units u
          ON u.id = bt.categorization_unit_id
         AND (u.owner_company_id = bt.operating_company_id OR u.currently_leased_to_company_id = bt.operating_company_id)
        LEFT JOIN mdata.equipment eq
          ON eq.id = bt.categorization_trailer_id
         AND (eq.owner_company_id = bt.operating_company_id OR eq.currently_leased_to_company_id = bt.operating_company_id)
        LEFT JOIN mdata.loads l
          ON l.id = bt.categorization_load_id
         AND l.operating_company_id = bt.operating_company_id
        LEFT JOIN mdata.loads matched_load
          ON matched_load.id = bt.matched_load_id
         AND matched_load.operating_company_id = bt.operating_company_id
        LEFT JOIN catalogs.classes cls
          ON cls.id = bt.categorization_class_id
         AND cls.operating_company_id = bt.operating_company_id
        LEFT JOIN accounting.bills bill
          ON bill.id = bt.matched_bill_id
         AND bill.operating_company_id = bt.operating_company_id
        LEFT JOIN driver_finance.driver_settlements settlement
          ON settlement.id = bt.matched_settlement_id
         AND settlement.operating_company_id = bt.operating_company_id
        LEFT JOIN accounting.journal_entries je
          ON je.id = bt.matched_journal_entry_id
         AND je.operating_company_id = bt.operating_company_id
        LEFT JOIN banking.transfers transfer
          ON transfer.id = bt.matched_transfer_id
         AND transfer.operating_company_id = bt.operating_company_id
        LEFT JOIN accounting.expenses expense
          ON expense.id = bt.matched_expense_id
         AND expense.operating_company_id = bt.operating_company_id
        WHERE ${predicates.join(" AND ")}
        ORDER BY ${sortSql}
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `;
      const res = await client.query(sql, values);
      return res.rows;
    });

    return { transactions: rows };
  });

  // Doc-18 GAP B — governed PATCH of a MANUAL transaction's date. QBO lets you edit a manually-entered
  // transaction's date; a bank-fed (Plaid/QBO/CSV import) row's date is locked to what the feed reported.
  // Manual-only guard: editable ONLY when source = 'manual' AND plaid_transaction_id IS NULL. Any bank-fed
  // row is rejected with a clear error and never mutated. The change is append-only audit-logged.
  app.patch("/api/v1/banking/transactions/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!ensureRole(reply, user.role, ownerAdminRoles)) return;

    const params = accountParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = manualTxnDatePatchBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const outcome = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      // Read current state (RLS-scoped) to distinguish not-found from bank-fed-locked and to audit the delta.
      const existing = await client.query<{
        id: string;
        source: string;
        plaid_transaction_id: string | null;
        transaction_date: string;
      }>(
        `SELECT id, source, plaid_transaction_id, transaction_date::text AS transaction_date
           FROM banking.bank_transactions
          WHERE id = $1 AND operating_company_id = $2::uuid`,
        [params.data.id, body.data.operating_company_id]
      );
      const row = existing.rows[0] ?? null;
      if (!row) return { status: "not_found" as const };
      // Bank-fed rows stay locked. Belt-and-suspenders: source must be 'manual' AND no plaid id.
      if (row.source !== "manual" || row.plaid_transaction_id !== null) {
        return { status: "locked" as const, source: row.source };
      }

      const updated = await client.query<{ id: string; transaction_date: string }>(
        `UPDATE banking.bank_transactions
            SET transaction_date = $3, updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2::uuid
            AND source = 'manual'
            AND plaid_transaction_id IS NULL
          RETURNING id, transaction_date::text AS transaction_date`,
        [params.data.id, body.data.operating_company_id, body.data.transaction_date]
      );
      const result = updated.rows[0] ?? null;
      if (!result) return { status: "locked" as const, source: row.source };

      await appendCrudAudit(
        client,
        user.uuid,
        "banking.transaction.date_edited",
        {
          resource_type: "banking.bank_transactions",
          resource_id: result.id,
          operating_company_id: body.data.operating_company_id,
          source: row.source,
          old_transaction_date: row.transaction_date,
          new_transaction_date: result.transaction_date,
        },
        "warning",
        "DOC18-GAPB-MANUAL-TXN-DATE"
      );
      return { status: "ok" as const, id: result.id, transaction_date: result.transaction_date };
    });

    if (outcome.status === "not_found") return reply.code(404).send({ error: "bank_transaction_not_found" });
    if (outcome.status === "locked") {
      return reply.code(422).send({
        error: "bank_fed_transaction_date_locked",
        message: `Transaction date is locked for bank-fed rows (source="${outcome.source}"). Only manually-entered transactions can have their date edited.`,
      });
    }
    return { ok: true, id: outcome.id, transaction_date: outcome.transaction_date };
  });

  // ACCT-F5621 — append an operator note to ANY bank transaction (manual or bank-fed). Append-only:
  // the notes column already carries system-written provenance text from bank-tx-dedup.ts's
  // 'merged_manual_stub:' markers, so an operator PATCH must never clobber it — mirrors
  // reconciliation.routes.ts's own notes CASE/concat pattern exactly.
  app.patch(
    "/api/v1/banking/transactions/:id/notes",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!ensureRole(reply, user.role, ownerAdminRoles)) return;

      const params = accountParamsSchema.safeParse(req.params ?? {});
      if (!params.success) return sendValidationError(reply, params.error);
      const body = bankTxnNotePatchBodySchema.safeParse(req.body ?? {});
      if (!body.success) return sendValidationError(reply, body.error);

      const outcome = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
        const updated = await client.query<{ id: string; notes: string | null }>(
          `UPDATE banking.bank_transactions
              SET notes = CASE
                    WHEN notes IS NULL OR notes = '' THEN $3::text
                    ELSE concat(notes, E'\\n', $3::text)
                  END,
                  updated_at = now()
            WHERE id = $1
              AND operating_company_id = $2::uuid
            RETURNING id, notes`,
          [params.data.id, body.data.operating_company_id, body.data.note]
        );
        const result = updated.rows[0] ?? null;
        if (!result) return { status: "not_found" as const };

        await appendCrudAudit(
          client,
          user.uuid,
          "banking.transaction.note_added",
          {
            resource_type: "banking.bank_transactions",
            resource_id: result.id,
            operating_company_id: body.data.operating_company_id,
            note: body.data.note,
          },
          "info",
          "ACCT-F5621"
        );
        return { status: "ok" as const, id: result.id, notes: result.notes };
      });

      if (outcome.status === "not_found") return reply.code(404).send({ error: "bank_transaction_not_found" });
      return { ok: true, id: outcome.id, notes: outcome.notes };
    }
  );
}
