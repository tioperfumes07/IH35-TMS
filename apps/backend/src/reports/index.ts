import type { FastifyInstance } from "fastify";
import { registerReportsLibraryRoutes } from "./library.routes.js";
import { registerProfitPerTruckRoutes } from "./profit-per-truck.routes.js";
import { registerDriverSettlementSummaryRoutes } from "./driver-settlement-summary.routes.js";
import { registerDriverPayHistoryRoutes } from "./driver-pay-history.routes.js";
import { registerMaintenanceCostPerUnitRoutes } from "./maintenance-cost-per-unit.routes.js";
import { registerFuelSavingsRoutes } from "./fuel-savings.routes.js";
import { registerCsaFleetScoreRoutes } from "./csa-fleet-score.routes.js";
import { registerArAgingRoutes } from "./ar-aging.routes.js";
import { registerDetentionClaimsRoutes } from "./detention-claims.routes.js";
import { registerIftaStatusRoutes } from "./ifta-status.routes.js";
import { registerScheduledReportAdminRoutes } from "./scheduled-report-admin.routes.js";

export async function registerReportsRoutes(app: FastifyInstance) {
  await registerReportsLibraryRoutes(app);
  await registerProfitPerTruckRoutes(app);
  await registerDriverSettlementSummaryRoutes(app);
  await registerDriverPayHistoryRoutes(app);
  await registerMaintenanceCostPerUnitRoutes(app);
  await registerFuelSavingsRoutes(app);
  await registerCsaFleetScoreRoutes(app);
  await registerArAgingRoutes(app);
  await registerDetentionClaimsRoutes(app);
  await registerIftaStatusRoutes(app);
  await registerScheduledReportAdminRoutes(app);
}
