import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

/**
 * Read-only list of WO cancellation reasons (catalogs.wo_cancellation_reasons, migration 202606221200).
 * The Cancel WO modal's reason dropdown is fed from here, and the WO cancel route validates
 * cancel_reason_code AGAINST this catalog — never a hard-coded enum (the #1335 lesson).
 */
export async function registerWoCancellationReasonRoutes(app: FastifyInstance) {
  app.get("/api/v1/catalogs/wo-cancellation-reasons", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const rows = await withCurrentUser(user.uuid, async (client) => {
      const res = await client.query<{
        reason_code: string;
        reason_label: string;
        requires_owner_approval: boolean;
        sort_order: number;
      }>(
        `SELECT reason_code, reason_label, requires_owner_approval, sort_order
           FROM catalogs.wo_cancellation_reasons
          WHERE is_active = true
          ORDER BY sort_order ASC, reason_label ASC`
      );
      return res.rows;
    });
    return reply.send({ reasons: rows });
  });
}
