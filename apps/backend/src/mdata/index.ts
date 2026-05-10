import type { FastifyInstance } from "fastify";
import { registerCustomerRoutes } from "./customers.routes.js";
import { registerDriverRoutes } from "./drivers.routes.js";
import { registerDriverTeamRoutes } from "./driver-teams.routes.js";
import { registerDriverTeamSplitRoutes } from "./driver-team-split.routes.js";
import { registerEquipmentLogRoutes } from "./equipment-log.routes.js";
import { registerEquipmentRoutes } from "./equipment.routes.js";
import { registerLocationRoutes } from "./locations.routes.js";
import { registerLoadRoutes } from "./loads.routes.js";
import { registerUnitsRoutes } from "./units.routes.js";
import { registerVendorRoutes } from "./vendors.routes.js";

export async function registerMdataRoutes(app: FastifyInstance) {
  await registerDriverRoutes(app);
  await registerDriverTeamRoutes(app);
  await registerDriverTeamSplitRoutes(app);
  await registerUnitsRoutes(app);
  await registerCustomerRoutes(app);
  await registerVendorRoutes(app);
  await registerLocationRoutes(app);
  await registerLoadRoutes(app);
  await registerEquipmentRoutes(app);
  await registerEquipmentLogRoutes(app);
}
