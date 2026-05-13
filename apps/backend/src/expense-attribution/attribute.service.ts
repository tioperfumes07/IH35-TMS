import type { PoolClient } from "pg";

type DbLike = Pick<PoolClient, "query">;

export type AttributionResult = {
  loadId: string;
  loadNumber: string;
  confidence: "high" | "medium" | "low";
  method: "auto_timestamp" | "auto_location";
  reason: string;
};

export type AttributeExpenseToLoadOpts = {
  driverId: string;
  operatingCompanyId: string;
  expenseTimestamp: Date;
  expenseLocation?: { lat: number; lng: number };
};

type CandidateRow = {
  id: string;
  load_number: string;
  status: string;
  pickup_at: string | Date | null;
  delivered_at: string | Date | null;
};

function toMillis(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function activeMovementStatuses(): Set<string> {
  return new Set(["dispatched", "at_pickup", "at_delivery", "in_transit"]);
}

function deliveredStatuses(): Set<string> {
  return new Set(["delivered", "invoiced", "paid", "closed"]);
}

export async function attributeExpenseToLoad(
  client: DbLike,
  opts: AttributeExpenseToLoadOpts
): Promise<AttributionResult | null> {
  void opts.expenseLocation; // reserved for v2 (Samsara GPS)

  const ts = opts.expenseTimestamp.getTime();
  const expenseIso = new Date(ts).toISOString();
  const pickupSinceIso = new Date(ts - 24 * 60 * 60 * 1000).toISOString();
  const deliveredSinceIso = new Date(ts - 2 * 60 * 60 * 1000).toISOString();

  const res = await client.query<CandidateRow>(
    `
      SELECT
        l.id,
        l.load_number,
        l.status::text AS status,
        pickup_pick.actual_departure_at AS pickup_at,
        drop_drop.actual_departure_at AS delivered_at
      FROM mdata.loads l
      LEFT JOIN LATERAL (
        SELECT ls.actual_departure_at
        FROM mdata.load_stops ls
        WHERE ls.load_id = l.id
          AND ls.stop_type = 'pickup'
        ORDER BY ls.sequence_number ASC
        LIMIT 1
      ) pickup_pick ON true
      LEFT JOIN LATERAL (
        SELECT ls.actual_departure_at
        FROM mdata.load_stops ls
        WHERE ls.load_id = l.id
          AND ls.stop_type = 'delivery'
        ORDER BY ls.sequence_number DESC
        LIMIT 1
      ) drop_drop ON true
      WHERE l.operating_company_id = $1
        AND (l.assigned_primary_driver_id = $2 OR l.assigned_secondary_driver_id = $2)
        AND l.soft_deleted_at IS NULL
        AND (
          l.status::text IN ('dispatched', 'at_pickup', 'at_delivery', 'in_transit')
          OR (
            l.status::text IN ('delivered', 'invoiced', 'paid', 'closed')
            AND COALESCE(drop_drop.actual_departure_at, l.updated_at) BETWEEN $4::timestamptz AND $3::timestamptz
          )
          OR (
            pickup_pick.actual_departure_at IS NOT NULL
            AND pickup_pick.actual_departure_at BETWEEN $5::timestamptz AND $3::timestamptz
          )
        )
      ORDER BY COALESCE(drop_drop.actual_departure_at, pickup_pick.actual_departure_at, l.updated_at) DESC
      LIMIT 25
    `,
    [opts.operatingCompanyId, opts.driverId, expenseIso, deliveredSinceIso, pickupSinceIso]
  );

  const rows = res.rows;

  const active = rows.filter((row) => activeMovementStatuses().has(row.status));
  if (active.length > 0) {
    const row = active[0];
    return {
      loadId: row.id,
      loadNumber: row.load_number,
      confidence: "high",
      method: "auto_timestamp",
      reason: `Driver assigned load ${row.load_number} is active (${row.status}) at expense time`,
    };
  }

  const deliveredRecent = rows
    .filter((row) => deliveredStatuses().has(row.status))
    .map((row) => ({
      row,
      deliveredMs: toMillis(row.delivered_at instanceof Date ? row.delivered_at : String(row.delivered_at ?? "")),
    }))
    .filter((x) => x.deliveredMs != null && ts - (x.deliveredMs as number) <= 2 * 60 * 60 * 1000 && ts >= (x.deliveredMs as number))
    .sort((a, b) => (b.deliveredMs as number) - (a.deliveredMs as number));

  if (deliveredRecent.length > 0) {
    const row = deliveredRecent[0].row;
    const deltaMin = Math.round((ts - (deliveredRecent[0].deliveredMs as number)) / 60000);
    return {
      loadId: row.id,
      loadNumber: row.load_number,
      confidence: deltaMin <= 120 ? "high" : "medium",
      method: "auto_timestamp",
      reason: `Most recent delivered load ${row.load_number} (${deltaMin} min before expense; post-delivery buffer)`,
    };
  }

  const pickupWindow = rows
    .map((row) => ({
      row,
      pickupMs: toMillis(row.pickup_at instanceof Date ? row.pickup_at : String(row.pickup_at ?? "")),
    }))
    .filter((x) => x.pickupMs != null && ts - (x.pickupMs as number) <= 24 * 60 * 60 * 1000 && ts >= (x.pickupMs as number))
    .sort((a, b) => (b.pickupMs as number) - (a.pickupMs as number));

  if (pickupWindow.length > 0) {
    const row = pickupWindow[0].row;
    return {
      loadId: row.id,
      loadNumber: row.load_number,
      confidence: "medium",
      method: "auto_timestamp",
      reason: `Closest pickup within 24h window for load ${row.load_number}`,
    };
  }

  return null;
}
