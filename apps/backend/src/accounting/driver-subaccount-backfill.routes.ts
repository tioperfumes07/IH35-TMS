import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { runDriverSubAccountBackfill } from "./driver-subaccount-backfill.service.js";

// DRY-RUN ONLY route. The write run (apply=true) is intentionally NOT exposed here — it is Jorge's
// explicit manual go with his spreadsheet, after reviewing a dry-run preview (STOP-DECISION #2).
const dryRunQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const REVIEW_ROLES = new Set(["Owner", "Administrator", "Accountant", "SuperAdmin"]);

export async function registerDriverSubAccountBackfillRoutes(app: FastifyInstance) {
  app.get("/api/v1/payroll/driver-subaccount-backfill/dry-run", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!REVIEW_ROLES.has(String((user as { role?: string }).role ?? ""))) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const query = dryRunQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    // apply is hard-coded false here: this endpoint NEVER writes.
    const report = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      runDriverSubAccountBackfill(client, { operatingCompanyId: query.data.operating_company_id, apply: false })
    );
    return reply.send(report);
  });
}
