import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerStatesRoutes(app: FastifyInstance) {
  app.get("/api/v1/catalogs/us-states", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    return withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query(
        `
          SELECT id, code, name, region
          FROM catalogs.us_states
          WHERE is_active = true
          ORDER BY name ASC
        `
      );
      return { states: res.rows };
    });
  });

  app.get("/api/v1/catalogs/mexico-states", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    return withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query(
        `
          SELECT id, code, name, region
          FROM catalogs.mexico_states
          WHERE is_active = true
          ORDER BY name ASC
        `
      );
      return { states: res.rows };
    });
  });
}
