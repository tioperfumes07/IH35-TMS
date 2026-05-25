import type { FastifyInstance } from "fastify";
import { registerCustomerRoutes } from "./customers.routes.js";
import { registerCustomerFinancialSummaryRoutes } from "./customer-financial.routes.js";
import { registerDriverRoutes } from "./drivers.routes.js";
import { registerMdataAccountsRoutes } from "./accounts.routes.js";
import { registerDriverTeamRoutes } from "./driver-teams.routes.js";
import { registerDriverTeamSplitRoutes } from "./driver-team-split.routes.js";
import { registerEquipmentLogRoutes } from "./equipment-log.routes.js";
import { registerEquipmentRoutes } from "./equipment.routes.js";
import { registerEquipmentTransferRoutes } from "./equipment-transfer.routes.js";
import { registerMdataItemsRoutes } from "./items.routes.js";
import { registerLocationRoutes } from "./locations.routes.js";
import { registerLoadRoutes } from "./loads.routes.js";
import { registerLoadAbandonmentRoutes } from "./load-abandonment.routes.js";
import { registerUnitsRoutes } from "./units.routes.js";
import { registerVendorRoutes } from "./vendors.routes.js";

export async function registerMdataRoutes(app: FastifyInstance) {
  await registerDriverRoutes(app);
  await registerMdataAccountsRoutes(app);
  await registerMdataItemsRoutes(app);
  await registerDriverTeamRoutes(app);
  await registerDriverTeamSplitRoutes(app);
  await registerUnitsRoutes(app);
  await registerCustomerRoutes(app);
  await registerCustomerFinancialSummaryRoutes(app);
  await registerVendorRoutes(app);
  await registerLocationRoutes(app);
  await registerLoadRoutes(app);
  await registerLoadAbandonmentRoutes(app);
  await registerEquipmentRoutes(app);
  await registerEquipmentLogRoutes(app);
  await registerEquipmentTransferRoutes(app);
}
