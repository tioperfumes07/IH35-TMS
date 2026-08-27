import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../shared.js";
import { bankAccountHiddenFilterSql, isBankAccountHideEnabled } from "../../banking/bank-account-visibility.js";
import { sumAuthoritativeDepositoryCashCents } from "../../banking/internal-wallet-balance.js";
import { companyBusinessDate } from "../../lib/company-business-date.js";

const querySchema = companyQuerySchema.extend({
  as_of_date: z.string().date().optional(),
});

/**
 * GAP-45 route-fix: exposes /api/v1/reports/cash-flow with strict
 * operating_company_id scoping. Delegates to the same query stack as
 * cash-flow-overview without mutating the Block-14 accounting service.
 */
export async function registerCashFlowReportRouteFix(app: FastifyInstance) {
  app.get("/api/v1/reports/cash-flow", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    // FINANCIAL-REPORTS-AS-OF-DATE-USES-UTC-NOT-COMPANY-TIMEZONE: found as a 4th instance of the
    // same bug class while fixing ar-aging/ap-aging/cash-flow-overview — was
    // new Date().toISOString() (UTC calendar date, rolls to the next day ~19:00 Central).
    const asOf = parsed.data.as_of_date ?? companyBusinessDate();
    const companyId = parsed.data.operating_company_id;

    const payload = await withCompanyScope(user.uuid, companyId, async (client) => {
      const scopeCheck = await client.query(
        `
          SELECT id::text
          FROM org.companies
          WHERE id = $1::uuid
          LIMIT 1
        `,
        [companyId]
      );
      if (!scopeCheck.rows[0]?.id) {
        return { kind: "company_not_found" as const };
      }

      // BANK-ACCOUNT-HIDE: exclude accounts hidden for THIS entity (flag OFF by default — see
      // docs/accounting/BANK-ACCOUNT-ENTITY-HIDE-DESIGN.md).
      //
      // BANK-ACCOUNT-HIDE-CAPABILITY-FAILURE-FAILS-OPEN — same class as REPORTS-F6364 right below:
      // `.catch(() => false)` painted a failed flag read as a successful "hide is off" read,
      // silently letting accounts that may be intentionally hidden back into this balance. Fail
      // loud instead, same standard REPORTS-F6364 already applies to the query underneath it.
      const hideOn = await isBankAccountHideEnabled(client, companyId);
      // REPORTS-F6364: this used to .catch(() => ({ rows: [{ total_cents: "0" }] })), painting a
      // fake $0.00 "Operating balance" over any real query failure (RLS, connection, schema drift)
      // with zero indication anything was wrong — exactly the deep-dive hunt's named class. A broken
      // balance query must fail loud, same standard already applied to the /425c court exhibits in
      // this same reports tree (exhibit-a/b/c/d: "NO .catch(): fail loud, never a blank/zero exhibit").
      //
      // GAP45-OPERATING-BALANCE-READS-STALE-RAW-COLUMN-FOR-NON-PLAID-WALLET: this used to sum the raw
      // banking.bank_accounts.current_balance_cents column directly. Per internal-wallet-balance.ts,
      // that column is ONLY ever written by the Plaid webhook path -- any non-Plaid internal wallet
      // (Relay Fuel Wallet, plaid_item_id IS NULL) is never kept in sync there, so the column holds a
      // stale value with no relation to the wallet's real transaction history (verified prod
      // br-fancy-credit-akjnd07a: raw column read -$543.45 for a wallet whose actual ledger-derived
      // balance is +$1,200.00 -- a $1,743.45 swing on the entity's reported liquidity). Every other
      // authoritative cash total in this codebase (cash-flow opening balance, KPI aggregate, account
      // tiles) already reuses sumAuthoritativeDepositoryCashCents for exactly this reason -- switching
      // this route to the same helper instead of re-deriving its own raw SUM.
      const operatingBalanceCents = await sumAuthoritativeDepositoryCashCents(client, companyId, {
        hideFilterOnBankAccounts: bankAccountHiddenFilterSql(hideOn, "banking.bank_accounts"),
        hideFilterOnBaAlias: bankAccountHiddenFilterSql(hideOn, "ba"),
      });

      const loadRes = await client.query(
        `
          SELECT COUNT(*)::text AS cnt
          FROM mdata.loads
          WHERE operating_company_id = $1::uuid
            AND soft_deleted_at IS NULL
            AND created_at::date <= $2::date
        `,
        [companyId, asOf]
      );

      return {
        kind: "ok" as const,
        operating_company_id: companyId,
        as_of_date: asOf,
        operating_balance_cents: operatingBalanceCents,
        scoped_load_count: Number(loadRes.rows[0]?.cnt ?? 0),
        source: "gap-45-cash-flow-route-fix",
      };
    });

    if (payload.kind === "company_not_found") {
      return reply.code(404).send({ error: "company_not_found" });
    }
    return reply.send(payload);
  });
}
