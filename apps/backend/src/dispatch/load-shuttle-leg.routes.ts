/**
 * LEAD 443.238 — the local yard-shuttle leg of a load. POST records it through THE writer (recordLoadShuttleLeg: GPS evidence of
 * the shuttle truck first, else the owner's / driver's report, then the stop-evidence engine stamps the pickup); GET lists it for
 * the load drawer / trip / driver history.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { currentAuthUser, withCompanyScope } from "../accounting/shared.js";
import { listLoadShuttleLegs, LoadShuttleLegError, recordLoadShuttleLeg } from "./load-shuttle-leg.service.js";

const WRITE_ROLES = new Set(["Owner", "Administrator", "Dispatcher"]);
const params = z.object({ id: z.string().uuid() });
const query = z.object({ operating_company_id: z.string().uuid() });
const body = z.object({
  operating_company_id: z.string().uuid(),
  from_stop_id: z.string().uuid().optional().nullable(),
  unit_numbers: z.array(z.string().trim().min(1).max(20)).min(1).max(6),
  driver_id: z.string().uuid().optional().nullable(),
  evidence: z.enum(["owner_ruling", "driver_report"]),
  note: z.string().trim().min(5).max(1000),
});

export async function registerLoadShuttleLegRoutes(app: FastifyInstance) {
  app.get("/api/v1/dispatch/loads/:id/shuttle-legs", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return reply;
    const p = params.safeParse(req.params ?? {});
    const q = query.safeParse(req.query ?? {});
    if (!p.success || !q.success) return reply.code(400).send({ error: "validation_error" });
    const legs = await withCompanyScope(user.uuid, q.data.operating_company_id, (client) => listLoadShuttleLegs(client as never, q.data.operating_company_id, p.data.id));
    return reply.send({ shuttle_legs: legs });
  });

  app.post("/api/v1/dispatch/loads/:id/shuttle-legs", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return reply;
    if (!WRITE_ROLES.has(String(user.role))) return reply.code(403).send({ error: "forbidden" });
    const p = params.safeParse(req.params ?? {});
    const b = body.safeParse(req.body ?? {});
    if (!p.success || !b.success) return reply.code(400).send({ error: "validation_error", details: b.success ? undefined : b.error.flatten() });
    try {
      const out = await withCompanyScope(user.uuid, b.data.operating_company_id, (client) =>
        recordLoadShuttleLeg(client as never, {
          operatingCompanyId: b.data.operating_company_id, loadId: p.data.id, fromStopId: b.data.from_stop_id ?? null,
          unitNumbers: b.data.unit_numbers, driverId: b.data.driver_id ?? null, evidence: b.data.evidence, note: b.data.note, actorUserId: user.uuid,
        })
      );
      return reply.code(201).send(out);
    } catch (err) {
      if (err instanceof LoadShuttleLegError) return reply.code(err.status).send({ error: err.code, message: err.message });
      if ((err as { code?: string }).code === "23505") return reply.code(409).send({ error: "SHUTTLE_LEG_EXISTS", message: "This pickup already has a shuttle leg." });
      throw err;
    }
  });
}
