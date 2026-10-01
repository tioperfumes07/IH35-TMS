type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

type FuelTxn = {
  id: string;
  operating_company_id: string;
  matched_load_id: string | null;
  reference_ts: string;
};



/**
 * ROUND 306 E-22: this matcher used to pick "the company truck with a GPS fix closest in time to
 * bt.created_at" — the DB insert time, never compared with the station — so every match was a
 * clock coincidence. A bank line carries no station coordinates and no pump time, so it cannot be
 * placed on a truck by GPS. It now records that honestly; the real two-signal verdict for purchases
 * that DO carry a station and pump time is fuel/fuel-gps-verdict.service.ts.
 */
async function matchOneFuelTxn(client: DbClient, txn: FuelTxn) {
  await client.query(
    `
      INSERT INTO safety.fuel_gps_matches (
        operating_company_id, fuel_txn_id, vehicle_id, distance_m, confidence, review_flag, reason, matched_at, updated_at
      )
      VALUES ($1::uuid, $2::uuid, NULL, NULL, 'no_match', true, 'bank_line_has_no_station_location_or_pump_time', now(), now())
      ON CONFLICT (operating_company_id, fuel_txn_id)
      DO UPDATE SET
        vehicle_id = NULL,
        distance_m = NULL,
        confidence = 'no_match',
        review_flag = true,
        reason = 'bank_line_has_no_station_location_or_pump_time',
        matched_at = now(),
        updated_at = now()
    `,
    [txn.operating_company_id, txn.id]
  );
}

export async function runFuelGpsMatchBatch(client: DbClient, operatingCompanyId: string, limit = 250): Promise<number> {
  const txns = await client.query<FuelTxn>(
    `
      SELECT
        bt.id::text AS id,
        bt.operating_company_id::text AS operating_company_id,
        bt.matched_load_id::text,
        COALESCE(bt.created_at, (bt.transaction_date::timestamp + interval '12 hours'))::text AS reference_ts
      FROM banking.bank_transactions bt
      WHERE bt.operating_company_id = $1::uuid
        AND bt.pending = false
        AND bt.transaction_date >= current_date - interval '14 day'
        AND (
          EXISTS (SELECT 1 FROM unnest(bt.plaid_category) AS c(cat) WHERE lower(cat::text) LIKE '%fuel%')
          OR lower(coalesce(bt.merchant_name, '')) ~ '(fuel|diesel|def|loves|pilot|flying\\s*j|ta\\s+travel)'
          OR lower(coalesce(bt.description, '')) ~ '(fuel|diesel|def)'
        )
      ORDER BY bt.transaction_date DESC, bt.created_at DESC
      LIMIT $2::int
    `,
    [operatingCompanyId, limit]
  );

  for (const txn of txns.rows) {
    await matchOneFuelTxn(client, txn);
  }
  return txns.rows.length;
}

export async function runFuelGpsRematchForTransaction(client: DbClient, operatingCompanyId: string, transactionId: string): Promise<boolean> {
  const txn = await client.query<FuelTxn>(
    `
      SELECT
        bt.id::text AS id,
        bt.operating_company_id::text AS operating_company_id,
        bt.matched_load_id::text,
        COALESCE(bt.created_at, (bt.transaction_date::timestamp + interval '12 hours'))::text AS reference_ts
      FROM banking.bank_transactions bt
      WHERE bt.operating_company_id = $1::uuid
        AND bt.id = $2::uuid
      LIMIT 1
    `,
    [operatingCompanyId, transactionId]
  );
  const row = txn.rows[0];
  if (!row) return false;
  await matchOneFuelTxn(client, row);
  return true;
}
