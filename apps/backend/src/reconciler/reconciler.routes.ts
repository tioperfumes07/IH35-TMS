import type { FastifyInstance } from "fastify";

import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import { runReconciler } from "./run.js";

/** Who may read the exception queue. A repair is an owner decision; nobody else sees the queue. */
export const RECONCILER_READER_ROLES: ReadonlySet<string> = new Set(["Owner", "Administrator"]);

export function registerReconcilerRoutes(app: FastifyInstance) {
  /**
   * Runs every invariant live and returns the exceptions. Detection only: the transaction is set
   * read-only before the first invariant runs, so this GET cannot write even if an invariant tried.
   * A repair is the owner's click on the engine each exception names; this route repairs nothing.
   */
  app.get(
    "/api/v1/reconciler/exceptions",
    { config: { rateLimit: { max: 12, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!RECONCILER_READER_ROLES.has(String(user.role ?? ""))) {
        return reply.code(403).send({ error: "owner_or_administrator_required" });
      }
      const query = companyQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return validationError(reply, query.error);
      const operatingCompanyId = query.data.operating_company_id;
      const run = await withCompanyScope(user.uuid, operatingCompanyId, async (client) => {
        await client.query("SET LOCAL transaction_read_only = on");
        return runReconciler(client, operatingCompanyId);
      });
      return reply.send(run);
    }
  );
}
