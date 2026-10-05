// Load real-driven-miles HTTP routes, split out of load-real-driven-miles.service.ts (CC-2 2026-10-04) so the service — and
// the cron that imports it — stays free of the auth middleware and session provider.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser, withLuciaBypass } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { computeLoadRealDrivenMiles, storageReady, threeMileComparison, type DbClient } from "./load-real-driven-miles.service.js";

const loadParams = z.object({ id: z.string().uuid() });
const loadQuery = z.object({ operating_company_id: z.string().uuid() });

export async function registerLoadRealDrivenMilesRoutes(app: FastifyInstance) {
  app.get("/api/v1/loads/:id/real-driven-miles", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    if (!requireAuth(req, reply)) return reply;
    const user = req.user;
    if (!user) return;
    const params = loadParams.safeParse(req.params ?? {});
    const query = loadQuery.safeParse(req.query ?? {});
    if (!params.success || !query.success) return reply.code(400).send({ error: "validation_error" });
    const opco = query.data.operating_company_id;
    await assertCompanyMembership(user.uuid, opco);
    const payload = await withCurrentUser(user.uuid, async (client) => {
      const db = client as DbClient;
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const load = await db.query<{ id: string; load_number: string | null; unit_id: string | null; unit_number: string | null; practical: string | null; shortest: string | null; deadhead: string | null }>(
        `SELECT l.id::text, l.load_number, l.assigned_unit_id::text AS unit_id, u.unit_number,
                l.miles_practical::text AS practical, l.miles_shortest::text AS shortest, l.miles_deadhead::text AS deadhead
           FROM mdata.loads l LEFT JOIN mdata.units u ON u.id = l.assigned_unit_id
          WHERE l.id = $1::uuid AND l.operating_company_id = $2::uuid`,
        [params.data.id, opco]
      );
      const head = load.rows[0];
      if (!head) return null;
      const [row] = await computeLoadRealDrivenMiles(db, opco, [head.id]);
      const num = (x: string | null) => (x == null ? null : Number(x));
      return {
        load: { id: head.id, load_number: head.load_number },
        unit: head.unit_id ? { id: head.unit_id, unit_number: head.unit_number } : null,
        legs: row?.legs ?? [],
        comparison: row ? threeMileComparison(row, num(head.practical), num(head.shortest), num(head.deadhead)) : null,
        stored: await storageReady(db),
        basis: { real_driven: "odometer (geofence enter/exit or device-recorded stop times)", practical: "miles_practical (billed)", short: "miles_shortest + miles_deadhead (paid)" },
      };
    });
    if (!payload) return reply.code(404).send({ error: "load_not_found" });
    return payload;
  });
}
