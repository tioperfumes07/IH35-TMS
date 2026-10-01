/**
 * ROUND 301 T-33 -- fault codes into the maintenance alert chain, resolving in BOTH directions
 * per docs/laws/TRANSACTION-LINKAGE-LAW.md §6.
 *
 * FORWARD (unit_id given): every fault this unit has ever thrown -- "a UNIT -> every ... repair,
 *   WO ... for its life."
 * REVERSE (driver_id given): every fault that occurred while this driver held whichever unit was
 *   assigned to him at that exact timestamp -- resolved via driverAtTimeSql (driver-attribution.ts),
 *   the one shared predicate, filtered as a WHERE on its own LATERAL result column rather than a
 *   second inline copy of the boundary condition.
 *
 * Tier 2 per the linkage law (asset-level maintenance, not a trip): unit_id is required, driver
 * is an ENRICHMENT resolved at read time (never a stored FK that could go stale), load/settlement
 * are correctly absent and never forced.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { driverAtTimeWithLoadFallbackSql } from "./driver-attribution.js";

const querySchema = z
  .object({
    operating_company_id: z.string().uuid(),
    unit_id: z.string().uuid().optional(),
    driver_id: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .refine((v) => Boolean(v.unit_id) !== Boolean(v.driver_id) || (!v.unit_id && !v.driver_id), {
    message: "pass at most one of unit_id or driver_id",
  });

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerFaultCodeAlertsRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/fault-code-alerts", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const q = parsed.data;

    await assertCompanyMembership(user.uuid, q.operating_company_id);
    const rows = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [q.operating_company_id]);

      const conditions = ["h.operating_company_id = $1::uuid"];
      const values: unknown[] = [q.operating_company_id];
      if (q.unit_id) {
        values.push(q.unit_id);
        conditions.push(`h.unit_id = $${values.length}::uuid`);
      }
      let driverFilterIdx: number | null = null;
      if (q.driver_id) {
        values.push(q.driver_id);
        driverFilterIdx = values.length;
      }
      values.push(q.limit);
      const limitIdx = values.length;

      const res = await client.query(
        `
          SELECT
            h.id::text,
            h.unit_id::text,
            -- CLS-JOIN-ENTITY-UNSCOPED: units carry owner/leased, never operating_company_id directly.
            u.unit_number,
            h.fault_code,
            h.source,
            h.severity,
            h.occurred_at::text,
            h.resolved_at::text,
            h.auto_wo_id::text,
            wo.display_id AS auto_wo_display_id,
            driver_at_time.driver_id::text AS driver_id,
            driver_at_time.attribution_source,
            d.first_name || ' ' || d.last_name AS driver_label
          FROM maintenance.samsara_fault_code_history h
          LEFT JOIN mdata.units u ON u.id = h.unit_id
                                 AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = h.operating_company_id
          LEFT JOIN maintenance.work_orders wo ON wo.id = h.auto_wo_id
                                               AND wo.operating_company_id = h.operating_company_id
          ${driverAtTimeWithLoadFallbackSql("h.unit_id", "h.occurred_at")}
          LEFT JOIN mdata.drivers d ON d.id = driver_at_time.driver_id
          WHERE ${conditions.join(" AND ")}
          ${driverFilterIdx ? `AND driver_at_time.driver_id = $${driverFilterIdx}::uuid` : ""}
          ORDER BY h.occurred_at DESC
          LIMIT $${limitIdx}
        `,
        values
      );
      return res.rows;
    });

    return { rows, resolved: q.unit_id ? "forward_by_unit" : q.driver_id ? "reverse_by_driver" : "all" };
  });
}
