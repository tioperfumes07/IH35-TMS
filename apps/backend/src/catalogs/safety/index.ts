import type { FastifyInstance } from "fastify";
import { registerCivilFineTypesRoutes } from "./civil-fine-types.routes.js";
import { registerCompanyViolationTypesRoutes } from "./company-violation-types.routes.js";
import { registerInternalFineReasonsRoutes } from "./internal-fine-reasons.routes.js";

export async function registerSafetyCatalogRoutes(app: FastifyInstance) {
  await registerInternalFineReasonsRoutes(app);
  await registerCivilFineTypesRoutes(app);
  await registerCompanyViolationTypesRoutes(app);
}
