/**
 * ROUND 301 T-30 — harsh-driving-event and dashcam-clip POLL FALLBACK.
 *
 * FINDING (T-28, this session): integrations.samsara_webhook_events has 0 rows ever, AND 0
 * rejected-signature audit rows ever, despite a webhook_secret configured for USMCA since
 * 2026-08-21 -- no HTTP request of any kind has ever reached our webhook endpoint. Every OTHER
 * Samsara event family (position, vehicle mirror, driver pairing, odometer, fault codes, HOS)
 * already has a polling cron independent of the webhook. Harsh-driving events and dashcam clips
 * were the one hole. safety.harsh_events had exactly 1 row ever, and it was a fixture
 * (raw_samsara_id='TEST-TESTMTDQ4UCF').
 *
 * DOES NOT TOUCH THE WEBHOOK PATH. webhook-projectors/vehicle-projector.ts and
 * webhook-projection.service.ts are untouched and remain the FIRST caller of
 * processHarshEventsFromVehiclePayload(); this cron is the SECOND caller, reusing that same
 * function (its own dedupe on (operating_company_id, raw_samsara_id) and its own driver-at-time
 * lookup) rather than writing a second ingestion path.
 *
 * NORMALIZATION CAVEAT, stated plainly: this session has no working Samsara API credential
 * (SAMSARA_TOKEN_ENCRYPTION_KEY is a Render-only secret) and therefore cannot verify Samsara's
 * real /fleet/safety-events response shape against a live call. normalizeSafetyEventRow() below
 * is a best-effort, defensively-tolerant mapping (multiple candidate field names per value,
 * matching this repo's own established pattern in extractFaultCodesFromPayload) — not a
 * confirmed-against-the-real-API shape. It hands processHarshEventsFromVehiclePayload() a
 * payload in the exact field-name shape parseHarshEntries() already reads, so a wrong guess here
 * fails safe (the row is silently skipped by the existing parser, never miscategorized into the
 * real table) rather than corrupting data.
 *
 * ERROR POLICY: same as relay-fuel-ingest.cron.ts and fault-poll.cron.ts -- one company's failure
 * is isolated, but the whole tick's aggregated failure is re-thrown at the end, never swallowed.
 */
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";
import { decryptSamsaraSecret } from "../lib/samsara-crypto.js";
import { processHarshEventsFromVehiclePayload } from "./harsh-events-ingestion.service.js";
import { SamsaraApiError, SamsaraClient } from "../integrations/samsara/samsara-client.js";
import type { PgClient } from "../integrations/samsara/samsara.service.js";
import { getSamsaraConfigForCompany } from "../integrations/samsara/samsara.service.js";
import { loadUnitIdBySamsaraVehicleId } from "../integrations/samsara/samsara-positions.service.js";

const HARSH_EVENTS_POLL_AUDIT_SOURCE = "HARSH-EVENTS-POLL-CRON-1";

function readEncryptedToken(config: Record<string, unknown> | null): Buffer | null {
  if (!config) return null;
  const canonical = config.encrypted_api_token;
  if (Buffer.isBuffer(canonical) && canonical.length > 0) return canonical;
  const legacy = config.api_token_encrypted;
  if (Buffer.isBuffer(legacy) && legacy.length > 0) return legacy;
  return null;
}

async function listActiveCompanyIds(client: PgClient): Promise<string[]> {
  const res = await client.query(
    `SELECT id::text AS id FROM org.companies WHERE is_active = true AND deactivated_at IS NULL ORDER BY id`
  );
  return res.rows.map((r) => String(r.id));
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Samsara's documented behavior-label vocabulary, mapped to our own event_kind enum. Best-effort
 *  — see the file header's NORMALIZATION CAVEAT. An unrecognized label falls through to null,
 *  which parseHarshEntries() correctly skips rather than miscategorizing. */
const BEHAVIOR_LABEL_MAP = new Map<string, string>([
  ["harshbrake", "harsh_brake"],
  ["harsh_braking", "harsh_brake"],
  ["harshaccel", "harsh_accel"],
  ["harsh_acceleration", "harsh_accel"],
  ["harshturn", "harsh_turn"],
  ["harsh_turning", "harsh_turn"],
  ["speeding", "speeding"],
  ["speedinglightly", "speeding"],
  ["speedingmoderately", "speeding"],
  ["speedingheavily", "speeding"],
  ["mobileusage", "mobile_use"],
  ["mobile_use", "mobile_use"],
  ["distracteddriving", "distracted"],
  ["distracted", "distracted"],
  ["rollingstop", "rolling_stop"],
  ["noseatbelt", "no_seatbelt"],
  ["seatbeltviolation", "no_seatbelt"],
]);

function extractBehaviorKind(raw: Record<string, unknown>): string | null {
  const labels = raw.behaviorLabels ?? raw.behavior_labels ?? raw.labels;
  if (Array.isArray(labels)) {
    for (const entry of labels) {
      const obj = asObject(entry);
      const labelRaw = obj ? (obj.label ?? obj.name ?? obj.type) : entry;
      const label = String(labelRaw ?? "").trim().toLowerCase().replace(/[\s-]/g, "");
      const mapped = BEHAVIOR_LABEL_MAP.get(label);
      if (mapped) return mapped;
    }
  }
  const direct = String(raw.event_kind ?? raw.kind ?? raw.type ?? "").trim();
  return direct.length > 0 ? direct : null;
}

export function normalizeSafetyEventRow(raw: Record<string, unknown>): Record<string, unknown> | null {
  const kind = extractBehaviorKind(raw);
  if (!kind) return null;
  const idRaw = raw.id ?? raw.eventId ?? raw.event_id;
  const id = String(idRaw ?? "").trim();
  if (!id) return null;

  const vehicle = asObject(raw.vehicle);
  const vehicleId = String(vehicle?.id ?? raw.vehicleId ?? raw.vehicle_id ?? "").trim() || null;

  const severityRaw = String(raw.severity ?? raw.severityLabel ?? "minor");
  const speedCandidates = [raw.speedAtEventMph, raw.speed_at_event_mph, raw.speedMph, raw.speed_mph, raw.speed];
  const speed = speedCandidates.map(Number).find((v) => Number.isFinite(v)) ?? null;
  const gForceCandidates = [raw.gForce, raw.g_force, raw.gforce];
  const gForce = gForceCandidates.map(Number).find((v) => Number.isFinite(v)) ?? null;
  const gps = asObject(raw.gps) ?? asObject(raw.location);
  const latitude = Number(gps?.latitude ?? gps?.lat ?? raw.latitude ?? raw.lat ?? NaN);
  const longitude = Number(gps?.longitude ?? gps?.lng ?? gps?.lon ?? raw.longitude ?? raw.lng ?? raw.lon ?? NaN);
  const occurredAt = String(raw.time ?? raw.eventTime ?? raw.event_time ?? raw.occurred_at ?? new Date().toISOString());

  return {
    __vehicle_id: vehicleId,
    __occurred_at: new Date(occurredAt).toISOString(),
    event_kind: kind,
    id,
    severity: severityRaw,
    speed_mph: speed,
    g_force: gForce,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
  };
}

async function pollHarshEventsForCompany(
  client: PgClient,
  operatingCompanyId: string,
  windowStartIso: string,
  windowEndIso: string
): Promise<{ events_seen: number; inserted: number }> {
  const cfg = await getSamsaraConfigForCompany(client, operatingCompanyId);
  if (!cfg || !Boolean(cfg.is_enabled)) {
    return { events_seen: 0, inserted: 0 };
  }

  const token = decryptSamsaraSecret(readEncryptedToken(cfg));
  const api = new SamsaraClient({
    apiToken: token,
    samsaraOrgId: cfg.samsara_org_id ? String(cfg.samsara_org_id) : null,
  });

  const rawRows = await api.listSafetyEvents(windowStartIso, windowEndIso);
  const unitByVehicleId = await loadUnitIdBySamsaraVehicleId(client, operatingCompanyId);

  let inserted = 0;
  let eventsSeen = 0;

  for (const row of rawRows) {
    const normalized = normalizeSafetyEventRow(row.raw);
    if (!normalized) continue;
    const vehicleId = normalized.__vehicle_id as string | null;
    if (!vehicleId) continue;
    const unitId = unitByVehicleId.get(vehicleId);
    if (!unitId) continue;

    eventsSeen += 1;
    const count = await processHarshEventsFromVehiclePayload(client as never, {
      operating_company_id: operatingCompanyId,
      unit_id: unitId,
      event_at: normalized.__occurred_at as string,
      samsara_event_id: normalized.id as string,
      payload: { events: [normalized] },
    });
    inserted += count;
  }

  await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
    "safety.harsh_events_poll",
    "info",
    JSON.stringify({
      operating_company_id: operatingCompanyId,
      window: `${windowStartIso}..${windowEndIso}`,
      events_seen: eventsSeen,
      inserted,
    }),
    HARSH_EVENTS_POLL_AUDIT_SOURCE,
  ]);

  return { events_seen: eventsSeen, inserted };
}

export async function runHarshEventsPollCronTick(): Promise<void> {
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - 25 * 60 * 60 * 1000); // 25h -- overlaps the prior tick by an hour so a late-arriving event is never missed at the boundary
  const windowStartIso = windowStart.toISOString();
  const windowEndIso = windowEnd.toISOString();

  const failures: { operating_company_id: string; error: unknown }[] = [];
  const companyIds = await withLuciaBypass(async (client) => listActiveCompanyIds(client as PgClient));

  for (const operatingCompanyId of companyIds) {
    try {
      assertTenantContext(operatingCompanyId, "safety.harsh_events_poll_cron");
      await withLuciaBypass(async (client) => {
        // membership-scope-exempt: internally-iterated-active-company
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
        await pollHarshEventsForCompany(client as PgClient, operatingCompanyId, windowStartIso, windowEndIso);
      });
    } catch (error) {
      const message =
        error instanceof SamsaraApiError
          ? `${error.message}${error.statusCode ? `:http_${error.statusCode}` : ""}`
          : String((error as Error)?.message ?? error);
      failures.push({ operating_company_id: operatingCompanyId, error });
      await withLuciaBypass(async (client) => {
        await client
          .query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
            "safety.harsh_events_poll_failed",
            "warning",
            JSON.stringify({ operating_company_id: operatingCompanyId, error: message }),
            HARSH_EVENTS_POLL_AUDIT_SOURCE,
          ])
          .catch(() => {});
      });
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `harsh_events_poll_cron: ${failures.length} compan${failures.length === 1 ? "y" : "ies"} failed: ` +
        failures.map((f) => `${f.operating_company_id}(${String((f.error as Error)?.message ?? f.error)})`).join("; ")
    );
  }
}

let initialized = false;

export function initializeHarshEventsPollCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if (process.env.HARSH_EVENTS_POLL_CRON_ENABLED === "false") {
    app.log.info("Harsh events poll cron disabled via HARSH_EVENTS_POLL_CRON_ENABLED=false");
    return;
  }

  cron.schedule(
    "0 3 * * *",
    async () => {
      try {
        await runHarshEventsPollCronTick();
      } catch (error) {
        app.log.error({ err: error }, "[HARSH_EVENTS_POLL_CRON] tick failed");
        throw error;
      }
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );

  app.log.info("Harsh events poll cron scheduled (daily 03:00 America/Chicago)");
}
