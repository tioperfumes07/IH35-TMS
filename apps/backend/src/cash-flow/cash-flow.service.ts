/**
 * cash-flow.service.ts
 * Reads via existing accounting + driver_finance DB tables.
 * NO new financial code — reads only.
 * Income basis = GROSS rate-confirmation (locked decision §2).
 * Driver pay accrual = DELIVERY date (locked decision §2).
 */
import type pg from "pg";

type Queryable = pg.PoolClient;

// ─── Daily Prediction Types ───────────────────────────────────────────────────

export type IncomeLineItem = {
  load_id: string;
  load_number: string;
  customer_name: string;
  delivery_time: string | null;
  amount_cents: number;
  basis: "Confirmed" | "Predicted" | "Adjustment";
};

export type ExpenseLineItem = {
  label: string;
  amount_cents: number;
  kind: "driver_pay" | "bill_due" | "adjustment";
  load_id?: string;
  adjustment_id?: string;
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

// ─── Daily Prediction ─────────────────────────────────────────────────────────

export async function getDailyPrediction(
  client: Queryable,
  operatingCompanyId: string,
  date: string
): Promise<DailyPredictionResult> {
  // Income: loads with a delivery stop scheduled/completed on `date`.
  // Amount = gross rate confirmation (rate_confirmation_cents or total_rate_cents).
  const incomeRows = await client.query<{
    id: string;
    load_number: string;
    customer_name: string;
    delivery_time: string | null;
    rate_confirmation_cents: number | null;
    dispatch_status: string;
  }>(
    `
    SELECT
      l.id::text,
      l.load_number,
      COALESCE(c.name, 'Unknown') AS customer_name,
      ls.scheduled_arrival::text AS delivery_time,
      COALESCE(l.rate_confirmation_cents, l.total_rate_cents, 0)::int AS rate_confirmation_cents,
      l.dispatch_status
    FROM ih35_app.dispatch_loads l
    JOIN ih35_app.load_stops ls
      ON ls.load_id = l.id
      AND ls.stop_type = 'delivery'
      AND ls.scheduled_arrival::date = $2::date
    LEFT JOIN ih35_app.customers c ON c.id = l.customer_id
    WHERE l.operating_company_id = $1
      AND l.dispatch_status NOT IN ('cancelled', 'abandoned', 'driver_walkoff', 'driver_no_show')
    ORDER BY ls.scheduled_arrival ASC NULLS LAST, l.load_number ASC
    `,
    [operatingCompanyId, date]
  );

  const incomeItems: IncomeLineItem[] = incomeRows.rows.map((row) => ({
    load_id: row.id,
    load_number: row.load_number,
    customer_name: row.customer_name,
    delivery_time: row.delivery_time,
    amount_cents: row.rate_confirmation_cents ?? 0,
    basis: row.dispatch_status === "completed_docs_received" || row.dispatch_status === "delivered_pending_docs"
      ? "Confirmed"
      : "Predicted",
  }));

  // Driver pay: accrued on delivery date. One row per delivering load.
  const driverPayRows = await client.query<{
    load_id: string;
    load_number: string;
    driver_name: string;
    driver_pay_cents: number;
  }>(
    `
    SELECT
      l.id::text AS load_id,
      l.load_number,
      COALESCE(d.full_name, 'Driver') AS driver_name,
      COALESCE(SUM(sle.amount_cents), 0)::int AS driver_pay_cents
    FROM ih35_app.dispatch_loads l
    JOIN ih35_app.load_stops ls
      ON ls.load_id = l.id
      AND ls.stop_type = 'delivery'
      AND ls.scheduled_arrival::date = $2::date
    LEFT JOIN ih35_app.drivers d ON d.id = l.primary_driver_id
    LEFT JOIN ih35_app.settlement_load_earnings sle
      ON sle.load_id = l.id
      AND sle.earning_type != 'deduction'
    WHERE l.operating_company_id = $1
      AND l.dispatch_status NOT IN ('cancelled', 'abandoned', 'driver_walkoff', 'driver_no_show')
    GROUP BY l.id, l.load_number, d.full_name
    `,
    [operatingCompanyId, date]
  );

  const expenseItems: ExpenseLineItem[] = driverPayRows.rows
    .filter((r) => r.driver_pay_cents > 0)
    .map((row) => ({
      label: `Driver pay — Load #${row.load_number} (${row.driver_name})`,
      amount_cents: row.driver_pay_cents,
      kind: "driver_pay" as const,
      load_id: row.load_id,
    }));

  // Bills due on this date (AP bills: insurance, fuel, factoring, etc.)
  const billsRows = await client.query<{
    id: string;
    vendor_name: string;
    amount_cents: number;
    remaining_balance_cents: number;
  }>(
    `
    SELECT
      b.id::text,
      COALESCE(v.name, 'Vendor') AS vendor_name,
      b.amount_cents::int,
      GREATEST(b.amount_cents - COALESCE(paid.paid_cents, 0), 0)::int AS remaining_balance_cents
    FROM ih35_app.bills b
    LEFT JOIN ih35_app.vendors v ON v.id = b.vendor_id
    LEFT JOIN (
      SELECT bill_id, SUM(amount_cents) AS paid_cents
      FROM ih35_app.bill_payments
      WHERE voided_at IS NULL
      GROUP BY bill_id
    ) paid ON paid.bill_id = b.id
    WHERE b.operating_company_id = $1
      AND b.due_date::date = $2::date
      AND b.status NOT IN ('paid', 'voided')
    ORDER BY v.name ASC NULLS LAST
    `,
    [operatingCompanyId, date]
  );

  for (const bill of billsRows.rows) {
    expenseItems.push({
      label: `Bill — ${bill.vendor_name}`,
      amount_cents: bill.remaining_balance_cents,
      kind: "bill_due",
    });
  }

  // Manual adjustments for this date (not archived)
  const adjustmentsRows = await client.query<{
    id: string;
    label: string;
    amount_cents: number;
  }>(
    `
    SELECT id::text, label, amount_cents::int
    FROM accounting.cash_flow_adjustments
    WHERE operating_company_id = $1
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

  // Opening cash: latest bank balance before this date
  const openingRow = await client.query<{ balance_cents: number | null }>(
    `
    SELECT COALESCE(SUM(
      CASE WHEN t.transaction_type = 'credit' THEN t.amount_cents
           ELSE -t.amount_cents
      END
    ), 0)::int AS balance_cents
    FROM ih35_app.bank_transactions t
    WHERE t.operating_company_id = $1
      AND t.transaction_date < $2::date
    `,
    [operatingCompanyId, date]
  ).catch(() => ({ rows: [{ balance_cents: null }] }));

  const openingCashCents = openingRow.rows[0]?.balance_cents ?? null;
  const projectedClosingCents =
    openingCashCents !== null ? openingCashCents + predictedNetCents : null;

  // 7-day predicted-net strip (current date + next 6 days)
  const sevenDayStrip = await buildSevenDayStrip(client, operatingCompanyId, date);

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
  startDate: string
): Promise<SevenDayEntry[]> {
  const strip: SevenDayEntry[] = [];
  const base = new Date(startDate + "T00:00:00Z");
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + i);
    const dateStr = d.toISOString().slice(0, 10);

    // Lightweight net: income - expenses, no opening balance needed
    const netRow = await client.query<{ income_cents: number; expense_cents: number }>(
      `
      SELECT
        COALESCE((
          SELECT SUM(COALESCE(l.rate_confirmation_cents, l.total_rate_cents, 0))
          FROM ih35_app.dispatch_loads l
          JOIN ih35_app.load_stops ls
            ON ls.load_id = l.id AND ls.stop_type = 'delivery'
            AND ls.scheduled_arrival::date = $2::date
          WHERE l.operating_company_id = $1
            AND l.dispatch_status NOT IN ('cancelled','abandoned','driver_walkoff','driver_no_show')
        ), 0)::int AS income_cents,
        COALESCE((
          SELECT SUM(GREATEST(b.amount_cents - COALESCE(paid.paid_cents,0), 0))
          FROM ih35_app.bills b
          LEFT JOIN (
            SELECT bill_id, SUM(amount_cents) AS paid_cents
            FROM ih35_app.bill_payments WHERE voided_at IS NULL GROUP BY bill_id
          ) paid ON paid.bill_id = b.id
          WHERE b.operating_company_id = $1
            AND b.due_date::date = $2::date
            AND b.status NOT IN ('paid','voided')
        ), 0)::int AS expense_cents
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
  to: string
): Promise<ActualVsProjectedResult> {
  // Projected income: gross rate-conf for loads delivering in range
  const projIncomeRows = await client.query<{ delivery_date: string; projected_income_cents: number }>(
    `
    SELECT
      ls.scheduled_arrival::date::text AS delivery_date,
      SUM(COALESCE(l.rate_confirmation_cents, l.total_rate_cents, 0))::int AS projected_income_cents
    FROM ih35_app.dispatch_loads l
    JOIN ih35_app.load_stops ls
      ON ls.load_id = l.id AND ls.stop_type = 'delivery'
    WHERE l.operating_company_id = $1
      AND ls.scheduled_arrival::date BETWEEN $2::date AND $3::date
      AND l.dispatch_status NOT IN ('cancelled','abandoned','driver_walkoff','driver_no_show')
    GROUP BY ls.scheduled_arrival::date
    ORDER BY ls.scheduled_arrival::date
    `,
    [operatingCompanyId, from, to]
  );

  // Actual income: invoices/payments received in range
  const actIncomeRows = await client.query<{ payment_date: string; actual_income_cents: number }>(
    `
    SELECT
      p.payment_date::date::text AS payment_date,
      SUM(p.amount_cents)::int AS actual_income_cents
    FROM ih35_app.payments p
    WHERE p.operating_company_id = $1
      AND p.payment_date::date BETWEEN $2::date AND $3::date
      AND p.voided_at IS NULL
    GROUP BY p.payment_date::date
    ORDER BY p.payment_date::date
    `,
    [operatingCompanyId, from, to]
  );

  // Projected expenses: bills due + driver pay in range
  const projExpRows = await client.query<{ due_date: string; projected_expense_cents: number }>(
    `
    SELECT
      b.due_date::date::text AS due_date,
      SUM(b.amount_cents)::int AS projected_expense_cents
    FROM ih35_app.bills b
    WHERE b.operating_company_id = $1
      AND b.due_date::date BETWEEN $2::date AND $3::date
      AND b.status NOT IN ('voided')
    GROUP BY b.due_date::date
    ORDER BY b.due_date::date
    `,
    [operatingCompanyId, from, to]
  );

  // Actual expenses: bill payments + settlements posted in range
  const actExpRows = await client.query<{ payment_date: string; actual_expense_cents: number }>(
    `
    SELECT
      bp.payment_date::date::text AS payment_date,
      SUM(bp.amount_cents)::int AS actual_expense_cents
    FROM ih35_app.bill_payments bp
    WHERE bp.operating_company_id = $1
      AND bp.payment_date::date BETWEEN $2::date AND $3::date
      AND bp.voided_at IS NULL
    GROUP BY bp.payment_date::date
    ORDER BY bp.payment_date::date
    `,
    [operatingCompanyId, from, to]
  );

  // Build date-indexed maps
  const projIncomeMap = new Map<string, number>();
  for (const r of projIncomeRows.rows) projIncomeMap.set(r.delivery_date, r.projected_income_cents);

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
