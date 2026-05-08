import type { FastifyInstance } from "fastify";
import { companyQuerySchema, currentAuthUser, validationError } from "./shared.js";

export async function registerDetentionClaimsRoutes(app: FastifyInstance) {
  app.get("/api/v1/reports/detention-claims", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    return {
      status: "stub",
      message:
        "Detention claims tracking requires per-stop detention billing which ships in Phase 4. Default detention rates exist, but per-load detention computation is not implemented yet.",
      rows: [],
    };
  });
}
