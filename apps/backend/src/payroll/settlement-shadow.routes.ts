import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import { runSettlementShadow } from "./settlement-shadow.service.js";

// A3-3: read-only / compute-only shadow comparison. NO writes. Evidence for flipping the cutover flag.
const shadowQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const REVIEW_ROLES = new Set(["Owner", "Administrator", "Accountant", "SuperAdmin"]);

export async function registerSettlementShadowRoutes(app: FastifyInstance) {
  app.get("/api/v1/payroll/settlement-shadow-run", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!REVIEW_ROLES.has(String((user as { role?: string }).role ?? ""))) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const query = shadowQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    // withCompanyScope asserts membership + sets RLS scope; the handler only reads + computes.
    const report = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      runSettlementShadow(client, {
        operatingCompanyId: query.data.operating_company_id,
        periodStart: query.data.period_start,
        periodEnd: query.data.period_end,
      })
    );
    return reply.send(report);
  });
}
