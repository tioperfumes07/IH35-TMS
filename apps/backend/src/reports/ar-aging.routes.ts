import type { FastifyInstance } from "fastify";
import { companyQuerySchema, currentAuthUser, validationError } from "./shared.js";

export async function registerArAgingRoutes(app: FastifyInstance) {
  app.get("/api/v1/reports/ar-aging", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    return {
      status: "stub",
      message:
        "A/R aging requires the accounting module which ships in Phase 5. Customer invoice infrastructure is not yet in the schema.",
      rows: [],
    };
  });
}
