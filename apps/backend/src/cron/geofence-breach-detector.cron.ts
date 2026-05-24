import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "./_helpers/tenant-context-guard.js";
import { detectGeofenceBreaches } from "../safety/geofence-breach-detector.service.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

type GeofenceRow = {
  geofence_id: string;
  customer_id: string | null;
  vertices_json: unknown;
};

type PositionTransitionRow = {
  vehicle_id: string;
  captured_at: string;
  position_lat: number;
  position_lng: number;
  previous_lat: number;
  previous_lng: number;
};

type CronRunStats = {
  transitions_checked: number;
  events_inserted: number;
  dedup_skipped: number;
  next_watermark: string;
};

const COMPANY_WATERMARKS = new Map<string, string>();
let initialized = false;

async function fetchActiveCustomerGeofences(client: DbClient, operatingCompanyId: string): Promise<GeofenceRow[]> {
  const res = await client.query<GeofenceRow>(
    `
      SELECT
        g.id::text AS geofence_id,
        g.location_ref_id::text AS customer_id,
        g.vertices_json
      FROM geo.geofences g
      WHERE g.operating_company_id = $1::uuid
        AND g.is_active = true
        AND g.location_kind = 'customer_site'
    `,
    [operatingCompanyId]
  );
  return res.rows;
}

async function fetchPositionTransitions(
  client: DbClient,
  operatingCompanyId: string,
  since: string,
  until: string
): Promise<PositionTransitionRow[]> {
  const res = await client.query<PositionTransitionRow>(
    `
      WITH recent AS (
        SELECT
          v.unit_id,
          v.captured_at,
          v.lat::double precision AS lat,
          v.lng::double precision AS lng,
          v.created_at
        FROM telematics.vehicle_locations v
        WHERE v.operating_company_id = $1::uuid
          AND v.captured_at > $2::timestamptz
          AND v.captured_at <= $3::timestamptz
      ),
      anchors AS (
        SELECT DISTINCT ON (v.unit_id)
          v.unit_id,
          v.captured_at,
          v.lat::double precision AS lat,
          v.lng::double precision AS lng,
          v.created_at
        FROM telematics.vehicle_locations v
        JOIN (SELECT DISTINCT unit_id FROM recent) r ON r.unit_id = v.unit_id
        WHERE v.operating_company_id = $1::uuid
          AND v.captured_at <= $2::timestamptz
        ORDER BY v.unit_id, v.captured_at DESC, v.created_at DESC
      ),
      combined AS (
        SELECT * FROM recent
        UNION ALL
        SELECT * FROM anchors
      ),
      ordered AS (
        SELECT
          unit_id::text AS vehicle_id,
          captured_at,
          lat,
          lng,
          LAG(lat) OVER (PARTITION BY unit_id ORDER BY captured_at ASC, created_at ASC) AS previous_lat,
          LAG(lng) OVER (PARTITION BY unit_id ORDER BY captured_at ASC, created_at ASC) AS previous_lng
        FROM combined
      )
      SELECT
        vehicle_id,
        captured_at::text AS captured_at,
        lat AS position_lat,
        lng AS position_lng,
        previous_lat,
        previous_lng
      FROM ordered
      WHERE captured_at > $2::timestamptz
        AND captured_at <= $3::timestamptz
        AND previous_lat IS NOT NULL
        AND previous_lng IS NOT NULL
      ORDER BY captured_at ASC
    `,
    [operatingCompanyId, since, until]
  );
  return res.rows;
}

export async function runGeofenceBreachDetectionTick(
  client: DbClient,
  operatingCompanyId: string,
  since: string,
  until: string
): Promise<CronRunStats> {
  assertTenantContext(operatingCompanyId, "safety.geofence_breach_cron");
  await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);

  const geofences = await fetchActiveCustomerGeofences(client, operatingCompanyId);
  if (geofences.length === 0) {
    return { transitions_checked: 0, events_inserted: 0, dedup_skipped: 0, next_watermark: until };
  }

  const geofenceById = new Map(geofences.map((geofence) => [geofence.geofence_id, geofence]));
  const transitions = await fetchPositionTransitions(client, operatingCompanyId, since, until);
  let eventsInserted = 0;
  let dedupSkipped = 0;
  let nextWatermark = since;

  for (const transition of transitions) {
    nextWatermark = transition.captured_at;

    const breaches = detectGeofenceBreaches(
      { latitude: transition.previous_lat, longitude: transition.previous_lng },
      { latitude: transition.position_lat, longitude: transition.position_lng },
      geofences
    );
    const eventCandidates = [
      ...breaches.entered.map((geofence_id) => ({ geofence_id, event_type: "entry" as const })),
      ...breaches.exited.map((geofence_id) => ({ geofence_id, event_type: "exit" as const })),
    ];

    for (const candidate of eventCandidates) {
      const existing = await client.query<{ id: string }>(
        `
          SELECT id::text
          FROM safety.geofence_breach_events
          WHERE operating_company_id = $1::uuid
            AND vehicle_id = $2::uuid
            AND geofence_id = $3::uuid
            AND event_type = $4
            AND event_at >= ($5::timestamptz - interval '5 minutes')
          ORDER BY event_at DESC
          LIMIT 1
        `,
        [operatingCompanyId, transition.vehicle_id, candidate.geofence_id, candidate.event_type, transition.captured_at]
      );
      if ((existing.rowCount ?? existing.rows.length) > 0) {
        dedupSkipped += 1;
        continue;
      }

      const geofence = geofenceById.get(candidate.geofence_id);
      const inserted = await client.query<{ id: string }>(
        `
          INSERT INTO safety.geofence_breach_events (
            operating_company_id,
            vehicle_id,
            geofence_id,
            customer_id,
            event_type,
            event_at,
            position_lat,
            position_lng
          )
          VALUES (
            $1::uuid,
            $2::uuid,
            $3::uuid,
            $4::uuid,
            $5,
            $6::timestamptz,
            $7::numeric,
            $8::numeric
          )
          RETURNING id::text
        `,
        [
          operatingCompanyId,
          transition.vehicle_id,
          candidate.geofence_id,
          geofence?.customer_id ?? null,
          candidate.event_type,
          transition.captured_at,
          transition.position_lat,
          transition.position_lng,
        ]
      );

      const eventId = inserted.rows[0]?.id;
      if (!eventId) continue;
      eventsInserted += 1;

      await client.query(
        `
          INSERT INTO outbox.events (event_type, payload, next_retry_at)
          VALUES ($1, $2::jsonb, now())
        `,
        [
          "geofence_breach_detected",
          JSON.stringify({
            geofence_breach_event_id: eventId,
            operating_company_id: operatingCompanyId,
            vehicle_id: transition.vehicle_id,
            geofence_id: candidate.geofence_id,
            customer_id: geofence?.customer_id ?? null,
            event_type: candidate.event_type,
            event_at: transition.captured_at,
          }),
        ]
      );
    }
  }

  return {
    transitions_checked: transitions.length,
    events_inserted: eventsInserted,
    dedup_skipped: dedupSkipped,
    next_watermark: transitions.length > 0 ? nextWatermark : until,
  };
}

export function initializeGeofenceBreachDetectorCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  if ((process.env.GEOFENCE_BREACH_CRON_ENABLED ?? "true").trim() === "false") {
    app.log.info("Geofence breach detector cron disabled via GEOFENCE_BREACH_CRON_ENABLED=false");
    return;
  }

  cron.schedule(
    "*/1 * * * *",
    async () => {
      await withLuciaBypass(async (client) => {
        const companies = await client.query<{ id: string }>(
          `SELECT id::text AS id FROM org.companies WHERE is_active = true AND deactivated_at IS NULL ORDER BY id`
        );

        for (const company of companies.rows) {
          assertTenantContext(company.id, "safety.geofence_breach_cron");
          const since = COMPANY_WATERMARKS.get(company.id) ?? new Date(Date.now() - 5 * 60 * 1000).toISOString();
          const until = new Date().toISOString();
          const stats = await runGeofenceBreachDetectionTick(client, company.id, since, until);
          COMPANY_WATERMARKS.set(company.id, stats.next_watermark);
          app.log.info(
            {
              operating_company_id: company.id,
              transitions_checked: stats.transitions_checked,
              events_inserted: stats.events_inserted,
              dedup_skipped: stats.dedup_skipped,
              since,
              until,
              next_watermark: stats.next_watermark,
            },
            "[GEOFENCE_BREACH_CRON] run complete"
          );
        }
      });
    },
    { timezone: "America/Chicago" }
  );

  app.log.info("Geofence breach detector cron scheduled (every 60s)");
}

export const __geofenceBreachCronTestState = {
  clearWatermarks() {
    COMPANY_WATERMARKS.clear();
    initialized = false;
  },
};
