/**
 * cash-flow.service.ts
 * Reads via existing mdata + accounting + banking DB tables.
 * NO new financial code — reads only.
 * Income basis = GROSS rate-confirmation (locked decision §2).
 * Driver pay accrual = DELIVERY date (locked decision §2).
 *
 * SCHEMA NOTE (2026-06-09 fix): this service previously queried a non-existent
 * `ih35_app.dispatch_loads`/`ih35_app.*` schema with guessed column names, so
 * EVERY call 500'd ("relation ih35_app.dispatch_loads does not exist"). The
 * real schema is:
 *   loads        → mdata.loads        (status enum, rate_total_cents, assigned_primary_driver_id)
 *   stops        → mdata.load_stops   (scheduled_arrival_at, stop_type)
 *   customers    → mdata.customers    (customer_name)
 *   drivers      → mdata.drivers      (first_name, last_name)
 *   vendors      → mdata.vendors      (vendor_name)
 *   bills        → accounting.bills   (amount_cents, paid_cents, due_date, status text)
 *   payments     → accounting.payments(payment_date, amount_cents, voided_at)
 *   bank txns    → banking.bank_transactions (is_credit, amount_cents, transaction_date)
 *   adjustments  → accounting.cash_flow_adjustments (already correct)
 */
import type pg from "pg";
import { logger } from "../observability/structured-logger.js";
import { bankAccountHiddenFilterSql, isBankAccountHideEnabled } from "../banking/bank-account-visibility.js";
import { sumAuthoritativeDepositoryCashCents } from "../banking/internal-wallet-balance.js";
import { projectedCashDateSql } from "./projected-cash-date.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
import { isFactoringPathLoadStatus } from "../dispatch/delivery-evidence-status.js";

type Queryable = pg.PoolClient;

// ─── Daily Prediction Types ───────────────────────────────────────────────────

export type IncomeLineItem = {
  load_id: string;
  load_number: string;
  customer_id: string | null;
  customer_name: string;
  delivery_time: string | null;
  amount_cents: number;
  basis: "Confirmed" | "Predicted" | "Proforma" | "Adjustment";
};

export type ExpenseLineItem = {
  label: string;
  amount_cents: number;
  kind: "driver_pay" | "bill_due" | "adjustment";
  load_id?: string;
  adjustment_id?: string;
  /** LINK-F5187 (cash-flow:tab.daily_prediction) -- real driver_finance.driver_settlements id. */
  settlement_id?: string;
  /** LINK-F5187 (cash-flow:tab.daily_prediction) -- real accounting.bills id. */
  bill_id?: string;
};

export type DailyPredictionResult = {
  date: string;
  income_items: IncomeLineItem[];
  income_subtotal_cents: number;
  expense_items: ExpenseLineItem[];
  expense_subtotal_cents: number;
  predicted_net_cents: number;
  opening_cash_cents: number | null;
  projected_closing_cash_cents: number | null;
  seven_day_strip: SevenDayEntry[];
};

export type SevenDayEntry = {
  date: string;
  predicted_net_cents: number;
};

// ─── Actual vs Projected Types ────────────────────────────────────────────────

export type AvpLineItem = {
  date: string;
  category: "income" | "expenses" | "net";
  projected_cents: number;
  actual_cents: number;
  variance_cents: number;
  variance_pct: number | null;
  // DEAD-SCHEMA-CASH-FLOW-SNAPSHOT-CAPTURED-AT-UNREAD — set only for an "income" line whose
  // projected_cents came from the frozen daily snapshot (forecast.cash_flow_projection_snapshots),
  // not the live recomputation. Lets a caller/human see WHEN a past day's frozen projection was
  // actually captured, distinct from prediction_date (the day it projects). null/undefined for
  // every other line — never fabricated for a live-computed figure.
  projected_captured_at?: string | null;
};

export type ActualVsProjectedResult = {
  from: string;
  to: string;
  lines: AvpLineItem[];
  accuracy_summary: {
    total_projected_income_cents: number;
    total_actual_income_cents: number;
    income_variance_pct: number | null;
    total_projected_expense_cents: number;
    total_actual_expense_cents: number;
    expense_variance_pct: number | null;
  };
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function variancePct(projected: number, actual: number): number | null {
  if (projected === 0) return null;
  return Math.round(((actual - projected) / Math.abs(projected)) * 10000) / 100;
}

/** Statuses that mean "this load is real revenue" (excludes only 'cancelled'). */
const ACTIVE_LOAD_FILTER = `l.status <> 'cancelled'`;

/**
 * CASH-1 fix (void-exclusion no-op): the canonical void write-path
 * (`accounting/bills.service.ts` `voidBill` / `voidBillPayment`) stores
 * `status = 'void'` (SINGULAR) and sets `revoked_at = now()` — it NEVER writes
 * `'voided'`. Filtering on `status <> 'voided'` alone therefore matched nothing
 * and let voided bills / bill-payments leak into the cash-flow figures.
 *
 * Match the authoritative reader (`bills.service.ts` `listBills`, which uses
 * `b.status IN ('void','voided') OR b.revoked_at IS NOT NULL` to identify voids,
 * and `b.revoked_at IS NULL` to hide them) and the posting engine (`status NOT IN
 * ('void', 'voided')`): a row is excluded if it is void/voided by status OR carries
 * a `revoked_at` timestamp. This is a pure exclusion-predicate fix — no amounts or
 * posting logic change.
 */
export function notVoidedSql(alias: string): string {
  return `${alias}.status NOT IN ('void', 'voided') AND ${alias}.revoked_at IS NULL`;
}

/** CASHFLOW-PROFORMA-PROJECTED-LABELED — a live proforma is the labeled projection for that load. */
export function noLiveProformaInvoiceSql(loadAlias: string): string {
  return `NOT EXISTS (
    SELECT 1
    FROM accounting.invoices i
    WHERE i.source_load_id = ${loadAlias}.id
      AND i.operating_company_id = ${loadAlias}.operating_company_id
      AND i.status = 'proforma'
      AND i.voided_at IS NULL
  )`;
}

/** Last delivery stop only — multi-drop must not multiply the invoice. */
export function lastDeliveryStopLateralSql(loadAlias: string): string {
  return `LEFT JOIN LATERAL (
    SELECT scheduled_arrival_at
    FROM mdata.load_stops
    WHERE load_id = ${loadAlias}.id AND stop_type = 'delivery'
    ORDER BY sequence_number DESC
    LIMIT 1
  ) fd ON true`;
}

/** Remaining projected cash: do not re-count paid or broker-advance dollars already in the bank. */
export function proformaRemainingCentsSql(invoiceAlias: string): string {
  return `GREATEST(
    COALESCE(${invoiceAlias}.total_cents, 0)
    - COALESCE(${invoiceAlias}.amount_paid_cents, 0)
    - COALESCE(${invoiceAlias}.broker_advance_applied_cents, 0)
  , 0)`;
}
/** Delivered-or-beyond → income is Confirmed rather than Predicted. */
function isConfirmedLoadStatus(status: string): boolean {
  return isFactoringPathLoadStatus(status) || status === "delivered";
}

// ─── Daily Prediction ─────────────────────────────────────────────────────────

export async function getDailyPrediction(
  client: Queryable,
  operatingCompanyId: string,
  date: string,
  // BLOCK 2: when CASH_FOLLOWS_ETA_ENABLED is on, bucket projected income by projected_cash_date
  // (effective delivery + receivable lag) instead of the raw delivery appointment. Default false =
  // current behaviour, byte-identical query.
  cashFollowsEta = false
): Promise<DailyPredictionResult> {
  // Income: projected gross rate_total_cents, bucketed onto `date`.
  const incomeSql = cashFollowsEta
    ? // FORECAST-only re-bucket: match on projected_cash_date = effective delivery + receivable lag.
      `
      WITH load_proj AS (
        SELECT
          l.id, l.load_number,
          l.customer_id,
          COALESCE(c.customer_name, 'Unknown') AS customer_name,
          fd.scheduled_arrival_at AS delivery_time,
          COALESCE(l.rate_total_cents, 0)::int AS rate_total_cents,
          l.status::text AS status,
          ${projectedCashDateSql({ deliveryScheduledExpr: "fd.scheduled_arrival_at" })} AS projected_cash_date
        FROM mdata.loads l
        LEFT JOIN mdata.customers c ON c.id = l.customer_id
                                   AND c.operating_company_id = l.operating_company_id
        LEFT JOIN catalogs.payment_terms pt ON pt.id = c.payment_terms_id
                                                      AND pt.operating_company_id = c.operating_company_id
        LEFT JOIN LATERAL (
          SELECT scheduled_arrival_at
          FROM mdata.load_stops
          WHERE load_id = l.id AND stop_type = 'delivery'
          ORDER BY sequence_number DESC
          LIMIT 1
        ) fd ON true
        WHERE l.operating_company_id = $1::uuid
          AND ${ACTIVE_LOAD_FILTER}
          AND ${noLiveProformaInvoiceSql("l")}
      )
      SELECT id::text, load_number, customer_id::text AS customer_id, customer_name, delivery_time::text AS delivery_time, rate_total_cents, status
      FROM load_proj
      WHERE projected_cash_date = $2::date
      ORDER BY delivery_time ASC NULLS LAST, load_number ASC
      `
    : `
    SELECT
      l.id::text,
      l.load_number,
      l.customer_id::text AS customer_id,
      COALESCE(c.customer_name, 'Unknown') AS customer_name,
      ls.scheduled_arrival_at::text AS delivery_time,
      COALESCE(l.rate_total_cents, 0)::int AS rate_total_cents,
      l.status::text AS status
    FROM mdata.loads l
    JOIN mdata.load_stops ls
      ON ls.load_id = l.id
      AND ls.stop_type = 'delivery'
      AND ls.scheduled_arrival_at::date = $2::date
    LEFT JOIN mdata.customers c ON c.id = l.customer_id
                               AND c.operating_company_id = l.operating_company_id
    WHERE l.operating_company_id = $1::uuid
      AND ${ACTIVE_LOAD_FILTER}
      AND ${noLiveProformaInvoiceSql("l")}
    ORDER BY ls.scheduled_arrival_at ASC NULLS LAST, l.load_number ASC
    `;
  const incomeRows = await client.query<{
    id: string;
    load_number: string;
    customer_id: string | null;
    customer_name: string;
    delivery_time: string | null;
    rate_total_cents: number;
    status: string;
  }>(incomeSql, [operatingCompanyId, date]);

  const proformaSql = `
      WITH ranked AS (
        SELECT DISTINCT ON (l.id)
          l.id,
          COALESCE(NULLIF(BTRIM(l.load_number), ''), i.display_id) AS load_number,
          l.customer_id,
          COALESCE(c.customer_name, 'Unknown') AS customer_name,
          fd.scheduled_arrival_at AS delivery_time,
          ${proformaRemainingCentsSql("i")}::int AS amount_cents,
          ${
            cashFollowsEta
              ? projectedCashDateSql({ deliveryScheduledExpr: "fd.scheduled_arrival_at" })
              : "fd.scheduled_arrival_at::date"
          } AS bucket_date
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
          AND ${ACTIVE_LOAD_FILTER}
        ORDER BY l.id, i.created_at DESC NULLS LAST
      )
      SELECT id::text, load_number, customer_id::text AS customer_id, customer_name, delivery_time::text AS delivery_time, amount_cents
      FROM ranked
      WHERE bucket_date = $2::date
      ORDER BY delivery_time ASC NULLS LAST, load_number ASC
    `;
  const proformaRows = await client.query<{
    id: string;
    load_number: string;
    customer_id: string | null;
    customer_name: string;
    delivery_time: string | null;
    amount_cents: number;
  }>(proformaSql, [operatingCompanyId, date]);

  const incomeItems: IncomeLineItem[] = [
    ...proformaRows.rows.map((row) => ({
      load_id: row.id,
      load_number: row.load_number,
      customer_id: row.customer_id,
      customer_name: row.customer_name,
      delivery_time: row.delivery_time,
      amount_cents: row.amount_cents ?? 0,
      basis: "Proforma" as const,
    })),
    ...incomeRows.rows.map((row) => ({
      load_id: row.id,
      load_number: row.load_number,
      customer_id: row.customer_id,
      customer_name: row.customer_name,
      delivery_time: row.delivery_time,
      amount_cents: row.rate_total_cents ?? 0,
      basis: isConfirmedLoadStatus(row.status) ? ("Confirmed" as const) : ("Predicted" as const),
    })),
  ];

  // Driver pay cash-outflow predictions (0441-mod10-cashflow-driverpay-hardcoded-empty).
  // Emit kind:"driver_pay" for settlements queued / sent_to_bank, or scheduled via
  // bank_settle_date / period_end. net_pay is dollars (numeric(14,2)) → cents for UI.
  // Read-only; no GL/posting. Wrapped so a driver_finance query error is non-fatal.
  const expenseItems: ExpenseLineItem[] = [];
  try {
    const driverPayRows = await client.query<{
      id: string;
      display_id: string | null;
      driver_name: string;
      load_id: string | null;
      amount_cents: number;
    }>(
      `
      SELECT
        s.id::text,
        s.display_id,
        COALESCE(
          NULLIF(TRIM(CONCAT(COALESCE(d.first_name, ''), ' ', COALESCE(d.last_name, ''))), ''),
          'Driver'
        ) AS driver_name,
        s.first_load_id::text AS load_id,
        ROUND(COALESCE(s.net_pay, 0) * 100)::int AS amount_cents
      FROM driver_finance.driver_settlements s
      LEFT JOIN mdata.drivers d ON d.id = s.driver_id
                             AND d.operating_company_id = s.operating_company_id
      WHERE s.operating_company_id = $1::uuid
        AND s.reversed_at IS NULL
        AND COALESCE(s.net_pay, 0) > 0
        AND COALESCE(s.payment_state, 'unpaid') NOT IN ('cleared', 'manual_paid', 'bounced')
        AND (
          COALESCE(s.payment_state, 'unpaid') IN ('queued', 'sent_to_bank')
          OR s.bank_settle_date IS NOT NULL
          OR (
            COALESCE(s.payment_state, 'unpaid') = 'unpaid'
            AND s.status IN ('locked', 'final', 'approved', 'posted')
          )
        )
        AND COALESCE(
          s.bank_settle_date,
          s.payment_sent_at::date,
          s.payment_queued_at::date,
          s.period_end
        ) = $2::date
      ORDER BY s.display_id ASC NULLS LAST, s.id ASC
      `,
      [operatingCompanyId, date]
    );

    for (const row of driverPayRows.rows) {
      const sid = row.display_id?.trim() || row.id.slice(0, 8);
      expenseItems.push({
        label: `Driver Pay — ${sid} · ${row.driver_name}`,
        amount_cents: row.amount_cents,
        kind: "driver_pay",
        load_id: row.load_id ?? undefined,
        // LINK-F5187 (cash-flow:tab.daily_prediction) -- the real settlement id was already
        // selected above; it was simply never carried into the response.
        settlement_id: row.id,
      });
    }
  } catch (err) {
    // GO-0016-CASH-FLOW-DRIVER-PAY-SILENT-DROP: this used to `catch {}` with zero logging — a real
    // driver_finance.driver_settlements query failure silently dropped every driver_pay line from
    // the daily cash-flow prediction, indistinguishable from "no driver pay due today". Unlike
    // reports/scheduled/runner.service.ts's own per-item catch (which at least counts failures into
    // its returned summary), this one left no signal anywhere the failure had occurred. Degrade
    // stays non-fatal on purpose (a broken driver-pay subquery must not take down the whole daily
    // prediction, same reasoning as BANK-F9521/lane-profitability's monthly refresh) — but it must
    // no longer be silent either.
    logger.warn("cash-flow: driver_pay subquery failed — daily prediction is missing driver_pay lines", {
      operating_company_id: operatingCompanyId,
      date,
      error_stack: err instanceof Error ? err.stack : String(err),
    });
  }

  // Bills due on this date (AP bills: insurance, fuel, factoring, etc.).
  // accounting.bills already tracks paid_cents, so remaining is computed directly.
  const billsRows = await client.query<{
    id: string;
    vendor_name: string;
    amount_cents: number;
    remaining_balance_cents: number;
  }>(
    `
    SELECT
      b.id::text,
      COALESCE(v.vendor_name, 'Vendor') AS vendor_name,
      COALESCE(b.amount_cents, 0)::int AS amount_cents,
      GREATEST(COALESCE(b.amount_cents, 0) - COALESCE(b.paid_cents, 0), 0)::int AS remaining_balance_cents
    FROM accounting.bills b
    LEFT JOIN mdata.vendors v ON v.id::text = b.vendor_id
                              AND v.operating_company_id = $1::uuid
    WHERE b.operating_company_id = $1::uuid
      AND b.due_date::date = $2::date
      AND b.status <> 'paid'
      AND ${notVoidedSql("b")}
    ORDER BY v.vendor_name ASC NULLS LAST
    `,
    [operatingCompanyId, date]
  );

  for (const bill of billsRows.rows) {
    expenseItems.push({
      label: `Bill — ${bill.vendor_name}`,
      amount_cents: bill.remaining_balance_cents,
      kind: "bill_due",
      // LINK-F5187 (cash-flow:tab.daily_prediction) -- the real bill id was already selected
      // above; it was simply never carried into the response.
      bill_id: bill.id,
    });
  }

  // Manual adjustments for this date (not archived).
  const adjustmentsRows = await client.query<{
    id: string;
    label: string;
    amount_cents: number;
  }>(
    `
    SELECT id::text, label, amount_cents::int
    FROM accounting.cash_flow_adjustments
    WHERE operating_company_id = $1::uuid
      AND entry_date = $2::date
      AND archived_at IS NULL
    ORDER BY created_at ASC
    `,
    [operatingCompanyId, date]
  );

  for (const adj of adjustmentsRows.rows) {
    expenseItems.push({
      label: adj.label,
      amount_cents: adj.amount_cents,
      kind: "adjustment",
      adjustment_id: adj.id,
    });
  }

  const incomeTotalCents = incomeItems.reduce((s, i) => s + i.amount_cents, 0);
  const expenseTotalCents = expenseItems.reduce((s, i) => s + i.amount_cents, 0);
  const predictedNetCents = incomeTotalCents - expenseTotalCents;

  // Opening cash = same authoritative depository total as Banking KPI total_cash and accounts/all
  // (sumAuthoritativeDepositoryCashCents): Plaid SUM(current_balance_cents) + non-Plaid internal-wallet
  // ledger derivation. Never re-sum bank_transactions for the Plaid-mixed population — that produced
  // the phantom -$4.79M opening (signed amount_cents + is_credit). Credit / investment / virtual
  // (factoring/escrow/advance) stay excluded via account_class='depository'. BANK-ACCOUNT-HIDE respected.
  //
  // BANK-ACCOUNT-HIDE-CAPABILITY-FAILURE-FAILS-OPEN — this used to `.catch(() => false)`, so a
  // schema/RLS/connection failure on the flag read silently meant "hide is OFF" and let accounts
  // that may be intentionally hidden for this entity back into opening cash. `false` is only a
  // safe default AFTER a successful read that says the flag is off — never a substitute for a
  // failed read. No catch: a broken flag read fails the request loud, same standard already
  // applied to accounting/cash-forecast.routes.ts's own (uncaught) call to this same function.
  const hideOn = await isBankAccountHideEnabled(client, operatingCompanyId);
  const openingCashCents = await sumAuthoritativeDepositoryCashCents(client, operatingCompanyId, {
    hideFilterOnBankAccounts: bankAccountHiddenFilterSql(hideOn, "banking.bank_accounts"),
    hideFilterOnBaAlias: bankAccountHiddenFilterSql(hideOn, "ba"),
  }).catch(() => null);
  const projectedClosingCents =
    openingCashCents !== null ? openingCashCents + predictedNetCents : null;

  // 7-day predicted-net strip (current date + next 6 days)
  const sevenDayStrip = await buildSevenDayStrip(client, operatingCompanyId, date, cashFollowsEta);

  return {
    date,
    income_items: incomeItems,
    income_subtotal_cents: incomeTotalCents,
    expense_items: expenseItems,
    expense_subtotal_cents: expenseTotalCents,
    predicted_net_cents: predictedNetCents,
    opening_cash_cents: openingCashCents,
    projected_closing_cash_cents: projectedClosingCents,
    seven_day_strip: sevenDayStrip,
  };
}

async function buildSevenDayStrip(
  client: Queryable,
  operatingCompanyId: string,
  startDate: string,
  cashFollowsEta = false
): Promise<SevenDayEntry[]> {
  const strip: SevenDayEntry[] = [];
  const base = new Date(startDate + "T00:00:00Z");
  // BLOCK 2 (flag ON): bucket the strip's income by projected_cash_date instead of the delivery
  // appointment. OFF (default) keeps the current correlated subquery byte-identical.
  // FIX (this PR): both the syntax error (an extra unmatched ")" at the end of this string that
  // broke the query with Postgres 42601 "syntax error at or near ')'", live-reproduced and
  // Neon-confirmed before fixing) AND a NULL-swallow bug -- SQL's `NULL + x = NULL`, so on any day
  // with a proforma-only income (no genuine non-proforma load delivering) the first term below
  // returned NULL and the whole addition vanished to NULL, then the outer COALESCE(...,0) silently
  // reported $0 even though the second term (the real proforma sum) was correct. Both terms are now
  // individually wrapped in COALESCE(...,0) before being added.
  const incomeSubquery = cashFollowsEta
    ? `COALESCE((
          SELECT SUM(COALESCE(l.rate_total_cents, 0))
          FROM mdata.loads l
          LEFT JOIN mdata.customers c ON c.id = l.customer_id
                                     AND c.operating_company_id = l.operating_company_id
          LEFT JOIN catalogs.payment_terms pt ON pt.id = c.payment_terms_id
                                                        AND pt.operating_company_id = c.operating_company_id
          LEFT JOIN LATERAL (
            SELECT scheduled_arrival_at FROM mdata.load_stops
            WHERE load_id = l.id AND stop_type = 'delivery'
            ORDER BY sequence_number DESC LIMIT 1
          ) fd ON true
          WHERE l.operating_company_id = $1::uuid
            AND ${ACTIVE_LOAD_FILTER}
            AND ${noLiveProformaInvoiceSql("l")}
            AND ${projectedCashDateSql({ deliveryScheduledExpr: "fd.scheduled_arrival_at" })} = $2::date
        ), 0)
        +
        COALESCE((
          SELECT SUM(amount_cents)
          FROM (
            SELECT DISTINCT ON (l.id)
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
              AND ${ACTIVE_LOAD_FILTER}
              AND ${projectedCashDateSql({ deliveryScheduledExpr: "fd.scheduled_arrival_at" })} = $2::date
            ORDER BY l.id, i.created_at DESC NULLS LAST
          ) pf
        ), 0)`
    : `COALESCE((
          SELECT SUM(COALESCE(l.rate_total_cents, 0))
          FROM mdata.loads l
          JOIN mdata.load_stops ls
            ON ls.load_id = l.id AND ls.stop_type = 'delivery'
            AND ls.scheduled_arrival_at::date = $2::date
          WHERE l.operating_company_id = $1::uuid
            AND ${ACTIVE_LOAD_FILTER}
            AND ${noLiveProformaInvoiceSql("l")}
        ), 0)
        +
        COALESCE((
          SELECT SUM(amount_cents)
          FROM (
            SELECT DISTINCT ON (l.id)
              ${proformaRemainingCentsSql("i")} AS amount_cents
            FROM accounting.invoices i
            JOIN mdata.loads l
              ON l.id = i.source_load_id
             AND l.operating_company_id = i.operating_company_id
            ${lastDeliveryStopLateralSql("l")}
            WHERE i.operating_company_id = $1::uuid
              AND i.status = 'proforma'
              AND i.voided_at IS NULL
              AND i.source_load_id IS NOT NULL
              AND ${ACTIVE_LOAD_FILTER}
              AND fd.scheduled_arrival_at::date = $2::date
            ORDER BY l.id, i.created_at DESC NULLS LAST
          ) pf
        ), 0)`;
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + i);
    const dateStr = d.toISOString().slice(0, 10);

    // Lightweight net: gross load income - (bills due + driver pay outflows), no opening balance.
    const netRow = await client.query<{ income_cents: number; expense_cents: number }>(
      `
      SELECT
        COALESCE(${incomeSubquery}, 0)::int AS income_cents,
        (
          COALESCE((
            SELECT SUM(GREATEST(COALESCE(b.amount_cents, 0) - COALESCE(b.paid_cents, 0), 0))
            FROM accounting.bills b
            WHERE b.operating_company_id = $1::uuid
              AND b.due_date::date = $2::date
              AND b.status <> 'paid'
              AND ${notVoidedSql("b")}
          ), 0)
          +
          COALESCE((
            SELECT SUM(ROUND(COALESCE(s.net_pay, 0) * 100)::bigint)
            FROM driver_finance.driver_settlements s
            WHERE s.operating_company_id = $1::uuid
              AND s.reversed_at IS NULL
              AND COALESCE(s.net_pay, 0) > 0
              AND COALESCE(s.payment_state, 'unpaid') NOT IN ('cleared', 'manual_paid', 'bounced')
              AND (
                COALESCE(s.payment_state, 'unpaid') IN ('queued', 'sent_to_bank')
                OR s.bank_settle_date IS NOT NULL
                OR (
                  COALESCE(s.payment_state, 'unpaid') = 'unpaid'
                  AND s.status IN ('locked', 'final', 'approved', 'posted')
                )
              )
              AND COALESCE(
                s.bank_settle_date,
                s.payment_sent_at::date,
                s.payment_queued_at::date,
                s.period_end
              ) = $2::date
          ), 0)
        )::int AS expense_cents
      `,
      [operatingCompanyId, dateStr]
    );

    const income = netRow.rows[0]?.income_cents ?? 0;
    const expense = netRow.rows[0]?.expense_cents ?? 0;
    strip.push({ date: dateStr, predicted_net_cents: income - expense });
  }
  return strip;
}

// ─── Actual vs Projected ──────────────────────────────────────────────────────

export async function getActualVsProjected(
  client: Queryable,
  operatingCompanyId: string,
  from: string,
  to: string,
  // BLOCK 2 (flag ON): bucket the PROJECTED side by projected_cash_date. Default OFF keeps the
  // current delivery-appointment bucketing byte-identical.
  cashFollowsEta = false
): Promise<ActualVsProjectedResult> {
  // Projected income: gross rate for loads, bucketed by delivery appt (OFF) or projected_cash_date (ON).
  const projIncomeSql = cashFollowsEta
    ? `
    WITH lp AS (
      SELECT
        COALESCE(l.rate_total_cents, 0) AS rate_total_cents,
        ${projectedCashDateSql({ deliveryScheduledExpr: "fd.scheduled_arrival_at" })} AS bucket_date
      FROM mdata.loads l
      LEFT JOIN mdata.customers c ON c.id = l.customer_id
                                 AND c.operating_company_id = l.operating_company_id
      LEFT JOIN catalogs.payment_terms pt ON pt.id = c.payment_terms_id
                                                    AND pt.operating_company_id = c.operating_company_id
      LEFT JOIN LATERAL (
        SELECT scheduled_arrival_at FROM mdata.load_stops
        WHERE load_id = l.id AND stop_type = 'delivery'
        ORDER BY sequence_number DESC LIMIT 1
      ) fd ON true
      WHERE l.operating_company_id = $1::uuid
        AND ${ACTIVE_LOAD_FILTER}
        AND ${noLiveProformaInvoiceSql("l")}
    ),
    pf AS (
      SELECT DISTINCT ON (l.id)
        ${proformaRemainingCentsSql("i")} AS amount_cents,
        ${projectedCashDateSql({ deliveryScheduledExpr: "fd.scheduled_arrival_at" })} AS bucket_date
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
        AND ${ACTIVE_LOAD_FILTER}
      ORDER BY l.id, i.created_at DESC NULLS LAST
    ),
    combined AS (
      SELECT bucket_date, rate_total_cents AS amount_cents FROM lp
      UNION ALL
      SELECT bucket_date, amount_cents FROM pf
    )
    SELECT bucket_date::text AS delivery_date, SUM(amount_cents)::int AS projected_income_cents
    FROM combined
    WHERE bucket_date BETWEEN $2::date AND $3::date
    GROUP BY bucket_date
    ORDER BY bucket_date
    `
    : `
    SELECT delivery_date, SUM(projected_income_cents)::int AS projected_income_cents
    FROM (
      SELECT
        ls.scheduled_arrival_at::date::text AS delivery_date,
        SUM(COALESCE(l.rate_total_cents, 0))::int AS projected_income_cents
      FROM mdata.loads l
      JOIN mdata.load_stops ls
        ON ls.load_id = l.id AND ls.stop_type = 'delivery'
      WHERE l.operating_company_id = $1::uuid
        AND ls.scheduled_arrival_at::date BETWEEN $2::date AND $3::date
        AND ${ACTIVE_LOAD_FILTER}
        AND ${noLiveProformaInvoiceSql("l")}
      GROUP BY ls.scheduled_arrival_at::date
      UNION ALL
      -- CASH-FLOW-CASHFOLLOWSETA-FALSE-BRANCH-ALIAS-SCOPE-BUG (found as a drive-by while fixing
      -- CASH-FLOW-ACTUAL-VS-PROJECTED-INCOME-STRUCTURALLY-ALWAYS-ZERO): this branch only runs when
      -- CASH_FOLLOWS_ETA_ENABLED is OFF for a company (currently ON for all 3 live entities via
      -- lib.feature_flag_overrides, so dead code in prod today — but reachable the moment any
      -- entity's override is removed or a new entity is added without one). 'fd' is the LATERAL
      -- alias from lastDeliveryStopLateralSql, in scope only INSIDE the 'pf' subquery below; the
      -- outer SELECT/GROUP BY referenced it anyway, which Postgres rejects at parse time
      -- ("missing FROM-clause entry for table fd") on every call, not merely when rows are absent.
      SELECT
        pf.scheduled_arrival_at::date::text AS delivery_date,
        SUM(amount_cents)::int AS projected_income_cents
      FROM (
        SELECT DISTINCT ON (l.id)
          fd.scheduled_arrival_at,
          ${proformaRemainingCentsSql("i")} AS amount_cents
        FROM accounting.invoices i
        JOIN mdata.loads l
          ON l.id = i.source_load_id
         AND l.operating_company_id = i.operating_company_id
        ${lastDeliveryStopLateralSql("l")}
        WHERE i.operating_company_id = $1::uuid
          AND i.status = 'proforma'
          AND i.voided_at IS NULL
          AND i.source_load_id IS NOT NULL
          AND ${ACTIVE_LOAD_FILTER}
          AND fd.scheduled_arrival_at::date BETWEEN $2::date AND $3::date
        ORDER BY l.id, i.created_at DESC NULLS LAST
      ) pf
      GROUP BY pf.scheduled_arrival_at::date
    ) u
    GROUP BY delivery_date
    ORDER BY delivery_date
    `;
  const projIncomeRows = await client.query<{ delivery_date: string; projected_income_cents: number }>(
    projIncomeSql,
    [operatingCompanyId, from, to]
  );

  // Actual income: payments received in range
  const actIncomeRows = await client.query<{ payment_date: string; actual_income_cents: number }>(
    `
    SELECT
      p.payment_date::date::text AS payment_date,
      SUM(p.amount_cents)::int AS actual_income_cents
    FROM accounting.payments p
    WHERE p.operating_company_id = $1::uuid
      AND p.payment_date::date BETWEEN $2::date AND $3::date
      AND p.voided_at IS NULL
    GROUP BY p.payment_date::date
    ORDER BY p.payment_date::date
    `,
    [operatingCompanyId, from, to]
  );

  // Projected expenses: bills due in range
  const projExpRows = await client.query<{ due_date: string; projected_expense_cents: number }>(
    `
    SELECT
      b.due_date::date::text AS due_date,
      SUM(COALESCE(b.amount_cents, 0))::int AS projected_expense_cents
    FROM accounting.bills b
    WHERE b.operating_company_id = $1::uuid
      AND b.due_date::date BETWEEN $2::date AND $3::date
      AND ${notVoidedSql("b")}
    GROUP BY b.due_date::date
    ORDER BY b.due_date::date
    `,
    [operatingCompanyId, from, to]
  );

  // Actual expenses: bill payments posted in range
  const actExpRows = await client.query<{ payment_date: string; actual_expense_cents: number }>(
    `
    SELECT
      bp.payment_date::date::text AS payment_date,
      SUM(COALESCE(bp.amount_cents, 0))::int AS actual_expense_cents
    FROM accounting.bill_payments bp
    WHERE bp.operating_company_id = $1::uuid
      AND bp.payment_date::date BETWEEN $2::date AND $3::date
      AND ${notVoidedSql("bp")}
    GROUP BY bp.payment_date::date
    ORDER BY bp.payment_date::date
    `,
    [operatingCompanyId, from, to]
  );

  // Build date-indexed maps
  const projIncomeMap = new Map<string, number>();
  for (const r of projIncomeRows.rows) projIncomeMap.set(r.delivery_date, r.projected_income_cents);

  // CASH-FLOW-ACTUAL-VS-PROJECTED-INCOME-STRUCTURALLY-ALWAYS-ZERO: for any date strictly before
  // today, prefer the frozen daily snapshot (captured each morning before that day's loads could
  // deliver/invoice/pay and retroactively zero out the live query above) over the live
  // recomputation. Today itself stays live — its own prediction is still evolving. A date with no
  // snapshot row (pre-fix history, or a missed cron day) silently keeps the live value already in
  // the map — never worse than before this fix, only better once a snapshot exists.
  const today = companyBusinessDate();
  const projIncomeCapturedAtMap = new Map<string, string>();
  if (from < today) {
    const snapshotRows = await client.query<{
      prediction_date: string;
      projected_income_cents: number;
      captured_at: string;
    }>(
      `
      SELECT prediction_date::text AS prediction_date, projected_income_cents::int AS projected_income_cents,
             captured_at::text AS captured_at
      FROM forecast.cash_flow_projection_snapshots
      WHERE operating_company_id = $1::uuid
        AND prediction_date BETWEEN $2::date AND LEAST($3::date, ($4::date - INTERVAL '1 day')::date)
      `,
      [operatingCompanyId, from, to, today]
    );
    for (const r of snapshotRows.rows) {
      projIncomeMap.set(r.prediction_date, r.projected_income_cents);
      // DEAD-SCHEMA-CASH-FLOW-SNAPSHOT-CAPTURED-AT-UNREAD — surface WHEN this frozen figure was
      // captured (distinct from prediction_date, the day it projects) to the response below.
      projIncomeCapturedAtMap.set(r.prediction_date, r.captured_at);
    }
  }

  const actIncomeMap = new Map<string, number>();
  for (const r of actIncomeRows.rows) actIncomeMap.set(r.payment_date, r.actual_income_cents);

  const projExpMap = new Map<string, number>();
  for (const r of projExpRows.rows) projExpMap.set(r.due_date, r.projected_expense_cents);

  const actExpMap = new Map<string, number>();
  for (const r of actExpRows.rows) actExpMap.set(r.payment_date, r.actual_expense_cents);

  // Enumerate all dates in range
  const allDates = new Set<string>([
    ...projIncomeMap.keys(),
    ...actIncomeMap.keys(),
    ...projExpMap.keys(),
    ...actExpMap.keys(),
  ]);

  const sortedDates = Array.from(allDates).sort();
  const lines: AvpLineItem[] = [];

  let totalProjIncome = 0;
  let totalActIncome = 0;
  let totalProjExp = 0;
  let totalActExp = 0;

  for (const date of sortedDates) {
    const projInc = projIncomeMap.get(date) ?? 0;
    const actInc = actIncomeMap.get(date) ?? 0;
    const projExp = projExpMap.get(date) ?? 0;
    const actExp = actExpMap.get(date) ?? 0;

    totalProjIncome += projInc;
    totalActIncome += actInc;
    totalProjExp += projExp;
    totalActExp += actExp;

    lines.push({
      date,
      category: "income",
      projected_cents: projInc,
      actual_cents: actInc,
      variance_cents: actInc - projInc,
      variance_pct: variancePct(projInc, actInc),
      projected_captured_at: projIncomeCapturedAtMap.get(date) ?? null,
    });
    lines.push({
      date,
      category: "expenses",
      projected_cents: projExp,
      actual_cents: actExp,
      variance_cents: actExp - projExp,
      variance_pct: variancePct(projExp, actExp),
    });
    lines.push({
      date,
      category: "net",
      projected_cents: projInc - projExp,
      actual_cents: actInc - actExp,
      variance_cents: actInc - actExp - (projInc - projExp),
      variance_pct: variancePct(projInc - projExp, actInc - actExp),
    });
  }

  return {
    from,
    to,
    lines,
    accuracy_summary: {
      total_projected_income_cents: totalProjIncome,
      total_actual_income_cents: totalActIncome,
      income_variance_pct: variancePct(totalProjIncome, totalActIncome),
      total_projected_expense_cents: totalProjExp,
      total_actual_expense_cents: totalActExp,
      expense_variance_pct: variancePct(totalProjExp, totalActExp),
    },
  };
}

// ─── Add Adjustment ───────────────────────────────────────────────────────────

export type AddAdjustmentInput = {
  operating_company_id: string;
  entry_date: string;
  label: string;
  amount_cents: number;
  created_by_user_id: string;
};

export type AdjustmentRow = {
  id: string;
  operating_company_id: string;
  entry_date: string;
  label: string;
  amount_cents: number;
  created_by_user_id: string;
  archived_at: string | null;
  created_at: string;
};

export async function addAdjustment(
  client: Queryable,
  input: AddAdjustmentInput
): Promise<AdjustmentRow> {
  const result = await client.query<AdjustmentRow>(
    `
    INSERT INTO accounting.cash_flow_adjustments
      (operating_company_id, entry_date, label, amount_cents, created_by_user_id)
    VALUES ($1, $2::date, $3, $4, $5)
    RETURNING
      id::text,
      operating_company_id::text,
      entry_date::text,
      label,
      amount_cents::int,
      created_by_user_id::text,
      archived_at::text,
      created_at::text
    `,
    [
      input.operating_company_id,
      input.entry_date,
      input.label,
      input.amount_cents,
      input.created_by_user_id,
    ]
  );
  return result.rows[0];
}

// ─── Archive Adjustment ─────────────────────────────────────────────────────
// CASHFLOW-ADJUSTMENT-NO-VOID-PATH: the table has carried archived_at + a "ARCHIVE never DELETE"
// migration comment since it was created (202606080200_cash_flow_adjustments.sql), but no route or
// UI ever set it — a mistaken/test manual adjustment could be created but never removed. Void-not-
// delete, RLS-scoped by operating_company_id (same predicate as every other query in this file).

export async function archiveAdjustment(
  client: Queryable,
  id: string,
  operatingCompanyId: string
): Promise<AdjustmentRow | null> {
  const result = await client.query<AdjustmentRow>(
    `
    UPDATE accounting.cash_flow_adjustments
    SET archived_at = now()
    WHERE id = $1::uuid
      AND operating_company_id = $2::uuid
      AND archived_at IS NULL
    RETURNING
      id::text,
      operating_company_id::text,
      entry_date::text,
      label,
      amount_cents::int,
      created_by_user_id::text,
      archived_at::text,
      created_at::text
    `,
    [id, operatingCompanyId]
  );
  return result.rows[0] ?? null;
}
