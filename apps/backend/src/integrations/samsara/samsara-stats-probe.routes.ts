// Gated diagnostic probe — answers, from inside prod (where the Samsara token decrypts), exactly what
// Samsara returns for THIS carrier's vehicles, so we stop deploy-and-hoping. Read-only: makes Samsara
// GETs and reports a PER-VEHICLE table + per-call HTTP status. Writes NOTHING. Owner/Administrator only.
//
// Jorge's rule: a driver LOGGED INTO Samsara for a vehicle IS that vehicle's driver. So the decisive
// signal is Samsara's vehicle->driver assignment feed, NOT dispatch loads. This probe joins, per vehicle:
//   • gps.reverseGeo.formattedLocation  (city/state)   — from /fleet/vehicles/stats?types=gps,engineStates
//   • engineStates.value                (engine on/off) — same call
//   • the CURRENT logged-in driver                      — from /fleet/vehicles/driver-assignments
// and also fires the deployed (bad) types=...,driverAssignments call to prove whether it 400s.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { decryptSamsaraSecret } from "../../lib/samsara-crypto.js";
import { getSamsaraConfigForCompany } from "./samsara.service.js";

const SAMSARA_API_BASE = "https://api.samsara.com";
const querySchema = z.object({ operating_company_id: z.string().uuid() });

function currentOfficeAdmin(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  const user = req.user as { uuid: string; role: string };
  if (!["Owner", "Administrator"].includes(user.role)) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return user;
}

function readEncryptedToken(config: Record<string, unknown> | null): Buffer | null {
  if (!config) return null;
  const canonical = config.encrypted_api_token;
  if (Buffer.isBuffer(canonical) && canonical.length > 0) return canonical;
  const legacy = config.api_token_encrypted;
  if (Buffer.isBuffer(legacy) && legacy.length > 0) return legacy;
  return null;
}

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

type RawCall = { url: string; http_status: number | null; error: string | null; rows: Record<string, unknown>[] };

async function rawGet(token: string, url: string): Promise<RawCall> {
  const out: RawCall = { url: url.replace(SAMSARA_API_BASE, ""), http_status: null, error: null, rows: [] };
  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
  } catch (err) {
    out.error = `network_error:${String((err as Error)?.message ?? err)}`;
    return out;
  }
  out.http_status = res.status;
  let json: Record<string, unknown>;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    out.error = "non_json_response";
    return out;
  }
  if (!res.ok) {
    out.error = str(json.message) ?? JSON.stringify(json).slice(0, 300);
    return out;
  }
  out.rows = Array.isArray(json.data) ? (json.data.filter((r) => asObject(r)) as Record<string, unknown>[]) : [];
  return out;
}

export async function registerSamsaraStatsProbeRoutes(app: FastifyInstance) {
  app.get("/api/v1/integrations/samsara/stats-probe", async (req, reply) => {
    const user = currentOfficeAdmin(req, reply);
    if (!user) return;
    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const oc = parsed.data.operating_company_id;

    const cfg = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${oc}'`);
      return getSamsaraConfigForCompany(client, oc);
    });
    if (!cfg || !Boolean((cfg as Record<string, unknown>).is_enabled)) {
      return reply.code(409).send({ error: "samsara_not_enabled" });
    }
    const token = decryptSamsaraSecret(readEncryptedToken(cfg as Record<string, unknown>));
    if (!token) return reply.code(409).send({ error: "samsara_token_unavailable" });

    const now = new Date();
    const start = new Date(now.getTime() - 60 * 60 * 1000);

    // A) valid stats call (gps + engine). B) the deployed (suspected-invalid) call. C) the driver feed.
    const statsValid = await rawGet(token, `${SAMSARA_API_BASE}/fleet/vehicles/stats?types=gps,engineStates`);
    const statsDeployed = await rawGet(token, `${SAMSARA_API_BASE}/fleet/vehicles/stats?types=gps,driverAssignments,engineStates`);
    const driverFeed = await rawGet(
      token,
      `${SAMSARA_API_BASE}/fleet/vehicles/driver-assignments?startTime=${start.toISOString()}&endTime=${now.toISOString()}`
    );

    // Build the per-vehicle table from the VALID stats call + the driver feed.
    type V = { vehicle_id: string; name: string | null; formatted_location: string | null; engine_state: string | null; driver_name: string | null; logged_in_driver: boolean };
    const byId = new Map<string, V>();
    for (const row of statsValid.rows) {
      const id = str(row.id);
      if (!id) continue;
      const gps = asObject(row.gps);
      const reverse = gps ? asObject(gps.reverseGeo) : null;
      const engine = asObject(row.engineStates);
      byId.set(id, {
        vehicle_id: id,
        name: str(row.name),
        formatted_location: reverse ? str(reverse.formattedLocation) : null,
        engine_state: engine ? str(engine.value) : null,
        driver_name: null,
        logged_in_driver: false,
      });
    }
    for (const row of driverFeed.rows) {
      const id = str(row.id);
      if (!id) continue;
      const assignments = Array.isArray(row.driverAssignments) ? row.driverAssignments : [];
      // CURRENT logged-in driver = an assignment with no endTime (or the latest-start one).
      let current: Record<string, unknown> | null = null;
      let best = "";
      for (const a of assignments) {
        const ao = asObject(a);
        if (!ao) continue;
        const startT = str(ao.startTime) ?? "";
        const ended = str(ao.endTime);
        if (ended && current) continue;
        if (startT >= best) { best = startT; current = ao; }
      }
      const driver = current ? asObject(current.driver) : null;
      const v = byId.get(id) ?? { vehicle_id: id, name: str(row.name), formatted_location: null, engine_state: null, driver_name: null, logged_in_driver: false };
      v.name = v.name ?? str(row.name);
      v.driver_name = driver ? str(driver.name) : null;
      v.logged_in_driver = Boolean(driver);
      byId.set(id, v);
    }

    const perVehicle = [...byId.values()].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    const movingHint = perVehicle.filter((v) => v.engine_state === "On");

    return reply.send({
      operating_company_id: oc,
      probed_at: now.toISOString(),
      // The decisive answers to Query 2:
      interpretation: {
        deployed_call_http_status: statsDeployed.http_status,        // expect 400 if types param is invalid
        deployed_call_is_invalid: statsDeployed.http_status === 400,
        deployed_call_error: statsDeployed.error,                    // Samsara's verbatim message
        valid_stats_http_status: statsValid.http_status,             // expect 200
        city_state_available: perVehicle.some((v) => v.formatted_location),
        engine_state_available: perVehicle.some((v) => v.engine_state),
        driver_feed_http_status: driverFeed.http_status,
        vehicles_total: perVehicle.length,
        vehicles_with_logged_in_driver: perVehicle.filter((v) => v.logged_in_driver).length,
        engine_on_vehicles: movingHint.length,
        engine_on_with_driver: movingHint.filter((v) => v.logged_in_driver).length,
      },
      per_vehicle: perVehicle,
      raw_call_status: {
        valid_gps_engine: { http_status: statsValid.http_status, error: statsValid.error, vehicles: statsValid.rows.length },
        deployed_with_driver: { http_status: statsDeployed.http_status, error: statsDeployed.error },
        driver_assignments: { http_status: driverFeed.http_status, error: driverFeed.error, vehicles: driverFeed.rows.length },
      },
    });
  });
}
