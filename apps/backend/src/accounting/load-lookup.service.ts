type SuggestLoadInput = {
  operating_company_id: string;
  driver_id?: string | null;
  unit_id?: string | null;
  trailer_id?: string | null;
  transaction_date: string;
};

type SuggestLoadResult = { load_id: string; load_number: string; confidence: "exact" | "fuzzy" | "none" } | null;

type QueryClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export async function suggestLoadForExpense(client: QueryClient, input: SuggestLoadInput): Promise<SuggestLoadResult> {
  if (input.driver_id && input.unit_id) {
    const exact = await client.query<{ id: string; load_number: string }>(
      `
        SELECT l.id, l.load_number
        FROM mdata.loads l
        LEFT JOIN LATERAL (
          SELECT
            MIN(COALESCE(ls.actual_arrival_at, ls.scheduled_arrival_at))::date AS first_stop_date,
            MAX(COALESCE(ls.actual_departure_at, ls.scheduled_departure_at, ls.scheduled_arrival_at))::date AS last_stop_date
          FROM mdata.load_stops ls
          WHERE ls.load_id = l.id
        ) stop_window ON true
        WHERE l.operating_company_id = $1
          AND l.assigned_primary_driver_id = $2
          AND l.assigned_unit_id = $3
          AND l.soft_deleted_at IS NULL
          AND $4::date BETWEEN COALESCE(stop_window.first_stop_date, l.created_at::date - 1)
                           AND COALESCE(stop_window.last_stop_date, l.created_at::date + 7)
        ORDER BY COALESCE(stop_window.last_stop_date, l.created_at::date) DESC, l.created_at DESC
        LIMIT 1
      `,
      [input.operating_company_id, input.driver_id, input.unit_id, input.transaction_date]
    );
    if (exact.rows.length > 0) {
      return { load_id: exact.rows[0].id, load_number: exact.rows[0].load_number, confidence: "exact" };
    }
  }

  if (input.driver_id) {
    const fuzzy = await client.query<{ id: string; load_number: string }>(
      `
        SELECT l.id, l.load_number
        FROM mdata.loads l
        LEFT JOIN LATERAL (
          SELECT
            MIN(COALESCE(ls.actual_arrival_at, ls.scheduled_arrival_at))::date AS first_stop_date,
            MAX(COALESCE(ls.actual_departure_at, ls.scheduled_departure_at, ls.scheduled_arrival_at))::date AS last_stop_date
          FROM mdata.load_stops ls
          WHERE ls.load_id = l.id
        ) stop_window ON true
        WHERE l.operating_company_id = $1
          AND l.assigned_primary_driver_id = $2
          AND l.soft_deleted_at IS NULL
          AND $3::date BETWEEN (COALESCE(stop_window.first_stop_date, l.created_at::date) - 2)
                           AND (COALESCE(stop_window.last_stop_date, l.created_at::date) + 5)
        ORDER BY COALESCE(stop_window.last_stop_date, l.created_at::date) DESC, l.created_at DESC
        LIMIT 1
      `,
      [input.operating_company_id, input.driver_id, input.transaction_date]
    );
    if (fuzzy.rows.length > 0) {
      return { load_id: fuzzy.rows[0].id, load_number: fuzzy.rows[0].load_number, confidence: "fuzzy" };
    }
  }

  return null;
}
