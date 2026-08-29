import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { bankAccountHiddenFilterSql, isBankAccountHideEnabled } from "./bank-account-visibility.js";
import { deriveInternalWalletBalanceCents } from "./internal-wallet-balance.js";

const paramsSchema = z.object({
  accountId: z.string().uuid(),
});

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
  return req.user as { uuid: string; role: string };
}

function officeRole(role: string) {
  return ["Owner", "Administrator", "Accountant", "Manager", "Dispatcher"].includes(role);
}

function validationError(reply: FastifyReply, error: z.ZodError) {
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
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);
    return fn(client);
  });
}

export async function registerAccountBalanceRoutes(app: FastifyInstance) {
  app.get("/api/v1/banking/accounts/:accountId/balance", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!officeRole(user.role)) return reply.code(403).send({ error: "forbidden" });

    const params = paramsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      // BANK-ACCOUNT-HIDE: a hidden account must be fully excluded — its balance/drill-through disappears
      // for this entity (flag OFF by default, see docs/accounting/BANK-ACCOUNT-ENTITY-HIDE-DESIGN.md).
      const hideOn = await isBankAccountHideEnabled(client, query.data.operating_company_id);
      const accountRes = await client.query<{
        id: string;
        account_name: string;
        ledger_account_id: string | null;
        plaid_item_id: string | null;
        current_balance_cents: string | null;
      }>(
        `
          SELECT id, account_name, ledger_account_id::text, plaid_item_id, current_balance_cents::text
          FROM banking.bank_accounts
          WHERE id = $1
            AND operating_company_id = $2::uuid
            AND deactivated_at IS NULL
          ${bankAccountHiddenFilterSql(hideOn, "banking.bank_accounts")}
          LIMIT 1
        `,
        [params.data.accountId, query.data.operating_company_id]
      );
      const bank = accountRes.rows[0];
      if (!bank) return { kind: "missing" as const };

      const reconRes = await client.query<{ last_reconciled_at: string | null }>(
        `
          SELECT MAX(reconciled_at)::text AS last_reconciled_at
          FROM banking.reconciliation_sessions
          WHERE bank_account_id = $1
            AND operating_company_id = $2::uuid
            AND status = 'reconciled'
        `,
        [bank.id, query.data.operating_company_id]
      );

      const txnRes = await client.query<{ last_transaction_at: string | null }>(
        `
          SELECT MAX(transaction_date)::text AS last_transaction_at
          FROM banking.bank_transactions
          WHERE bank_account_id = $1
            AND operating_company_id = $2::uuid
        `,
        [bank.id, query.data.operating_company_id]
      );

      let balanceCents = Number(bank.current_balance_cents ?? 0);
      let source: "plaid" | "manual_jes" | "qbo_mirror" | "internal_ledger" = bank.plaid_item_id
        ? "plaid"
        : "qbo_mirror";

      if (bank.ledger_account_id) {
        const typeRes = await client.query<{ account_type: string | null }>(
          `SELECT account_type FROM catalogs.accounts WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
          [bank.ledger_account_id, query.data.operating_company_id]
        );
        const accountType = String(typeRes.rows[0]?.account_type ?? "Asset");
        const invert =
          accountType === "Liability" ||
          accountType === "Equity" ||
          accountType === "Income" ||
          accountType === "OtherIncome";
        const signedExpr = invert
          ? "CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE -p.amount_cents END"
          : "CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END";

        const jeRes = await client.query<{ bal: string | null; hits: string | null }>(
          `
            SELECT
              COALESCE(SUM(${signedExpr}), 0)::text AS bal,
              COUNT(*)::text AS hits
            FROM accounting.journal_entry_postings p
            -- Pinned to the posting's company: this SUM is a BANK BALANCE, so the entry set it walks
            -- must not be able to widen beyond the entity the postings belong to.
            JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
                                              AND je.operating_company_id = p.operating_company_id
            WHERE p.account_id = $1
              AND p.operating_company_id = $2::uuid
              AND je.status = 'posted'
              AND je.entry_date <= CURRENT_DATE
          `,
          [bank.ledger_account_id, query.data.operating_company_id]
        );
        const hits = Number(jeRes.rows[0]?.hits ?? 0);
        if (hits > 0) {
          balanceCents = Number(jeRes.rows[0]?.bal ?? 0);
          source = "manual_jes";
        }
      }

      // RELAY-WALLET-BALANCE-1: a non-Plaid internal wallet (e.g. Relay Fuel Wallet) with no GL posting
      // (no JE hits above) has NOTHING keeping current_balance_cents in sync — it is frozen at its seed
      // value (0) forever. Derive it from the account's own bank_transactions ledger instead, same as
      // /banking/accounts/all and /banking/plaid/accounts (internal-wallet-balance.ts).
      if (!bank.plaid_item_id && source === "qbo_mirror") {
        balanceCents = await deriveInternalWalletBalanceCents(client, query.data.operating_company_id, bank.id);
        source = "internal_ledger";
      }

      await appendCrudAudit(
        client,
        user.uuid,
        "banking.balance_queried",
        {
          bank_account_id: bank.id,
          operating_company_id: query.data.operating_company_id,
          balance_source: source,
        },
        "info",
        "P6-T11196"
      );

      return {
        kind: "ok" as const,
        body: {
          account_id: bank.id,
          account_name: bank.account_name,
          balance_cents: balanceCents,
          last_reconciled_at: reconRes.rows[0]?.last_reconciled_at ?? null,
          last_transaction_at: txnRes.rows[0]?.last_transaction_at ?? null,
          source,
        },
      };
    });

    if (payload.kind === "missing") return reply.code(404).send({ error: "bank_account_not_found" });
    return payload.body;
  });
}
