import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireAuth } from "../auth/session-middleware.js";

/**
 * ENG-60 — insurance.lawsuit is RETIRED (owner 10-24, LEAD 443.332: "lawsuits only in Legal"). A lawsuit IS a legal
 * matter (legal.matters type 'lawsuit'); migration 202616310100 drops the side table and both link columns
 * (0 rows / 0 links measured live, all entities, 2026-11-02).
 * Cursor (#27984) answered POST/PATCH with 410 Gone so a stale client is told where lawsuits live instead of getting a
 * silent 404; Claude Lead (ENG-60 drop) makes the GET the same — it read the dropped table and would 500 after the drop.
 * NO SQL here: every verb answers 410 with the canonical place to go. Rate limits kept so a stale client cannot hammer.
 */
const LAWSUIT_SIDE_TABLE_GONE = {
  error: "insurance_lawsuit_retired",
  message: "Create and edit lawsuits in Legal › Lawsuits (legal.matters type=lawsuit). insurance.lawsuit is retired (ENG-60).",
  redirect: "/legal/lawsuits",
} as const;

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerInsuranceLawsuitRoutes(app: FastifyInstance) {
  app.get("/api/v1/insurance/lawsuits", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    return reply.code(410).send(LAWSUIT_SIDE_TABLE_GONE);
  });

  app.post(
    "/api/v1/insurance/lawsuits",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = authUser(req, reply);
      if (!user) return;
      return reply.code(410).send(LAWSUIT_SIDE_TABLE_GONE);
    },
  );

  app.patch(
    "/api/v1/insurance/lawsuits/:id",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = authUser(req, reply);
      if (!user) return;
      return reply.code(410).send(LAWSUIT_SIDE_TABLE_GONE);
    },
  );
}
