import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { buildForecastWeeks, type ForecastSettings } from "./cash-forecast.math.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
import { bankAccountHiddenFilterSql, isBankAccountHideEnabled } from "../banking/bank-account-visibility.js";
import { lastDeliveryStopLateralSql, proformaRemainingCentsSql } from "../cash-flow/cash-flow.service.js";
import { projectedCashDateSql } from "../cash-flow/projected-cash-date.js";
import { isEnabled } from "../lib/feature-flags/service.js";

const forecastQuerySchema = companyQuerySchema.extend({
  weeks: z.coerce.number().int().min(1).max(26).optional().default(13),
  as_of_date: z.string().date().optional(),
});

const settingsBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  fuel_estimate_weekly_cents: z.coerce.number().int().min(0).optional(),
  insurance_weekly_cents: z.coerce.number().int().min(0).optional(),
  lease_weekly_cents: z.coerce.number().int().min(0).optional(),
  payroll_weekly_cents: z.coerce.number().int().min(0).optional(),
});

function canAccessForecast(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Manager" || role === "Accountant";
}

function startOfWeekIso(input: string) {
  const d = new Date(`${input.slice(0, 10)}T00:00:00Z`);
  const weekday = d.getUTCDay();
  const offset = weekday === 0 ? 6 : weekday - 1;
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

function addDays(dateIso: string, days: number) {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function bucketStart(dateIso: string) {
  return startOfWeekIso(dateIso);
}

export async function registerCashForecastRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/cash-forecast/settings", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessForecast(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const settings = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT
            fuel_estimate_weekly_cents::int,
            insurance_weekly_cents::int,
            lease_weekly_cents::int,
            payroll_weekly_cents::int
          FROM accounting.cash_forecast_settings
          WHERE operating_company_id = $1::uuid
          LIMIT 1
        `,
        [query.data.operating_company_id]
      );
      return (
        res.rows[0] ?? {
          fuel_estimate_weekly_cents: 0,
          insurance_weekly_cents: 0,
          lease_weekly_cents: 0,
          payroll_weekly_cents: 0,
        }
      );
    });
    return { settings };
  });

  app.put("/api/v1/accounting/cash-forecast/settings", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessForecast(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const body = settingsBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const updated = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          INSERT INTO accounting.cash_forecast_settings (
            operating_company_id,
            fuel_estimate_weekly_cents,
            insurance_weekly_cents,
            lease_weekly_cents,
            payroll_weekly_cents,
            updated_by_user_id
          )
          VALUES ($1::uuid, $2::bigint, $3::bigint, $4::bigint, $5::bigint, $6::uuid)
          ON CONFLICT (operating_company_id)
          DO UPDATE SET
            fuel_estimate_weekly_cents = EXCLUDED.fuel_estimate_weekly_cents,
            insurance_weekly_cents = EXCLUDED.insurance_weekly_cents,
            lease_weekly_cents = EXCLUDED.lease_weekly_cents,
            payroll_weekly_cents = EXCLUDED.payroll_weekly_cents,
            updated_by_user_id = EXCLUDED.updated_by_user_id,
            updated_at = now()
          RETURNING
            fuel_estimate_weekly_cents::int,
            insurance_weekly_cents::int,
            lease_weekly_cents::int,
            payroll_weekly_cents::int
        `,
        [
          body.data.operating_company_id,
          body.data.fuel_estimate_weekly_cents ?? 0,
          body.data.insurance_weekly_cents ?? 0,
          body.data.lease_weekly_cents ?? 0,
          body.data.payroll_weekly_cents ?? 0,
          user.uuid,
        ]
      );
      return res.rows[0];
    });

    return { settings: updated };
  });

  // ACCT-F183: rate limit added because touching this file brought it into
  // verify-new-auth-routes-rate-limited's scope — an authorizing read with no limit trips CodeQL
  // js/missing-rate-limiting. 60/min matches the read-route convention (writes use 30/min).
  app.get("/api/v1/accounting/cash-forecast", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessForecast(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const query = forecastQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    // CASH-FLOW-DATE fix: default "today" must be the company's business date (America/Chicago), not UTC.
    // new Date().toISOString() rolls to tomorrow after ~6pm CT, showing the wrong day on the cash-position
    // screen and hiding today's real expected income/close — a trust-breaking financial display defect.
    const asOf = query.data.as_of_date ?? companyBusinessDate();
    const startWeek = startOfWeekIso(asOf);
    const endWeek = addDays(startWeek, query.data.weeks * 7 - 1);

    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const settingsRes = await client.query(
        `
          SELECT
            fuel_estimate_weekly_cents::int,
            insurance_weekly_cents::int,
            lease_weekly_cents::int,
            payroll_weekly_cents::int
          FROM accounting.cash_forecast_settings
          WHERE operating_company_id = $1::uuid
          LIMIT 1
        `,
        [query.data.operating_company_id]
      );
      const settings =
        settingsRes.rows[0] ?? ({ fuel_estimate_weekly_cents: 0, insurance_weekly_cents: 0, lease_weekly_cents: 0, payroll_weekly_cents: 0 } satisfies ForecastSettings);

      // BANK-ACCOUNT-HIDE: opening cash excludes accounts hidden for THIS entity (flag OFF by default —
      // see docs/accounting/BANK-ACCOUNT-ENTITY-HIDE-DESIGN.md).
      const hideOnForecast = await isBankAccountHideEnabled(client, query.data.operating_company_id);
      const cashRes = await client.query(
        `
          SELECT COALESCE(SUM(current_balance_cents), 0)::int AS total_cents
          FROM banking.bank_accounts
          WHERE operating_company_id = $1::uuid
            AND is_active = true
            -- Opening CASH = depository balances only. Credit cards / lines of credit
            -- carry debt (negative balances) and are liabilities, not cash on hand —
            -- including them wrongly dragged opening cash to -$5.5M (CASH-ANOMALY).
            AND COALESCE(account_type, '') NOT ILIKE '%credit%'
            ${bankAccountHiddenFilterSql(hideOnForecast, "banking.bank_accounts")}
        `,
        [query.data.operating_company_id]
      );
      const openingBalance = Number(cashRes.rows[0]?.total_cents ?? 0);

      // Open A/R only. Proforma is not legally owed (ACCT-F223 / aging) — it is projected income
      // bucketed on dispatch delivery date into expected_inflows.other.
      const arRes = await client.query(
        `
          SELECT due_date::text, COALESCE(amount_open_cents, 0)::int AS amount_cents
          FROM accounting.invoices
          WHERE operating_company_id = $1::uuid
            AND voided_at IS NULL
            AND COALESCE(amount_open_cents, 0) > 0
            AND status NOT IN ('void', 'voided', 'draft', 'proforma', 'factored')
            AND due_date BETWEEN $2::date AND $3::date
        `,
        [query.data.operating_company_id, startWeek, endWeek]
      );

      // ACCT-F9408: bucket by the same ETA-adjusted projected_cash_date /cash-flow already uses
      // (cash-flow.service.ts's getDailyPrediction/proformaSql), not the raw delivery-stop date —
      // otherwise a proforma whose real cash lands in the future, past this forecast's rolling
      // start, is bucketed onto a date that has already scrolled out of every visible week and
      // silently vanishes from both the weekly figure and the running projected balance. Reuses
      // the existing projectedCashDateSql helper — no new date math — gated on the same
      // CASH_FOLLOWS_ETA_ENABLED flag /cash-flow reads; OFF keeps this byte-identical to before.
      const cashFollowsEta = await isEnabled(client, "CASH_FOLLOWS_ETA_ENABLED", {
        operating_company_id: query.data.operating_company_id,
        user_uuid: user.uuid,
      });
      const proformaRes = await client.query(
        `
          SELECT
            bucket_date::text AS delivery_date,
            amount_cents::int AS amount_cents
          FROM (
            SELECT DISTINCT ON (l.id)
              ${
                cashFollowsEta
                  ? projectedCashDateSql({ deliveryScheduledExpr: "fd.scheduled_arrival_at" })
                  : "fd.scheduled_arrival_at::date"
              } AS bucket_date,
              ${proformaRemainingCentsSql("i")} AS amount_cents
            FROM accounting.invoices i
            JOIN mdata.loads l
              ON l.id = i.source_load_id
             AND l.operating_company_id = i.operating_company_id
            LEFT JOIN mdata.customers c ON c.id = l.customer_id
                                       AND c.operating_company_id = l.operating_company_id
            LEFT JOIN catalogs.payment_terms pt ON pt.id = c.payment_terms_id
                                                            AND pt.operating_company_id = c.operating_company_id
            ${lastDeliveryStopLateralSql("l")}
            WHERE i.operating_company_id = $1::uuid
              AND i.status = 'proforma'
              AND i.voided_at IS NULL
              AND i.source_load_id IS NOT NULL
              AND l.status <> 'cancelled'
            ORDER BY l.id, i.created_at DESC NULLS LAST
          ) pf
          WHERE bucket_date BETWEEN $2::date AND $3::date
        `,
        [query.data.operating_company_id, startWeek, endWeek]
      );

      const apRes = await client.query(
        `
          SELECT
            COALESCE(due_date, bill_date)::text AS due_date,
            GREATEST(COALESCE(amount_cents, 0) - COALESCE(paid_cents, 0), 0)::int AS amount_cents
          FROM accounting.bills
          WHERE operating_company_id = $1::uuid
            AND revoked_at IS NULL
            -- ACCT-F183: 'partially_paid' too. Omitting it drops partially-paid bills from the
            -- CASH FORECAST, so projected outflows look smaller than the money actually due.
            AND status IN ('open', 'partial', 'partially_paid', 'unpaid')
            AND COALESCE(due_date, bill_date) BETWEEN $2::date AND $3::date
        `,
        [query.data.operating_company_id, startWeek, endWeek]
      );

      const factoringRes = await client.query(
        `
          SELECT
            COALESCE(advanced_at::date, submitted_at::date)::text AS posted_date,
            COALESCE(advance_amount_cents, 0)::int AS advance_cents,
            COALESCE(factor_fee_cents, 0)::int AS fee_cents
          FROM accounting.factoring_advances
          WHERE operating_company_id = $1::uuid
            AND status IN ('submitted', 'advanced', 'reserve_held')
            AND COALESCE(advanced_at::date, submitted_at::date) BETWEEN $2::date AND $3::date
        `,
        [query.data.operating_company_id, startWeek, endWeek]
      );

      const inflowInvoices = new Map<string, number>();
      for (const row of arRes.rows) {
        const bucket = bucketStart(row.due_date);
        inflowInvoices.set(bucket, Number(inflowInvoices.get(bucket) ?? 0) + Number(row.amount_cents ?? 0));
      }

      const inflowOther = new Map<string, number>();
      for (const row of proformaRes.rows) {
        const bucket = bucketStart(row.delivery_date);
        inflowOther.set(bucket, Number(inflowOther.get(bucket) ?? 0) + Number(row.amount_cents ?? 0));
      }

      const outflowBills = new Map<string, number>();
      for (const row of apRes.rows) {
        const bucket = bucketStart(row.due_date);
        outflowBills.set(bucket, Number(outflowBills.get(bucket) ?? 0) + Number(row.amount_cents ?? 0));
      }

      const inflowFactoring = new Map<string, number>();
      const outflowFactoringFee = new Map<string, number>();
      for (const row of factoringRes.rows) {
        const bucket = bucketStart(row.posted_date);
        inflowFactoring.set(bucket, Number(inflowFactoring.get(bucket) ?? 0) + Number(row.advance_cents ?? 0));
        outflowFactoringFee.set(bucket, Number(outflowFactoringFee.get(bucket) ?? 0) + Number(row.fee_cents ?? 0));
      }

      const weeks = buildForecastWeeks({
        startWeek,
        weeks: query.data.weeks,
        openingBalance,
        settings,
        inflowInvoices,
        inflowFactoring,
        inflowOther,
        outflowBills,
        outflowFactoringFee,
      });

      return {
        as_of_date: asOf,
        weeks,
        opening_balance_cents: openingBalance,
        settings,
      };
    });

    return payload;
  });
}
