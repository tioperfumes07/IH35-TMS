/**
 * ACCT-R-15 — Cost-center Class variance (READ-ONLY).
 *
 * QBO/NetSuite cost dimension = catalogs.classes (Class). No parallel
 * cost_centers table (would be NEW SPEC + migration). Rolls expense/COGS/
 * OtherExpense JE postings by class across two periods and returns variance.
 * Unclassified (NULL class_id) is an explicit row — density honesty.
 */
import type { PoolClient } from "pg";

const COST_ACCOUNT_TYPES = ["Expense", "CostOfGoodsSold", "OtherExpense"] as const;

export type CostCenterClassVarianceRow = {
  class_id: string | null;
  class_name: string;
  class_code: string | null;
  period_1_cost_cents: number;
  period_2_cost_cents: number;
  variance_cents: number;
  variance_pct: number | null;
  posting_lines_period_1: number;
  posting_lines_period_2: number;
};

export type CostCenterClassVarianceSummary = {
  dimension: "catalogs.classes";
  periods: [string, string];
  period_bounds: [{ start: string; end: string }, { start: string; end: string }];
  classes_active: number;
  classified_posting_lines: number;
  unclassified_posting_lines: number;
  rows: CostCenterClassVarianceRow[];
};

type ResolvedPeriod = { label: string; startDate: string; endDate: string };

function parseYearMonth(label: string): ResolvedPeriod | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(label);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return { label, startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

function parseYearQuarter(label: string): ResolvedPeriod | null {
  const match = /^(\d{4})-Q([1-4])$/i.exec(label);
  if (!match) return null;
  const year = Number(match[1]);
  const quarter = Number(match[2]);
  const startMonth = (quarter - 1) * 3;
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + 3, 0));
  return { label, startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

function parsePeriodLabel(label: string): ResolvedPeriod {
  const quarter = parseYearQuarter(label.trim());
  if (quarter) return quarter;
  const month = parseYearMonth(label.trim());
  if (month) return month;
  throw new Error("invalid_periods");
}

function parsePeriods(periodsCsv: string): [ResolvedPeriod, ResolvedPeriod] {
  const parts = periodsCsv
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length !== 2) throw new Error("invalid_periods");
  return [parsePeriodLabel(parts[0]!), parsePeriodLabel(parts[1]!)];
}

function variancePct(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Number((((current - previous) / Math.abs(previous)) * 100).toFixed(2));
}

type AggRow = {
  class_id: string | null;
  class_name: string | null;
  class_code: string | null;
  cost_cents: string;
  line_count: string;
};

async function costByClass(
  client: PoolClient,
  operatingCompanyId: string,
  startDate: string,
  endDate: string,
): Promise<Map<string, AggRow>> {
  const res = await client.query<AggRow>(
    `
      SELECT
        p.class_id::text AS class_id,
        c.class_name,
        c.class_code,
        COALESCE(SUM(
          CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END
        ), 0)::text AS cost_cents,
        COUNT(*)::text AS line_count
      FROM accounting.journal_entry_postings p
      INNER JOIN accounting.journal_entries je
        ON je.id = p.journal_entry_uuid
       AND je.operating_company_id = p.operating_company_id
      INNER JOIN catalogs.accounts a
        ON a.id = p.account_id
       AND a.operating_company_id = p.operating_company_id
      LEFT JOIN catalogs.classes c
        ON c.id = p.class_id
       AND c.operating_company_id = p.operating_company_id
      WHERE p.operating_company_id = $1::uuid
        AND je.voided_at IS NULL
        AND je.entry_date BETWEEN $2::date AND $3::date
        AND a.account_type = ANY($4::text[])
      GROUP BY p.class_id, c.class_name, c.class_code
    `,
    [operatingCompanyId, startDate, endDate, [...COST_ACCOUNT_TYPES]],
  );
  const map = new Map<string, AggRow>();
  for (const row of res.rows) {
    map.set(row.class_id ?? "__unclassified__", row);
  }
  return map;
}

export async function getCostCenterClassVariance(
  client: PoolClient,
  operatingCompanyId: string,
  periodsCsv: string,
): Promise<CostCenterClassVarianceSummary> {
  const [p1, p2] = parsePeriods(periodsCsv);

  const [map1, map2, classCountRes, densityRes] = await Promise.all([
    costByClass(client, operatingCompanyId, p1.startDate, p1.endDate),
    costByClass(client, operatingCompanyId, p2.startDate, p2.endDate),
    client.query<{ n: string }>(
      `
        SELECT COUNT(*)::text AS n
        FROM catalogs.classes
        WHERE operating_company_id = $1::uuid
          AND deactivated_at IS NULL
      `,
      [operatingCompanyId],
    ),
    client.query<{ classified: string; unclassified: string }>(
      `
        SELECT
          COUNT(*) FILTER (WHERE p.class_id IS NOT NULL)::text AS classified,
          COUNT(*) FILTER (WHERE p.class_id IS NULL)::text AS unclassified
        FROM accounting.journal_entry_postings p
        INNER JOIN accounting.journal_entries je
          ON je.id = p.journal_entry_uuid
         AND je.operating_company_id = p.operating_company_id
        INNER JOIN catalogs.accounts a
          ON a.id = p.account_id
         AND a.operating_company_id = p.operating_company_id
        WHERE p.operating_company_id = $1::uuid
          AND je.voided_at IS NULL
          AND a.account_type = ANY($2::text[])
      `,
      [operatingCompanyId, [...COST_ACCOUNT_TYPES]],
    ),
  ]);

  const keys = new Set<string>([...map1.keys(), ...map2.keys()]);
  const rows: CostCenterClassVarianceRow[] = [];
  for (const key of keys) {
    const a = map1.get(key);
    const b = map2.get(key);
    const period1 = Number(a?.cost_cents ?? 0);
    const period2 = Number(b?.cost_cents ?? 0);
    const classId = a?.class_id ?? b?.class_id ?? null;
    const className =
      a?.class_name ?? b?.class_name ?? (classId ? "(missing class name)" : "(unclassified)");
    const classCode = a?.class_code ?? b?.class_code ?? null;
    rows.push({
      class_id: classId,
      class_name: className,
      class_code: classCode,
      period_1_cost_cents: period1,
      period_2_cost_cents: period2,
      variance_cents: period2 - period1,
      variance_pct: variancePct(period2, period1),
      posting_lines_period_1: Number(a?.line_count ?? 0),
      posting_lines_period_2: Number(b?.line_count ?? 0),
    });
  }

  rows.sort((x, y) => Math.abs(y.variance_cents) - Math.abs(x.variance_cents));

  return {
    dimension: "catalogs.classes",
    periods: [p1.label, p2.label],
    period_bounds: [
      { start: p1.startDate, end: p1.endDate },
      { start: p2.startDate, end: p2.endDate },
    ],
    classes_active: Number(classCountRes.rows[0]?.n ?? 0),
    classified_posting_lines: Number(densityRes.rows[0]?.classified ?? 0),
    unclassified_posting_lines: Number(densityRes.rows[0]?.unclassified ?? 0),
    rows,
  };
}
