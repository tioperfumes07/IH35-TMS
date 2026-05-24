type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

type FuelTxn = {
  id: string;
  operating_company_id: string;
  matched_load_id: string | null;
  reference_ts: string;
};

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s1 = Math.sin(dLat / 2) ** 2;
  const s2 = Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(s1 + s2), Math.sqrt(1 - (s1 + s2)));
}

async function findClosestLoadStopLocation(client: DbClient, operatingCompanyId: string, loadId: string): Promise<{ lat: number; lng: number } | null> {
  const res = await client.query<{ lat: number; lng: number }>(
    `
      SELECT loc.latitude::float8 AS lat, loc.longitude::float8 AS lng
      FROM mdata.load_stops s
      JOIN mdata.locations loc ON loc.id = s.location_id
      WHERE s.operating_company_id = $1::uuid
        AND s.load_id = $2::uuid
        AND loc.latitude IS NOT NULL
        AND loc.longitude IS NOT NULL
      ORDER BY s.sequence_number
      LIMIT 1
    `,
    [operatingCompanyId, loadId]
  );
  return res.rows[0] ?? null;
}

async function matchOneFuelTxn(client: DbClient, txn: FuelTxn) {
  const candidate = await client.query<{
    unit_id: string;
    lat: number;
    lng: number;
    captured_at: string;
    seconds_diff: number;
  }>(
    `
      SELECT
        v.unit_id::text AS unit_id,
        v.lat::float8 AS lat,
        v.lng::float8 AS lng,
        v.captured_at::text AS captured_at,
        ABS(EXTRACT(EPOCH FROM (v.captured_at - $2::timestamptz)))::float8 AS seconds_diff
      FROM telematics.vehicle_locations v
      WHERE v.operating_company_id = $1::uuid
        AND v.captured_at BETWEEN $2::timestamptz - interval '10 minutes' AND $2::timestamptz + interval '10 minutes'
      ORDER BY seconds_diff ASC
      LIMIT 1
    `,
    [txn.operating_company_id, txn.reference_ts]
  );

  const row = candidate.rows[0];
  if (!row) {
    await client.query(
      `
        INSERT INTO safety.fuel_gps_matches (
          operating_company_id, fuel_txn_id, vehicle_id, distance_m, confidence, review_flag, reason, matched_at, updated_at
        )
        VALUES ($1::uuid, $2::uuid, NULL, NULL, 'no_match', true, 'no_gps_within_10m', now(), now())
        ON CONFLICT (operating_company_id, fuel_txn_id)
        DO UPDATE SET
          vehicle_id = NULL,
          distance_m = NULL,
          confidence = 'no_match',
          review_flag = true,
          reason = 'no_gps_within_10m',
          matched_at = now(),
          updated_at = now()
      `,
      [txn.operating_company_id, txn.id]
    );
    return;
  }

  let distanceM: number | null = null;
  if (txn.matched_load_id) {
    const stop = await findClosestLoadStopLocation(client, txn.operating_company_id, txn.matched_load_id);
    if (stop) distanceM = haversineMeters(row.lat, row.lng, stop.lat, stop.lng);
  }
  const confidence = distanceM != null ? (distanceM <= 200 ? "high" : "medium") : row.seconds_diff <= 120 ? "high" : "medium";
  const reviewFlag = confidence !== "high";

  await client.query(
    `
      INSERT INTO safety.fuel_gps_matches (
        operating_company_id, fuel_txn_id, vehicle_id, distance_m, confidence, review_flag, reason, matched_at, updated_at
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, now(), now())
      ON CONFLICT (operating_company_id, fuel_txn_id)
      DO UPDATE SET
        vehicle_id = EXCLUDED.vehicle_id,
        distance_m = EXCLUDED.distance_m,
        confidence = EXCLUDED.confidence,
        review_flag = EXCLUDED.review_flag,
        reason = EXCLUDED.reason,
        matched_at = now(),
        updated_at = now()
    `,
    [txn.operating_company_id, txn.id, row.unit_id, distanceM, confidence, reviewFlag, confidence === "high" ? "ok" : "weak_proximity"]
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
