// AF-6 — Finance Hub landing dashboard (READ-ONLY).
//
// Aggregates a handful of headline KPIs for ONE operating company from EXISTING, already-built
// read surfaces — nothing here invents schema, posts, or writes. Every statement is a SELECT
// (the cash-position KPI delegates to the FIN-cash-flow read service, which is itself read-only).
//
// Sources reused as-is:
//   • cash position        → getCashFlowReport().cash_at_end (catalogs.accounts cash subtypes)
//   • A/R open + aging      → views.ar_aging          (security_invoker, opco-scoped)
//   • A/P open + aging      → views.ap_aging          (security_invoker, opco-scoped)
//   • current period        → accounting.periods       (status open|closing|closed)
//   • fixed assets NBV      → accounting.fixed_assets  + computeDepreciationSchedule (FIN-21 math)
//   • QBO sync health       → views.qbo_sync_health    (opco-scoped via app.operating_company_id)
//
// Each KPI carries a `drill_to` route string pointing at the real screen that owns that data.
// Money is integer cents. Per-entity only — no cross-entity totals.

import { withCurrentUser } from "../auth/db.js";
import { getCashFlowReport } from "./cash-flow.service.js";
import { computeDepreciationSchedule, asOfToday } from "./fixed-assets.math.js";

export type FinanceHubKpiKind = "money_cents" | "count" | "text";

export type FinanceHubKpi = {
  key: string;
  label: string;
  // The headline figure. money_cents → integer cents; count → integer; text → a short status string.
  value_kind: FinanceHubKpiKind;
  value: number | string;
  // Optional supporting line (e.g. "12 open invoices · 3 past due").
  secondary: string | null;
  // Drill-through to the real, owning screen.
  drill_to: string;
  drill_label: string;
};

export type FinanceHubOverview = {
  operating_company_id: string;
  generated_at: string;
  read_only: true;
  kpis: FinanceHubKpi[];
};

const num = (v: unknown): number => Number(v ?? 0);

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function startOfYearIso(): string {
  return `${new Date().getUTCFullYear()}-01-01`;
}

type AgingTotals = {
  total_open_cents: number;
  current_cents: number;
  past_due_cents: number;
  open_count: number;
};

async function readArTotals(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  operatingCompanyId: string,
): Promise<AgingTotals> {
  const res = await client.query(
    `
      SELECT
        COALESCE(SUM(total_open_cents), 0)::bigint   AS total_open_cents,
        COALESCE(SUM(current_cents), 0)::bigint      AS current_cents,
        COALESCE(SUM(open_invoice_count), 0)::bigint AS open_count
      FROM views.ar_aging
      WHERE operating_company_id = $1::uuid
    `,
    [operatingCompanyId],
  );
  const r = res.rows[0] ?? {};
  const total = num(r.total_open_cents);
  const current = num(r.current_cents);
  return { total_open_cents: total, current_cents: current, past_due_cents: Math.max(total - current, 0), open_count: num(r.open_count) };
}

async function readApTotals(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  operatingCompanyId: string,
): Promise<AgingTotals> {
  const res = await client.query(
    `
      SELECT
        COALESCE(SUM(total_open_cents), 0)::bigint AS total_open_cents,
        COALESCE(SUM(current_cents), 0)::bigint    AS current_cents,
        COALESCE(SUM(open_bill_count), 0)::bigint  AS open_count
      FROM views.ap_aging
      WHERE operating_company_id = $1::uuid
    `,
    [operatingCompanyId],
  );
  const r = res.rows[0] ?? {};
  const total = num(r.total_open_cents);
  const current = num(r.current_cents);
  return { total_open_cents: total, current_cents: current, past_due_cents: Math.max(total - current, 0), open_count: num(r.open_count) };
}

async function readCurrentPeriod(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  operatingCompanyId: string,
): Promise<{ period_label: string | null; status: string | null } | null> {
  const res = await client.query(
    `
      SELECT period_label, status
      FROM accounting.periods
      WHERE operating_company_id = $1::uuid
      ORDER BY
        (CASE WHEN CURRENT_DATE BETWEEN period_start AND period_end THEN 0 ELSE 1 END) ASC,
        period_start DESC
      LIMIT 1
    `,
    [operatingCompanyId],
  );
  const r = res.rows[0];
  if (!r) return null;
  return { period_label: r.period_label == null ? null : String(r.period_label), status: r.status == null ? null : String(r.status) };
}

async function readFixedAssets(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  operatingCompanyId: string,
): Promise<{ count: number; net_book_value_cents: number }> {
  // Mirrors fixed-assets.routes.ts list compute: NBV = book-value roll-forward as of today.
  const res = await client.query(
    `
      SELECT
        purchase_price_cents::text          AS purchase_price_cents,
        salvage_value_cents::text           AS salvage_value_cents,
        prior_accumulated_depr_cents::text  AS prior_accumulated_depr_cents,
        in_service_date::text               AS in_service_date,
        method, useful_life_months, convention
      FROM accounting.fixed_assets
      WHERE operating_company_id = $1::uuid
        AND is_active = true
        AND status <> 'voided'
    `,
    [operatingCompanyId],
  );
  let nbv = 0;
  for (const r of res.rows) {
    const compute = computeDepreciationSchedule({
      purchase_price_cents: num(r.purchase_price_cents),
      salvage_value_cents: num(r.salvage_value_cents),
      in_service_date: String(r.in_service_date),
      method: String(r.method),
      useful_life_months: num(r.useful_life_months),
      convention: String(r.convention),
      prior_accumulated_depr_cents: num(r.prior_accumulated_depr_cents),
    });
    const now = asOfToday(compute.rows);
    nbv += compute.rows.length ? now.book_value_now_cents : num(r.purchase_price_cents) - num(r.prior_accumulated_depr_cents);
  }
  return { count: res.rows.length, net_book_value_cents: nbv };
}

async function readQboSyncHealth(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
): Promise<{ out_of_sync_entities: number; pending_count: number }> {
  // views.qbo_sync_health is opco-scoped via app.operating_company_id (set by the caller's scope).
  const res = await client.query(
    `
      SELECT
        COALESCE(SUM(CASE WHEN qbo_count IS NOT NULL AND local_count <> qbo_count THEN 1 ELSE 0 END), 0)::bigint AS out_of_sync,
        COALESCE(SUM(pending_count), 0)::bigint AS pending
      FROM views.qbo_sync_health
    `,
  );
  const r = res.rows[0] ?? {};
  return { out_of_sync_entities: num(r.out_of_sync), pending_count: num(r.pending) };
}

export async function getFinanceHubOverview(input: {
  userId: string;
  operating_company_id: string;
}): Promise<FinanceHubOverview> {
  const { userId, operating_company_id } = input;

  // Cash position reuses the read-only cash-flow service (manages its own opco-scoped client).
  // YTD range so cash_at_end reflects the live cash balance.
  let cashAtEndCents = 0;
  try {
    const cashFlow = await getCashFlowReport({ userId, operating_company_id, from_date: startOfYearIso(), to_date: todayIsoDate() });
    cashAtEndCents = num(cashFlow.cash_at_end);
  } catch {
    cashAtEndCents = 0;
  }

  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operating_company_id]);

    const [ar, ap, period, fixedAssets, qbo] = await Promise.all([
      readArTotals(client, operating_company_id),
      readApTotals(client, operating_company_id),
      readCurrentPeriod(client, operating_company_id),
      readFixedAssets(client, operating_company_id),
      readQboSyncHealth(client),
    ]);

    const kpis: FinanceHubKpi[] = [
      {
        key: "cash_position",
        label: "Cash position",
        value_kind: "money_cents",
        value: cashAtEndCents,
        secondary: "Cash on hand, year to date",
        drill_to: "/cash-flow",
        drill_label: "View cash flow",
      },
      {
        key: "accounts_receivable",
        label: "Accounts receivable (open)",
        value_kind: "money_cents",
        value: ar.total_open_cents,
        secondary: `${ar.open_count} open invoice${ar.open_count === 1 ? "" : "s"} · ${money(ar.past_due_cents)} past due`,
        drill_to: "/finance/ar-ap-aging",
        drill_label: "View A/R aging",
      },
      {
        key: "accounts_payable",
        label: "Accounts payable (open)",
        value_kind: "money_cents",
        value: ap.total_open_cents,
        secondary: `${ap.open_count} open bill${ap.open_count === 1 ? "" : "s"} · ${money(ap.past_due_cents)} past due`,
        drill_to: "/finance/ar-ap-aging",
        drill_label: "View A/P aging",
      },
      {
        key: "accounting_period",
        label: "Current accounting period",
        value_kind: "text",
        value: period?.period_label ?? "Not set up",
        secondary: period ? `Status: ${period.status ?? "unknown"}` : "No accounting periods defined",
        drill_to: "/finance/statements",
        drill_label: "View financial statements",
      },
      {
        key: "fixed_assets",
        label: "Fixed assets (net book value)",
        value_kind: "money_cents",
        value: fixedAssets.net_book_value_cents,
        secondary: `${fixedAssets.count} asset${fixedAssets.count === 1 ? "" : "s"} on the books`,
        drill_to: "/accounting/fixed-assets",
        drill_label: "View fixed assets",
      },
      {
        key: "qbo_sync_health",
        label: "QuickBooks sync health",
        value_kind: "text",
        value: qbo.out_of_sync_entities === 0 ? "In sync" : `${qbo.out_of_sync_entities} entit${qbo.out_of_sync_entities === 1 ? "y" : "ies"} drifting`,
        secondary: `${qbo.pending_count} item${qbo.pending_count === 1 ? "" : "s"} pending sync`,
        drill_to: "/accounting/qbo-reconcile",
        drill_label: "View QBO reconciliation",
      },
    ];

    return {
      operating_company_id,
      generated_at: new Date().toISOString(),
      read_only: true as const,
      kpis,
    };
  });
}
