import type { FastifyInstance } from "fastify";
import { registerAdditionalChargesCatalogRoutes } from "./additional-charges.routes.js";
import { registerDetentionReasonsCatalogRoutes } from "./detention-reasons.routes.js";
import { registerLoadTypesCatalogRoutes } from "./load-types.routes.js";
import { registerPickupTimeTypesCatalogRoutes } from "./pickup-time-types.routes.js";

export async function registerDispatchCatalogRoutes(app: FastifyInstance) {
  await registerLoadTypesCatalogRoutes(app);
  await registerDetentionReasonsCatalogRoutes(app);
  await registerPickupTimeTypesCatalogRoutes(app);
  await registerAdditionalChargesCatalogRoutes(app);
}
