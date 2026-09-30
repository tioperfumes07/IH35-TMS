/**
 * GAP-55 — refresh the positions cache every 30s from telematics.vehicle_latest_position.
 *
 * NAME WARNING: despite "poll", this worker does NOT call Samsara. It MIRRORS a table the real
 * ingest path (integrations/samsara/samsara-positions.service.ts) already wrote. It therefore
 * cannot make a position newer than its source, and must never claim to.
 *
 * FABRICATED FRESHNESS (Lead, 2026-09-30) — the defect this header exists for:
 * the UPSERT wrote `recorded_at = now()` on every row it copied, regardless of when the position
 * was actually captured. Measured live on br-fancy-credit-akjnd07a:
 *   T170  source captured_at 2026-09-29 21:06:28Z   mirror recorded_at 2026-09-30 13:31:31Z
 *         -> 16h25m of freshness invented out of nothing
 *   T173  source captured_at 2026-09-30 11:46:51Z   mirror recorded_at 2026-09-30 13:31:31Z
 *         -> 1h44m invented
 *   T171  source captured_at 2026-09-30 13:29:42Z   mirror recorded_at 2026-09-30 13:31:31Z
 *         -> genuinely fresh, and the only one of the three that was
 * A truck parked for sixteen hours read as reporting seconds ago to anything trusting this table.
 * That is the worst failure mode a telematics cache has: it does not go dark, it lies.
 *
 * THE RULE, and it is not negotiable: recorded_at is WHEN THE TRUCK REPORTED, never when we copied
 * the row. A mirror carries its source's timestamp through, or it is not a mirror.
 */
import type { FastifyInstance } from "fastify";
import { withLuciaBypass } from "../auth/db.js";

const WORKER_NAME = "integrations.samsara_position_poll";
const INTERVAL_MS = 30_000;
let timer: NodeJS.Timeout | undefined;
let running = false;

export async function pollSamsaraPositions(app: FastifyInstance): Promise<void> {
  if (running) return;
  running = true;
  try {
    await withLuciaBypass(async (client) => {
      const units = await client.query<{
        unit_uuid: string;
        operating_company_id: string;
        samsara_vehicle_id: string | null;
        lat: number | null;
        lng: number | null;
        speed_mph: number | null;
        captured_at: string | null;
      }>(
        // 0091-c2-3 (cross-entity leak): a unit's OPERATING entity is the lessee when it is on
        // lease (TRANSP/USMCA), else the owner (TRK). Reading bare owner_company_id attributed every
        // leased unit's live position to the asset-holder, so an RLS-scoped read by the operating
        // carrier missed its own trucks. Scope by COALESCE(currently_leased_to_company_id,
        // owner_company_id) — the same operator-attribution rule used across the fleet reads (§4).
        `SELECT u.id::text AS unit_uuid,
                COALESCE(u.currently_leased_to_company_id, u.owner_company_id)::text AS operating_company_id,
                u.samsara_vehicle_id,
                COALESCE(p.lat, 0) AS lat, COALESCE(p.lng, 0) AS lng, p.speed_mph,
                p.captured_at
         FROM mdata.units u
         LEFT JOIN telematics.vehicle_latest_position p ON p.unit_id = u.id
         WHERE u.deactivated_at IS NULL AND u.samsara_vehicle_id IS NOT NULL
         LIMIT 200`
      );
      let mirrored = 0;
      let skippedNoTimestamp = 0;
      for (const row of units.rows) {
        if (!row.lat || !row.lng) continue;
        // No source timestamp means we do not know when this truck reported. Skip it rather than
        // stamp it with now() -- an unknown age is a question, never an answer, and inventing one
        // is exactly the defect in this file's header.
        if (!row.captured_at) {
          skippedNoTimestamp += 1;
          continue;
        }
        await client.query(
          `INSERT INTO integrations.samsara_vehicle_positions
             (operating_company_id, unit_uuid, samsara_vehicle_id, lat, lng, speed_mph, recorded_at)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::timestamptz)
           ON CONFLICT (operating_company_id, unit_uuid)
           DO UPDATE SET lat = EXCLUDED.lat, lng = EXCLUDED.lng, speed_mph = EXCLUDED.speed_mph,
                         recorded_at = EXCLUDED.recorded_at, updated_at = now()
           -- Never move recorded_at BACKWARDS, and never rewrite it with an identical-age copy:
           -- a mirror pass must be a no-op unless the source genuinely advanced.
           WHERE EXCLUDED.recorded_at > integrations.samsara_vehicle_positions.recorded_at`,
          [row.operating_company_id, row.unit_uuid, row.samsara_vehicle_id, row.lat, row.lng, row.speed_mph, row.captured_at]
        );
        mirrored += 1;
      }
      // Counted, not silent. A run that mirrors nothing because every source row lost its timestamp
      // is a dead feed, and a dead feed that logs nothing is how this went unnoticed.
      app.log.info(
        { units: units.rowCount, mirrored, skipped_no_source_timestamp: skippedNoTimestamp },
        `[${WORKER_NAME}] mirrored positions (recorded_at carried from source captured_at)`
      );
    });
  } finally {
    running = false;
  }
}

export function initializeSamsaraPositionPollWorker(app: FastifyInstance) {
  const tick = async () => {
    try {
      await pollSamsaraPositions(app);
    } catch (err) {
      app.log.error({ err }, `[${WORKER_NAME}] tick failed`);
    }
    timer = setTimeout(tick, process.env.NODE_ENV === "test" ? 0 : INTERVAL_MS);
  };
  if (process.env.NODE_ENV !== "test") tick();
  app.log.info(`[${WORKER_NAME}] initialized (30s interval)`);
  return () => { if (timer) clearTimeout(timer); };
}
