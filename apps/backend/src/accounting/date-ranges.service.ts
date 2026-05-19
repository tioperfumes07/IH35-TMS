import { withCurrentUser } from "../auth/db.js";
import {
  deriveAccountingPeriodLabel,
  resolveRelativeDateRanges,
  type ResolvedDateRange,
} from "./date-range-engine.js";

type AccountingPeriodRow = {
  id: string;
  period_start: string;
  period_end: string;
  fiscal_year: number;
  period_label: string | null;
};

export async function listResolvedNamedDateRanges(input: {
  reference_date?: string;
}): Promise<{ reference_date: string; ranges: ResolvedDateRange[] }> {
  const ranges = resolveRelativeDateRanges({ reference_date: input.reference_date });
  const toDate = ranges.find((range) => range.key === "year_to_date")?.to_date;
  if (!toDate) throw new Error("resolver_failed_reference_date");
  return {
    reference_date: toDate,
    ranges,
  };
}

export async function resolveAccountingPeriodDateRange(input: {
  userId: string;
  operating_company_id: string;
  period_id: string;
}): Promise<ResolvedDateRange | null> {
  const row = await withCurrentUser(input.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    const res = await client.query<AccountingPeriodRow>(
      `
        SELECT
          id::text AS id,
          period_start::text AS period_start,
          period_end::text AS period_end,
          fiscal_year::int AS fiscal_year,
          period_label
        FROM accounting.periods
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        LIMIT 1
      `,
      [input.period_id, input.operating_company_id]
    );
    return res.rows[0] ?? null;
  });

  if (!row) return null;
  return {
    key: "accounting_period",
    from_date: row.period_start,
    to_date: row.period_end,
    label: deriveAccountingPeriodLabel(row),
  };
}
