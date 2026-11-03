/**
 * ENGINE: odometer-history backfill for real-driven-miles boundaries (E11 / ENG-29)
 * SCHEDULE: hourly, inside the load real-driven-miles tick (load-real-driven-miles.cron.ts), before the miles compute
 * WRITES: telematics.odometer_readings (source 'samsara', confidence 'measured' — Samsara's own reads only)
 * IDEMPOTENCY: UNIQUE(unit_id, read_at, source) + the per-day key, ON CONFLICT DO NOTHING; a boundary with any Samsara row
 *   within ±BACKFILL_WINDOW_MIN is never asked again; a window Samsara answered empty is not asked again by this process
 * OVERLAP: the miles tick holds a job lease; a twin insert of the same read is a no-op
 *
 * WHAT WAS WRONG (measured 11-03 on prod, USMCA): 148 delivered loads had no real driven miles; 144 of them because a stop
 * boundary fell in 2026-08-27 … 2026-09-29, when telematics.vehicle_locations carried positions but no odometer
 * (odometer_mi 0 of ~265,000 fixes in those weeks) and telematics.odometer_readings had 3 rows. The anchor rule
 * (odometer-anchor.ts) correctly refused: "the truck moved … after the last odometer reading (2026-08-26 …) — odometer not
 * captured, boundary not measurable". Samsara HAS those reads (GET /fleet/vehicles/stats/history?types=obdOdometerMeters,
 * ~30 s apart; probed 2026-10-01, SamsaraClient.listOdometerHistory) — the stop writer already fetches them for its own
 * catch-up, in memory only. Nothing ever stored them where the anchor reads.
 *
 * THE FIX: for every boundary the anchor could not measure (computeLoadRealDrivenMiles → odometer_gaps), ask Samsara for
 * the truck's odometer reads in [boundary − 30 min, boundary + 30 min] and store the read nearest at/before and nearest
 * at/after the boundary as real reads (confidence 'measured'). The anchor rule is unchanged: a read within 30 minutes of a
 * moving truck's boundary is a measurement; nothing is interpolated. When Samsara has no read in the window nothing is
 * written (a NULL 'suggested' row would read as an "odometer gap" to the PM rate engine for 90 days and as the nearest
 * reading to driver attribution) — the boundary stays unmeasured with its reason, and this process does not ask again.
 */
import type { OdometerAnchor, BoundaryRequest } from "./odometer-anchor.js";

type DbClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

/** Same reach as the anchor rule's moving tolerance (odometer-anchor.ts MOVING_ANCHOR_MAX_MINUTES). */
export const BACKFILL_WINDOW_MIN = 30;
/** Per tick, at most this many boundaries are asked (Samsara rate budget). The rest go next hour. */
export const BACKFILL_MAX_BOUNDARIES_PER_TICK = 200;

/** Windows Samsara answered with no read, this process (cleared on restart; a deploy asks once more). */
const ANSWERED_EMPTY = new Set<string>();
const boundaryKey = (unitId: string, at: string) => `${unitId}|${new Date(at).toISOString()}`;
export function _resetAnsweredEmptyForTests() { ANSWERED_EMPTY.clear(); }

export type OdometerBackfillRequest = { unit_id: string; vehicle_id: string; at: string; from: string; to: string };
export type OdometerRead = { at: Date; miles: number };
export type FetchOdometerHistory = (vehicleIds: string[], startIso: string, endIso: string) => Promise<Map<string, OdometerRead[]>>;

export type OdometerBackfillSummary = {
  gaps: number; asked: number; skipped_attempted: number; skipped_no_vehicle: number;
  reads_written: number; empty_windows: number; fetch_failed: number;
};

/** Pure: the read nearest at/before and nearest at/after the boundary, inside the window. */
export function pickBoundaryReads(atIso: string, reads: OdometerRead[], windowMin = BACKFILL_WINDOW_MIN): { before: OdometerRead | null; after: OdometerRead | null } {
  const at = new Date(atIso).getTime();
  const lim = windowMin * 60_000;
  let before: OdometerRead | null = null;
  let after: OdometerRead | null = null;
  for (const r of reads) {
    const t = r.at.getTime();
    if (!Number.isFinite(r.miles) || r.miles <= 0) continue;
    if (t <= at && at - t <= lim && (!before || t > before.at.getTime())) before = r;
    if (t >= at && t - at <= lim && (!after || t < after.at.getTime())) after = r;
  }
  return { before, after };
}

/** DB: which gaps still need Samsara (no Samsara row of any confidence within the window) and the truck's Samsara id. */
export async function planOdometerBackfill(
  client: DbClient, operatingCompanyId: string, gaps: BoundaryRequest[], max = BACKFILL_MAX_BOUNDARIES_PER_TICK
): Promise<{ requests: OdometerBackfillRequest[]; skipped_attempted: number; skipped_no_vehicle: number }> {
  const uniq = new Map<string, BoundaryRequest>();
  let answeredEmpty = 0;
  for (const g of gaps) {
    const k = boundaryKey(g.unit_id, g.at);
    if (ANSWERED_EMPTY.has(k)) { answeredEmpty += 1; continue; }
    uniq.set(k, g);
  }
  const list = [...uniq.values()];
  if (!list.length) return { requests: [], skipped_attempted: answeredEmpty, skipped_no_vehicle: 0 };
  const r = await client.query<{ unit_id: string; at: string; vid: string | null; attempted: boolean }>(
    `SELECT q.unit_id::text, q.at::text, u.samsara_vehicle_id::text AS vid,
            EXISTS (SELECT 1 FROM telematics.odometer_readings o
                     WHERE o.operating_company_id = $1::uuid AND o.unit_id = q.unit_id AND o.source = 'samsara'
                       AND (o.read_at BETWEEN q.at - make_interval(mins => $4::int) AND q.at + make_interval(mins => $4::int)
                            -- from 2026-09-30 telematics.odometer_readings holds ONE 'samsara' row per unit per day
                            -- (odometer_readings_oci_unit_date_source_key): a day that already has it cannot take a read,
                            -- so asking again would repeat every hour
                            OR (q.at >= '2026-09-30 00:00:00+00'::timestamptz
                                AND telematics.odometer_reading_day(o.read_at) = telematics.odometer_reading_day(q.at)))) AS attempted
       FROM unnest($2::uuid[], $3::timestamptz[]) AS q(unit_id, at)
       LEFT JOIN mdata.units u ON u.id = q.unit_id
        AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $1::uuid`,
    [operatingCompanyId, list.map((g) => g.unit_id), list.map((g) => g.at), BACKFILL_WINDOW_MIN]
  );
  let attempted = answeredEmpty;
  let noVehicle = 0;
  const requests: OdometerBackfillRequest[] = [];
  for (const row of r.rows) {
    if (row.attempted) { attempted += 1; continue; }
    if (!row.vid) { noVehicle += 1; continue; }
    if (requests.length >= max) continue;
    const at = new Date(row.at);
    requests.push({
      unit_id: row.unit_id, vehicle_id: row.vid, at: at.toISOString(),
      from: new Date(at.getTime() - BACKFILL_WINDOW_MIN * 60_000).toISOString(),
      to: new Date(at.getTime() + BACKFILL_WINDOW_MIN * 60_000).toISOString(),
    });
  }
  return { requests, skipped_attempted: attempted, skipped_no_vehicle: noVehicle };
}

/** HTTP (no DB transaction held): one history call per boundary window, the truck's reads only. */
export async function fetchBoundaryReads(
  requests: OdometerBackfillRequest[], fetchHistory: FetchOdometerHistory
): Promise<{ reads: Map<OdometerBackfillRequest, OdometerRead[]>; failed: number }> {
  const reads = new Map<OdometerBackfillRequest, OdometerRead[]>();
  let failed = 0;
  for (const q of requests) {
    try {
      const hist = await fetchHistory([q.vehicle_id], q.from, q.to);
      reads.set(q, hist.get(q.vehicle_id) ?? []);
    } catch {
      failed += 1; // not marked: asked again next tick
    }
  }
  return { reads, failed };
}

/** DB: store Samsara's reads at the boundary (nothing when the window was empty). */
export async function writeBoundaryReads(
  client: DbClient, operatingCompanyId: string, reads: Map<OdometerBackfillRequest, OdometerRead[]>
): Promise<{ reads_written: number; empty_windows: number }> {
  let readsWritten = 0;
  let emptyWindows = 0;
  for (const [q, pts] of reads) {
    const pick = pickBoundaryReads(q.at, pts);
    const rows: Array<{ at: string; miles: number }> = [];
    if (pick.before) rows.push({ at: pick.before.at.toISOString(), miles: Math.round(pick.before.miles * 10) / 10 });
    if (pick.after && pick.after.at.getTime() !== pick.before?.at.getTime()) rows.push({ at: pick.after.at.toISOString(), miles: Math.round(pick.after.miles * 10) / 10 });
    if (!rows.length) {
      emptyWindows += 1;
      ANSWERED_EMPTY.add(boundaryKey(q.unit_id, q.at));
      continue;
    }
    for (const row of rows) {
      const ins = await client.query<{ id: string }>(
        `INSERT INTO telematics.odometer_readings (operating_company_id, unit_id, read_at, odometer_miles, source, confidence)
         VALUES ($1::uuid, $2::uuid, $3::timestamptz, $4, 'samsara', 'measured')
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [operatingCompanyId, q.unit_id, row.at, row.miles]
      );
      if (ins.rows.length) readsWritten += 1;
    }
  }
  return { reads_written: readsWritten, empty_windows: emptyWindows };
}

export type { OdometerAnchor };

export type OdometerBackfillDeps = {
  /** a DB transaction (lucia bypass) for the company — reads and short writes only, never held across HTTP */
  withDb: <T>(fn: (client: DbClient) => Promise<T>) => Promise<T>;
  /** the company's Samsara history reader, or null when Samsara is not configured / enabled */
  historyFor: (client: DbClient, operatingCompanyId: string) => Promise<FetchOdometerHistory | null>;
  /** the boundaries the miles compute could not measure (computeLoadRealDrivenMiles → odometer_gaps) */
  gapsFor: (client: DbClient, operatingCompanyId: string) => Promise<BoundaryRequest[]>;
};

/** One tick for one company: plan (DB) → ask Samsara (no transaction) → store (DB). */
export async function runOdometerHistoryBackfill(operatingCompanyId: string, deps: OdometerBackfillDeps): Promise<OdometerBackfillSummary> {
  const planned = await deps.withDb(async (client) => {
    const gaps = await deps.gapsFor(client, operatingCompanyId);
    const fetchHistory = gaps.length ? await deps.historyFor(client, operatingCompanyId) : null;
    const plan = fetchHistory ? await planOdometerBackfill(client, operatingCompanyId, gaps) : { requests: [], skipped_attempted: 0, skipped_no_vehicle: 0 };
    return { gaps: gaps.length, fetchHistory, ...plan };
  });
  const summary: OdometerBackfillSummary = {
    gaps: planned.gaps, asked: planned.requests.length, skipped_attempted: planned.skipped_attempted,
    skipped_no_vehicle: planned.skipped_no_vehicle, reads_written: 0, empty_windows: 0, fetch_failed: 0,
  };
  if (!planned.fetchHistory || !planned.requests.length) return summary;
  const fetched = await fetchBoundaryReads(planned.requests, planned.fetchHistory);
  summary.fetch_failed = fetched.failed;
  const written = await deps.withDb((client) => writeBoundaryReads(client, operatingCompanyId, fetched.reads));
  summary.reads_written = written.reads_written;
  summary.empty_windows = written.empty_windows;
  return summary;
}
