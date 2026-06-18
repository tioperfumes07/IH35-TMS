import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { getTripPairingBoard } from "./trip-pairing-board.service.js";

const querySchema = z.object({ operating_company_id: z.string().uuid() });

function currentUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerTripPairingBoardRoutes(app: FastifyInstance) {
  // Read-only Trip Pairing Board aggregation (entity-scoped, no cap).
  app.get("/api/v1/dispatch/trip-pairing-board", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

    const asOf = new Date();
    const board = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [query.data.operating_company_id]);
      return getTripPairingBoard(client, query.data.operating_company_id, asOf);
    });
    return reply.send(board);
  });
}
