/**
 * ROUND 285.4.10 / #60 — named queue: loads waiting on a BOL before auto-invoice.
 * GET /api/v1/dispatch/awaiting-bol-invoice?operating_company_id=
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { listLoadsAwaitingBolInvoice } from "../accounting/auto-invoice-on-bol.service.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
});

export async function registerAwaitingBolInvoiceRoutes(app: FastifyInstance) {
  app.get("/api/v1/dispatch/awaiting-bol-invoice", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const user = (req as FastifyRequest & { user?: { uuid: string } }).user;
    if (!user?.uuid) return reply.code(401).send({ error: "unauthorized" });

    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "invalid_query", details: parsed.error.flatten() });

    const oci = parsed.data.operating_company_id;
    try {
      await assertCompanyMembership(user.uuid, oci);
    } catch (err) {
      if ((err as Error & { statusCode?: number }).statusCode === 403) {
        return reply.code(403).send({ error: "forbidden_company_membership" });
      }
      throw err;
    }

    const waiting = await withCurrentUser(user.uuid, async (client) =>
      listLoadsAwaitingBolInvoice(client as never, oci)
    );
    return {
      operating_company_id: oci,
      waiting_for: "BOL",
      count: waiting.length,
      rows: waiting,
    };
  });
}
