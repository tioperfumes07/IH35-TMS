/**
 * GAP-25 — Active Driver Set Routes
 *
 * GET  /api/integrations/samsara/active-drivers
 *   Returns the cached active-driver set for the authenticated tenant.
 *   Query params: threshold_days (7|14|30, default 7), max_age_minutes (default 15)
 *
 * POST /api/integrations/samsara/active-drivers/recompute
 *   Manually triggers an immediate recompute and returns the new snapshot.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser, withLuciaBypass } from "../../../auth/db.js";
import { requireAuth } from "../../../auth/session-middleware.js";
import { getActiveDrivers } from "./query.service.js";
import { recomputeActiveDriverSet } from "./recompute.service.js";

const getQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  threshold_days: z
    .enum(["7", "14", "30"])
    .optional()
    .transform((v) => Number(v ?? "7")),
  max_age_minutes: z
    .string()
    .optional()
    .transform((v) => Number(v ?? "15")),
});

const recomputeBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  threshold_days: z.number().int().min(1).max(90).optional().default(7),
});

function officeUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  const user = req.user as { uuid: string; role: string };
  if (user.role === "Driver") {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return user;
}

export async function registerActiveDriverSetRoutes(app: FastifyInstance) {
  app.get("/api/integrations/samsara/active-drivers", async (req, reply) => {
    const user = officeUser(req, reply);
    if (!user) return;

    const parsed = getQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }

    const { operating_company_id, threshold_days, max_age_minutes } = parsed.data;

    const result = await withCurrentUser(user.uuid, async (client) => {
      return getActiveDrivers(client, operating_company_id, threshold_days, max_age_minutes);
    });

    return reply.send(result);
  });

  app.post("/api/integrations/samsara/active-drivers/recompute", async (req, reply) => {
    const user = officeUser(req, reply);
    if (!user) return;

    const parsed = recomputeBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }

    const { operating_company_id, threshold_days } = parsed.data;

    const snapshot = await withLuciaBypass(async (client) => {
      return recomputeActiveDriverSet(client, operating_company_id, threshold_days);
    });

    return reply.code(201).send(snapshot);
  });
}
