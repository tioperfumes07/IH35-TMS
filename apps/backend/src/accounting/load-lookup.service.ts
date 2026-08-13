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

/**
 * RANK6-UNIFY-SUGGEST-LOAD-TRAILER (trip-wiring rank 6, final) — trailer_id was accepted by every
 * caller (load-lookup.routes.ts's querySchema, GET /api/v1/expenses/suggest-load) but silently
 * dropped here since this file was written: declared on SuggestLoadInput, never read in either query
 * body below. A caller keyed by trailer alone (fuel, expense, accident, claim — the exact create-path
 * classes this weekend's packet names) got zero suggestion even when the trailer's current tractor
 * had an obvious active load.
 *
 * Resolves the tractor CURRENTLY PULLING that trailer via mdata.equipment.current_unit_id (verified
 * live on prod), company-scoped the same way every other mdata.equipment lookup this session scopes
 * it (owner_company_id OR currently_leased_to_company_id). Only fills in when the caller did not
 * already supply unit_id — an explicit unit_id always wins. Once resolved, it feeds the SAME
 * exact-match query below unchanged: no new SQL shape, no new confidence tier, no invented load FK.
 */
async function resolveUnitIdFromTrailer(
  client: QueryClient,
  operatingCompanyId: string,
  trailerId: string
): Promise<string | null> {
  const res = await client.query<{ current_unit_id: string | null }>(
    `
      SELECT current_unit_id
      FROM mdata.equipment
      WHERE id = $1::uuid
        AND (owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid)
      LIMIT 1
    `,
    [trailerId, operatingCompanyId]
  );
  return res.rows[0]?.current_unit_id ?? null;
}

export async function suggestLoadForExpense(client: QueryClient, input: SuggestLoadInput): Promise<SuggestLoadResult> {
  const effectiveUnitId =
    input.unit_id ?? (input.trailer_id ? await resolveUnitIdFromTrailer(client, input.operating_company_id, input.trailer_id) : null);

  if (input.driver_id && effectiveUnitId) {
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
        WHERE l.operating_company_id = $1::uuid
          AND l.assigned_primary_driver_id = $2
          AND l.assigned_unit_id = $3
          AND l.soft_deleted_at IS NULL
          AND $4::date BETWEEN COALESCE(stop_window.first_stop_date, l.created_at::date - 1)
                           AND COALESCE(stop_window.last_stop_date, l.created_at::date + 7)
        ORDER BY COALESCE(stop_window.last_stop_date, l.created_at::date) DESC, l.created_at DESC
        LIMIT 1
      `,
      [input.operating_company_id, input.driver_id, effectiveUnitId, input.transaction_date]
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
        WHERE l.operating_company_id = $1::uuid
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
