export type QuarterWindow = {
  quarter: number;
  year: number;
  startDate: string;
  endDateExclusive: string;
};

export type StateMilesRow = {
  state: string;
  miles: number;
  source: string;
};

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export function quarterWindow(quarter: number, year: number): QuarterWindow {
  const startMonth = (quarter - 1) * 3;
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + 3, 1));
  return {
    quarter,
    year,
    startDate: start.toISOString().slice(0, 10),
    endDateExclusive: end.toISOString().slice(0, 10),
  };
}

export async function aggregateStateMiles(
  client: Queryable,
  operatingCompanyId: string,
  window: QuarterWindow
): Promise<StateMilesRow[]> {
  const samsaraRes = await client.query<{ state: string; miles: string }>(
    `
      SELECT
        UPPER(TRIM(state)) AS state,
        COALESCE(SUM(miles), 0)::numeric(12, 3) AS miles
      FROM samsara.vehicle_state_miles
      WHERE operating_company_id = $1::uuid
        AND period_start >= $2::date
        AND period_end < $3::date
        AND state IS NOT NULL
        AND TRIM(state) <> ''
      GROUP BY UPPER(TRIM(state))
      ORDER BY UPPER(TRIM(state))
    `,
    [operatingCompanyId, window.startDate, window.endDateExclusive]
  );

  if (samsaraRes.rows.length > 0) {
    return samsaraRes.rows.map((row) => ({
      state: String(row.state),
      miles: Number(row.miles ?? 0),
      source: "samsara",
    }));
  }

  const fallbackRes = await client.query<{ state: string; miles: string }>(
    `
      SELECT
        UPPER(COALESCE(NULLIF(TRIM(ls.state), ''), 'UNKNOWN')) AS state,
        COALESCE(SUM(COALESCE(l.miles_practical, l.miles_shortest, 0)), 0)::numeric(12, 3) AS miles
      FROM mdata.load_stops ls
      JOIN mdata.loads l ON l.id = ls.load_id
      WHERE l.operating_company_id = $1::uuid
        AND l.soft_deleted_at IS NULL
        AND l.created_at >= $2::date
        AND l.created_at < $3::date
        AND ls.state IS NOT NULL
      GROUP BY UPPER(COALESCE(NULLIF(TRIM(ls.state), ''), 'UNKNOWN'))
      ORDER BY UPPER(COALESCE(NULLIF(TRIM(ls.state), ''), 'UNKNOWN'))
    `,
    [operatingCompanyId, window.startDate, window.endDateExclusive]
  );

  return fallbackRes.rows.map((row) => ({
    state: String(row.state),
    miles: Number(row.miles ?? 0),
    source: "load_stops_fallback",
  }));
}
