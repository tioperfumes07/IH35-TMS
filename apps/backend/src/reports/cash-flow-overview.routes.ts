import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { createTtlCache } from "../lib/ttl-cache.js";
import {
  bankAccountHiddenFilterSql,
  bankTransactionHiddenFilterSql,
  isBankAccountHideEnabled,
} from "../banking/bank-account-visibility.js";
import { sumAuthoritativeDepositoryCashCents } from "../banking/internal-wallet-balance.js";
import { companyBusinessDate } from "../lib/company-business-date.js";

const querySchema = companyQuerySchema.extend({
  as_of_date: z.string().date().optional(),
});

type CashFlowPayload = {
  as_of_date: string;
  current_state: {
    operating_balance_cents: number;
    dip_balance_cents: number;
    payroll_balance_cents: number;
    factoring_reserves_held_cents: number;
    factoring_advances_funded_mtd_cents: number;
    uncategorized_transactions_count: number;
    chargebacks_open_cents: number;
  };
  next_30_days: {
    expected_ar_collections_cents: number;
    expected_ap_outflows_cents: number;
    expected_settlement_outflows_cents: number;
    net_projected_change_cents: number;
  };
  historical: {
    last_7_days_inflows_cents: number;
    last_7_days_outflows_cents: number;
    last_30_days_avg_daily_inflow_cents: number;
    last_30_days_avg_daily_outflow_cents: number;
  };
};

const cache = createTtlCache<CashFlowPayload>();

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function registerCashFlowOverviewRoutes(app: FastifyInstance) {
  // ACCT-F183: rate limit added because touching this file brought it into
  // verify-new-auth-routes-rate-limited's scope — an authorizing read with no limit trips CodeQL
  // js/missing-rate-limiting. 60/min matches the read-route convention (writes use 30/min).
  app.get(
    "/api/v1/reports/cash-flow-overview",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    // FINANCIAL-REPORTS-AS-OF-DATE-USES-UTC-NOT-COMPANY-TIMEZONE: was new Date().toISOString()
    // (UTC calendar date, rolls to the next day ~19:00 Central) — companyBusinessDate() is the
    // canonical fix, already proven in production elsewhere.
    const asOf = parsed.data.as_of_date ?? companyBusinessDate();
    const companyId = parsed.data.operating_company_id;
    const cacheKey = `${companyId}:${asOf}`;
    const hit = cache.get(cacheKey);
    if (hit) return hit;

    const payload = await withCompanyScope(user.uuid, companyId, async (client) => {
      // BANK-ACCOUNT-HIDE: every cash aggregate below must exclude accounts hidden for THIS entity
      // (flag OFF by default — see docs/accounting/BANK-ACCOUNT-ENTITY-HIDE-DESIGN.md).
      //
      // BANK-ACCOUNT-HIDE-CAPABILITY-FAILURE-FAILS-OPEN — `.catch(() => false)` treated a FAILED
      // flag read identically to a successful "hide is off" read, so a schema/RLS/connection
      // failure silently let accounts that may be intentionally hidden back into these totals.
      // `false` is only correct after a real read; a failure must fail the request loud instead.
      const hideOn = await isBankAccountHideEnabled(client, companyId);
      // CASHFLOW-OVERVIEW-NON-DEPOSITORY-BALANCE-LEAK: this used to SUM(current_balance_cents) over
      // every is_active bank_accounts row with no account_class filter and no Plaid/non-Plaid split —
      // unlike every other cash total in the codebase, which goes through
      // sumAuthoritativeDepositoryCashCents (see internal-wallet-balance.ts) precisely because (1) a
      // credit-card-class Plaid account (a real, populated value — see
      // 202612100000_repoint_amex_bank_account_to_card_liability.sql) would sum straight into "cash",
      // and (2) a non-Plaid internal wallet's current_balance_cents column is seeded at 0 and never
      // updated again (only the wallet's own bank_transactions ledger is live), so it silently
      // contributed $0 here no matter its real balance. The sibling /api/v1/reports/cash-flow route
      // was already fixed for this exact class under GAP-45 (reports/cash-flow/route-fix.ts) — this
      // route was missed. payroll/dip sub-totals are still name-matched, but now scoped to the same
      // Plaid-linked depository population the authoritative total draws from, so a credit-card
      // account can no longer masquerade as a payroll/DIP bucket either.
      const bankRes = await client
        .query(
          `
            SELECT
              COALESCE(
                SUM(current_balance_cents) FILTER (
                  WHERE COALESCE(account_name, '') ILIKE '%payroll%'
                     OR COALESCE(account_name, '') ILIKE '%driver pay%'
                ),
                0
              )::text AS payroll_cents,
              COALESCE(
                SUM(current_balance_cents) FILTER (
                  WHERE COALESCE(account_name, '') ILIKE '%dip%'
                     OR COALESCE(account_name, '') ILIKE '%fuel%card%'
                ),
                0
              )::text AS dip_cents
            FROM banking.bank_accounts
            WHERE operating_company_id = $1::uuid
              AND account_class = 'depository'
              AND is_active = true
              AND deactivated_at IS NULL
              AND plaid_item_id IS NOT NULL
            ${bankAccountHiddenFilterSql(hideOn, "banking.bank_accounts")}
          `,
          [companyId]
        );

      const total = await sumAuthoritativeDepositoryCashCents(client, companyId, {
        hideFilterOnBankAccounts: bankAccountHiddenFilterSql(hideOn, "banking.bank_accounts"),
        hideFilterOnBaAlias: bankAccountHiddenFilterSql(hideOn, "ba"),
      });

      const payroll = num(bankRes.rows[0]?.payroll_cents);
      const dip = num(bankRes.rows[0]?.dip_cents);
      const operating = Math.max(0, total - payroll - dip);

      const factorRes = await client
        .query(
          `
            SELECT
              COALESCE(reserve_balance, 0)::text AS reserve_balance,
              COALESCE(mtd_advanced_total, 0)::text AS mtd_advanced_total,
              COALESCE(chargeback_balance, 0)::text AS chargeback_balance
            FROM views.factoring_summary
            WHERE operating_company_id = $1::uuid
            LIMIT 1
          `,
          [companyId]
        );

      const factorRow = factorRes.rows[0] ?? {};
      const factoringReservesCents = Math.round(num(factorRow.reserve_balance) * 100);
      const factoringAdvancesMtdCents = Math.round(num(factorRow.mtd_advanced_total) * 100);
      const chargebacksOpenCents = Math.round(num(factorRow.chargeback_balance) * 100);

      const uncRes = await client
        .query(
          `
            SELECT COUNT(*)::text AS c
            FROM banking.bank_transactions t
            WHERE t.operating_company_id = $1::uuid
              AND t.pending = false
              AND COALESCE(array_length(t.plaid_category, 1), 0) = 0
              AND t.matched_load_id IS NULL
              AND t.matched_bill_id IS NULL
              AND t.matched_settlement_id IS NULL
              AND t.transaction_date <= $2::date
              ${bankTransactionHiddenFilterSql(hideOn, "t")}
          `,
          [companyId, asOf]
        );

      const horizonEndSql = `($2::date + INTERVAL '30 days')::date`;

      const arRes = await client
        .query(
          `
            SELECT COALESCE(SUM(i.amount_open_cents), 0)::text AS amt
            FROM accounting.invoices i
            WHERE i.operating_company_id = $1::uuid
              AND i.status IN ('sent', 'partial')
              AND i.voided_at IS NULL
              AND COALESCE(i.amount_open_cents, 0) > 0
              AND i.due_date IS NOT NULL
              AND i.due_date <= ${horizonEndSql}
          `,
          [companyId, asOf]
        );

      const apRes = await client
        .query(
          `
            SELECT COALESCE(SUM(GREATEST(COALESCE(b.amount_cents, 0) - COALESCE(b.paid_cents, 0), 0)), 0)::text AS amt
            FROM accounting.bills b
            WHERE b.operating_company_id = $1::uuid
              AND b.revoked_at IS NULL
              -- ACCT-F183: 'partially_paid' too — see accounting/fin20-aging.service.ts. Without
              -- it the cash-flow overview understates outgoing obligations.
              AND b.status IN ('unpaid', 'partial', 'partially_paid')
              AND COALESCE(b.due_date, b.bill_date) <= ${horizonEndSql}
          `,
          [companyId, asOf]
        );

      const settleRes = await client
        .query(
          `
            SELECT COALESCE(SUM(ROUND(s.net_pay::numeric * 100)), 0)::text AS amt
            FROM driver_finance.driver_settlements s
            WHERE s.operating_company_id = $1::uuid
              AND s.payment_state <> 'cleared'
              AND s.status IN ('locked', 'final', 'approved', 'paid', 'ready')
              AND s.period_end <= ${horizonEndSql}
              AND s.period_end >= $2::date
          `,
          [companyId, asOf]
        );

      const expectedAr = num(arRes.rows[0]?.amt);
      const expectedAp = num(apRes.rows[0]?.amt);
      const expectedSettle = num(settleRes.rows[0]?.amt);
      const netProjected = expectedAr - expectedAp - expectedSettle;

      // CASHFLOW-OVERVIEW-SIGNED-AMOUNT: banking.bank_transactions.amount_cents is NOT a normalized
      // magnitude for every ingestion path — live-verified on USMCA, Plaid-sourced credit
      // (is_credit=true, money IN) rows store amount_cents NEGATIVE (Plaid's own raw sign
      // convention), while debit rows store it positive. Summing t.amount_cents directly for
      // is_credit=true rows therefore summed negative numbers, producing a negative "inflow" —
      // live-observed as "Avg daily inflow: -$3,947.79" on /reports/cash-flow-overview. Direction
      // must come ONLY from is_credit (see bank-feed-gl-posting.service.ts's own law on this);
      // ABS() restores the magnitude regardless of which ingestion path signed it which way.
      const hist7 = await client
        .query(
          `
            SELECT
              COALESCE(
                SUM(CASE WHEN t.is_credit THEN ABS(t.amount_cents) ELSE 0 END),
                0
              )::text AS inflow,
              COALESCE(
                SUM(CASE WHEN NOT t.is_credit THEN ABS(t.amount_cents) ELSE 0 END),
                0
              )::text AS outflow
            FROM banking.bank_transactions t
            WHERE t.operating_company_id = $1::uuid
              AND t.pending = false
              AND t.transaction_date > ($2::date - INTERVAL '7 days')
              AND t.transaction_date <= $2::date
              ${bankTransactionHiddenFilterSql(hideOn, "t")}
          `,
          [companyId, asOf]
        );

      const hist30 = await client
        .query(
          `
            SELECT
              COALESCE(
                SUM(CASE WHEN t.is_credit THEN ABS(t.amount_cents) ELSE 0 END),
                0
              )::text AS inflow,
              COALESCE(
                SUM(CASE WHEN NOT t.is_credit THEN ABS(t.amount_cents) ELSE 0 END),
                0
              )::text AS outflow
            FROM banking.bank_transactions t
            WHERE t.operating_company_id = $1::uuid
              AND t.pending = false
              AND t.transaction_date > ($2::date - INTERVAL '30 days')
              AND t.transaction_date <= $2::date
              ${bankTransactionHiddenFilterSql(hideOn, "t")}
          `,
          [companyId, asOf]
        );

      const in7 = num(hist7.rows[0]?.inflow);
      const out7 = num(hist7.rows[0]?.outflow);
      const in30 = num(hist30.rows[0]?.inflow);
      const out30 = num(hist30.rows[0]?.outflow);

      const body: CashFlowPayload = {
        as_of_date: `${asOf}T00:00:00.000Z`,
        current_state: {
          operating_balance_cents: operating,
          dip_balance_cents: dip,
          payroll_balance_cents: payroll,
          factoring_reserves_held_cents: factoringReservesCents,
          factoring_advances_funded_mtd_cents: factoringAdvancesMtdCents,
          uncategorized_transactions_count: Math.floor(num(uncRes.rows[0]?.c)),
          chargebacks_open_cents: chargebacksOpenCents,
        },
        next_30_days: {
          expected_ar_collections_cents: expectedAr,
          expected_ap_outflows_cents: expectedAp,
          expected_settlement_outflows_cents: expectedSettle,
          net_projected_change_cents: netProjected,
        },
        historical: {
          last_7_days_inflows_cents: in7,
          last_7_days_outflows_cents: out7,
          last_30_days_avg_daily_inflow_cents: Math.round(in30 / 30),
          last_30_days_avg_daily_outflow_cents: Math.round(out30 / 30),
        },
      };

      return body;
    });

    cache.set(cacheKey, payload, 30_000);
    return payload;
  });
}
