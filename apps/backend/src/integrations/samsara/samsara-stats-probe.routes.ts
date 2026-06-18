// Gated diagnostic probe — answers, from inside prod (where the Samsara token decrypts), exactly what
// Samsara returns for THIS carrier's vehicles, so we stop deploy-and-hoping. Read-only, Owner/Admin only.
// External I/O lives in samsara-stats-probe.service.ts (circuit-breaker wrapped) — never in this route.
//
// Jorge's rule: a driver LOGGED INTO Samsara for a vehicle IS that vehicle's driver. The decisive signal
// is Samsara's vehicle->driver assignment feed, NOT dispatch loads. The probe joins, per vehicle:
//   • gps.reverseGeo.formattedLocation (city/state) + engineStates.value (engine) from /fleet/vehicles/stats
//   • the CURRENT logged-in driver from /fleet/vehicles/driver-assignments
// and reports the HTTP status of the deployed types=...,driverAssignments call (to prove the 400).
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { decryptSamsaraSecret } from "../../lib/samsara-crypto.js";
import { getSamsaraConfigForCompany } from "./samsara.service.js";
import { runSamsaraStatsProbe, localPairingDiagnostics } from "./samsara-stats-probe.service.js";

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

export async function registerSamsaraStatsProbeRoutes(app: FastifyInstance) {
  app.get("/api/v1/integrations/samsara/stats-probe", async (req, reply) => {
    const user = currentOfficeAdmin(req, reply);
    if (!user) return;
    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const oc = parsed.data.operating_company_id;

    const { cfg, localDb } = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${oc}'`);
      const cfgRow = await getSamsaraConfigForCompany(client, oc);
      const local = await localPairingDiagnostics(client.query.bind(client), oc);
      return { cfg: cfgRow, localDb: local };
    });
    if (!cfg || !Boolean((cfg as Record<string, unknown>).is_enabled)) {
      return reply.code(409).send({ error: "samsara_not_enabled" });
    }
    const token = decryptSamsaraSecret(readEncryptedToken(cfg as Record<string, unknown>));
    if (!token) return reply.code(409).send({ error: "samsara_token_unavailable" });

    const result = await runSamsaraStatsProbe(token, new Date());
    return reply.send({ operating_company_id: oc, local_db: localDb, ...result });
  });
}
