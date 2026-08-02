import type { FastifyInstance } from "fastify";
import { registerReportsLibraryRoutes } from "./library.routes.js";
import { registerCashFlowOverviewRoutes } from "./cash-flow-overview.routes.js";
import { registerSettlementSummaryRoutes } from "./settlement-summary.routes.js";
import { registerCustomerProfitabilityRoutes } from "./customer-profitability.routes.js";
import { registerProfitPerTruckRoutes } from "./profit-per-truck.routes.js";
import { registerDriverSettlementSummaryRoutes } from "./driver-settlement-summary.routes.js";
import { registerDriverPayHistoryRoutes } from "./driver-pay-history.routes.js";
import { registerMaintenanceCostPerUnitRoutes } from "./maintenance-cost-per-unit.routes.js";
import { registerFuelReconciliationRoutes } from "./fuel-reconciliation.routes.js";
import { registerFuelSavingsRoutes } from "./fuel-savings.routes.js";
import { registerCsaFleetScoreRoutes } from "./csa-fleet-score.routes.js";
import { registerDetentionClaimsRoutes } from "./detention-claims.routes.js";
import { registerReportsArAgingRoutes } from "./ar-aging.routes.js";
import { registerDispatchMarginRoutes } from "./dispatch-margin.routes.js";
import { registerIftaStatusRoutes } from "./ifta-status.routes.js";
import { registerScheduledReportAdminRoutes } from "./scheduled-report-admin.routes.js";
import { registerGeofenceDwellRoutes } from "./geofence-dwell.routes.js";
import { registerLaneProfitabilityRoutes } from "./lane-profitability.routes.js";
import { registerCashFlowReportRouteFix } from "./cash-flow/route-fix.js";
import { registerPerTruckCpmRoutes } from "./per-truck-cpm/route.js";
import { registerReportsIftaRoutes } from "./ifta/routes.js";
// RPT-F03 — mounted under the owner ruling of 2026-08-02 (settled decision + live verification).
// The module existed, compiled and was never wired, so GET /api/v1/reports/ap-aging 404'd while
// apps/frontend/src/api/reports.ts called it and the Outstanding A/P KPI drilled into it.
import { registerApAgingRoutes } from "./ap-aging.routes.js";

export async function registerReportsRoutes(app: FastifyInstance) {
  await registerReportsLibraryRoutes(app);
  await registerCashFlowOverviewRoutes(app);
  await registerSettlementSummaryRoutes(app);
  await registerCustomerProfitabilityRoutes(app);
  await registerProfitPerTruckRoutes(app);
  await registerLaneProfitabilityRoutes(app);
  await registerDriverSettlementSummaryRoutes(app);
  await registerDriverPayHistoryRoutes(app);
  await registerMaintenanceCostPerUnitRoutes(app);
  await registerReportsArAgingRoutes(app);
  // Mounted beside its A/R twin — the symmetry is exactly why the missing half was invisible.
  // Distinct path from the accounting module's /api/v1/accounting/ap-aging, so no route collision.
  await registerApAgingRoutes(app);
  await registerDispatchMarginRoutes(app);
  await registerFuelReconciliationRoutes(app);
  await registerFuelSavingsRoutes(app);
  await registerCsaFleetScoreRoutes(app);
  await registerDetentionClaimsRoutes(app);
  await registerIftaStatusRoutes(app);
  await registerReportsIftaRoutes(app);
  await registerGeofenceDwellRoutes(app);
  await registerScheduledReportAdminRoutes(app);
  await registerCashFlowReportRouteFix(app);
  await registerPerTruckCpmRoutes(app);
}
