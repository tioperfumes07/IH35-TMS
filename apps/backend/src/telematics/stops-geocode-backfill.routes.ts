import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { geocodeStopsBackfill } from "./stops-geocode-backfill.service.js";
import { withCurrentUser } from "../auth/db.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { verifyLoadStopsAgainstGps, type StopGpsVerdict } from "./stop-gps-verification.service.js";

const bodySchema = z.object({ operating_company_id: z.string().uuid() });
const zipBody = z.object({ operating_company_id: z.string().uuid(), dry_run: z.boolean().default(true), gps_decided_stop_ids: z.array(z.string().uuid()).max(50).optional() });

export async function registerStopsGeocodeBackfillRoutes(app: FastifyInstance) {
  app.post("/api/v1/telematics/stops/geocode-backfill", { config: { rateLimit: { max: 2, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireAuth(req, reply)) return reply;
    const user = req.user;
    if (!user) return;
    if (user.role !== "Owner" && user.role !== "Administrator") return reply.code(403).send({ error: "admin_required" });
    const parsed = bodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    return reply.send({ ok: true, ...(await geocodeStopsBackfill(user.uuid, parsed.data.operating_company_id)) });
  });

  // RULING 443.86 #2 — every live stop still on a ZIP CENTER (no street) takes the truck's loading dwell in that city on the
  // document date (verifyLoadStopsAgainstGps, zipCenterOnly): street + point + place id, fence re-drawn by the one fence
  // writer and queued to Samsara. No dwell -> listed with the reason. Owner / Administrator; dry_run rolls back.
  app.post("/api/v1/telematics/stops/zip-center-resolve", { config: { rateLimit: { max: 4, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireAuth(req, reply)) return reply;
    const user = req.user;
    if (!user) return;
    if (user.role !== "Owner" && user.role !== "Administrator") return reply.code(403).send({ error: "admin_required" });
    const parsed = zipBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const co = parsed.data.operating_company_id;
    const out = await withCurrentUser(user.uuid, async (client) => {
      await assertCompanyMembership(client as never, user.uuid, co);
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [co]);
      const loads = (await client.query<{ id: string }>(
        `SELECT DISTINCT l.id::text, l.load_number FROM mdata.loads l JOIN mdata.load_stops s ON s.load_id = l.id AND s.soft_deleted_at IS NULL
          WHERE l.operating_company_id = $1::uuid AND l.soft_deleted_at IS NULL AND l.voided_at IS NULL
            AND s.geocode_source = 'zip_center' AND s.address_line1 IS NULL
          ORDER BY l.load_number`, [co])).rows;
      await client.query("SAVEPOINT zip_center_resolve");
      const verdicts: StopGpsVerdict[] = [];
      for (const l of loads) verdicts.push(...(await verifyLoadStopsAgainstGps(client as never, {
        operatingCompanyId: co, loadId: l.id, apply: !parsed.data.dry_run, actorUserId: user.uuid, zipCenterOnly: true,
        // GPS-decided stops are the Owner's decision alone.
        gpsDecidedStopIds: user.role === "Owner" ? parsed.data.gps_decided_stop_ids : undefined,
        reason: "443.86 #2 zip-center stop resolved by GPS dwell",
      })));
      if (parsed.data.dry_run) await client.query("ROLLBACK TO SAVEPOINT zip_center_resolve");
      else await client.query("RELEASE SAVEPOINT zip_center_resolve");
      return {
        dry_run: parsed.data.dry_run, stops: verdicts.length,
        resolved: verdicts.filter((v) => v.verdict === "zip_center_resolved").map((v) =>
          `${v.load_number} #${v.sequence_number} -> ${v.facility?.street}, ${v.facility?.city} ${v.facility?.state} (${v.facility?.source}${v.facility?.name ? `: ${v.facility.name}` : ""}; ${v.dwell?.minutes} min, ${v.distance_m} m from zip center)${v.applied ? "" : " [not applied]"}`),
        listed: verdicts.filter((v) => v.verdict === "zip_center_unresolved").map((v) => `${v.load_number} #${v.sequence_number}: ${v.reason}`),
      };
    });
    return reply.send(out);
  });
}
