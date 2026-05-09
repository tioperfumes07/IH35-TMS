import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { registerPhoneAuthRoutes } from "./auth/phone-routes.js";
import { registerEmailAuthRoutes } from "./auth/email-routes.js";
import { registerInviteAuthRoutes } from "./auth/invite.routes.js";
import { registerAuthRoutes } from "./auth/routes.js";
import { registerSessionMiddleware } from "./auth/session-middleware.js";
import { registerIdentityRoutes } from "./identity/users.routes.js";
import { registerWorkflowRoutes } from "./identity/workflow-routes.js";
import { registerCatalogsRoutes } from "./catalogs/index.js";
import { registerCatalogRegistryRoutes } from "./catalogs/catalog-registry.routes.js";
import { registerFileCategoriesRoutes } from "./catalogs/file-categories.routes.js";
import { registerDriverLoadStatusRoutes } from "./catalogs/driver-load-statuses.routes.js";
import { registerEquipmentTypeRoutes } from "./catalogs/equipment-types.routes.js";
import { registerStatesRoutes } from "./catalogs/states.routes.js";
import { registerCatalogsWorkflowRoutes } from "./catalogs/workflow-routes.js";
import { registerLoadCancellationReasonRoutes } from "./catalogs/load-cancellation-reasons.routes.js";
import { registerDispatchFlagColorRoutes } from "./catalogs/dispatch-flag-colors.routes.js";
import { registerSafetyCatalogRoutes } from "./catalogs/safety/index.js";
import { registerDispatchCatalogRoutes } from "./catalogs/dispatch/index.js";
import { registerDriverCatalogRoutes } from "./catalogs/driver/index.js";
import { registerDocsFilesRoutes } from "./docs/files.routes.js";
import { registerDispatchLoadRoutes } from "./dispatch/loads.routes.js";
import { registerIntransitIssuesRoutes } from "./dispatch/intransit-issues.routes.js";
import { registerDriverRoutes } from "./driver/index.js";
import { registerDriverFinanceSettlementRoutes } from "./driver-finance/settlements.routes.js";
import { registerDriverFinanceDebtRoutes } from "./driver-finance/debt.routes.js";
import { registerDriverFinanceDeductionRoutes } from "./driver-finance/deductions.routes.js";
import { registerReportsRoutes } from "./reports/index.js";
import { registerFuelPlannerRoutes } from "./fuel/planner.routes.js";
import { registerFuelLovesUploadRoutes } from "./fuel/loves-upload.routes.js";
import { registerSafetyRoutes } from "./safety/safety.routes.js";
import { registerSafetyFinesRoutes } from "./safety/fines.routes.js";
import { registerSafetyCompanyViolationsRoutes } from "./safety/company-violations.routes.js";
import { registerSafetyV5Routes } from "./safety/safety-v5.routes.js";
import { registerSafetyHosViolationsRoutes } from "./routes/safety/hos-violations.js";
import { registerSafetyDotInspectionsRoutes } from "./routes/safety/dot-inspections.js";
import { registerSafetyCsaScoresRoutes } from "./routes/safety/csa-scores.js";
import { registerSafetyComplaintsRoutes } from "./routes/safety/complaints.js";
import { registerSafetyIntegrityRoutes } from "./routes/safety/integrity.js";
import { registerLiabilitiesRoutes } from "./liabilities/liabilities.routes.js";
import { registerBankingRoutes } from "./banking/banking.routes.js";
import { registerBankingManualJeRoutes } from "./banking/manual-je.routes.js";
import { registerBankingFactoringVirtualRoutes } from "./banking/factoring-virtual.routes.js";
import { registerBankingEscrowVisualizerRoutes } from "./banking/escrow-visualizer.routes.js";
import { registerFactoringRoutes } from "./factoring/factoring.routes.js";
import { registerCashAdvancesRoutes } from "./cash-advances/cash-advances.routes.js";
import { registerMaintenanceWorkOrderRoutes } from "./maintenance/work-orders.routes.js";
import { registerMaintenanceDashboardRoutes } from "./maintenance/dashboard.routes.js";
import { registerMaintenanceTriageRoutes } from "./maintenance/triage.routes.js";
import { registerMaintenanceArrivingSoonRoutes } from "./maintenance/arriving-soon.routes.js";
import { registerForm425CRoutes } from "./compliance/form-425c.routes.js";
import { registerListsHubRoutes } from "./lists/lists-hub.routes.js";
import { registerDriverProfileRoutes } from "./mdata/driver-profile.routes.js";
import { registerDriverReturningDetectionRoutes } from "./mdata/driver-returning-detection.routes.js";
import { registerDriverSafetyEventsRoutes } from "./mdata/driver-safety-events.routes.js";
import { registerDispatcherSafetyEventsRoutes } from "./mdata/dispatcher-safety-events.routes.js";
import { registerCustomerContactRoutes } from "./mdata/customer-contacts.routes.js";
import { registerCustomerQualityEventsRoutes } from "./mdata/customer-quality-events.routes.js";
import { registerCustomerBillingRoutes } from "./mdata/customer-billing.routes.js";
import { registerCustomerLanesRoutes } from "./mdata/customer-lanes.routes.js";
import { registerCustomerDetailAliasRoutes } from "./mdata/customer-detail-alias.routes.js";
import { registerMdataRoutes } from "./mdata/index.js";
import { registerMdataWorkflowRoutes } from "./mdata/workflow-routes.js";
import { registerAccountingRoutes } from "./accounting/index.js";
import { registerCompanyRoutes } from "./org/companies.routes.js";
import { startOutboxProcessor, stopOutboxProcessor } from "./outbox/index.js";

type CorsOriginValue = string | boolean | RegExp | Array<string | boolean | RegExp>;

const app = Fastify({ logger: true });
let shuttingDown = false;
const ALLOWED_ORIGINS = (
  process.env.CORS_ALLOWED_ORIGINS ??
  "https://ih35-tms-web.onrender.com,https://ih35-tms-driver.onrender.com,http://localhost:5173,http://localhost:5174"
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

// Required for BT-1-AUTH-DRIVER phone auth:
// - TWILIO_ACCOUNT_SID
// - TWILIO_AUTH_TOKEN
// - TWILIO_VERIFY_SERVICE_SID

app.get("/api/v1/_healthcheck", async () => {
  return { status: "ok" };
});

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, "Shutdown signal received");
  try {
    await stopOutboxProcessor();
  } catch (error) {
    app.log.error({ err: error }, "Failed to stop outbox processor cleanly");
  }
  try {
    await app.close();
  } catch (error) {
    app.log.error({ err: error }, "Error while closing Fastify");
  }
  process.exit(0);
}

async function main() {
  await app.register(cors, {
    origin: (origin: string | undefined, cb: (err: Error | null, allow: CorsOriginValue) => void) => {
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error("CORS: origin not allowed"), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });
  await app.register(cookie);
  await app.register(multipart);
  await registerSessionMiddleware(app);
  await registerAuthRoutes(app);
  await registerPhoneAuthRoutes(app);
  await registerEmailAuthRoutes(app);
  await registerInviteAuthRoutes(app);
  await registerIdentityRoutes(app);
  await registerWorkflowRoutes(app);
  await registerMdataRoutes(app);
  await registerDriverProfileRoutes(app);
  await registerDriverReturningDetectionRoutes(app);
  await registerDriverSafetyEventsRoutes(app);
  await registerDispatcherSafetyEventsRoutes(app);
  await registerCustomerContactRoutes(app);
  await registerCustomerQualityEventsRoutes(app);
  await registerCustomerBillingRoutes(app);
  await registerCustomerLanesRoutes(app);
  await registerCustomerDetailAliasRoutes(app);
  await registerMdataWorkflowRoutes(app);
  await registerCatalogsRoutes(app);
  await registerCatalogRegistryRoutes(app);
  await registerEquipmentTypeRoutes(app);
  await registerDriverLoadStatusRoutes(app);
  await registerStatesRoutes(app);
  await registerLoadCancellationReasonRoutes(app);
  await registerDispatchFlagColorRoutes(app);
  // ─── Safety catalog routes (T11.21.2A) ───
  await registerSafetyCatalogRoutes(app);
  // ─── End Safety catalog routes ───
  // ─── Dispatch catalog routes (T11.21.3A) ───
  await registerDispatchCatalogRoutes(app);
  // ─── End Dispatch catalog routes ───
  // ─── Driver catalog routes (T11.21.4A) ───
  await registerDriverCatalogRoutes(app);
  // ─── End Driver catalog routes ───
  await registerCatalogsWorkflowRoutes(app);
  await registerFileCategoriesRoutes(app);
  await registerDocsFilesRoutes(app);
  await registerDispatchLoadRoutes(app);
  await registerIntransitIssuesRoutes(app);
  await registerDriverRoutes(app);
  await registerDriverFinanceSettlementRoutes(app);
  await registerDriverFinanceDebtRoutes(app);
  await registerDriverFinanceDeductionRoutes(app);
  await registerReportsRoutes(app);
  await registerFuelPlannerRoutes(app);
  await registerFuelLovesUploadRoutes(app);
  await registerSafetyRoutes(app);
  await registerSafetyFinesRoutes(app);
  await registerSafetyCompanyViolationsRoutes(app);
  await registerSafetyV5Routes(app);
  await registerSafetyHosViolationsRoutes(app);
  await registerSafetyDotInspectionsRoutes(app);
  await registerSafetyCsaScoresRoutes(app);
  await registerSafetyComplaintsRoutes(app);
  await registerSafetyIntegrityRoutes(app);
  await registerLiabilitiesRoutes(app);
  await registerCashAdvancesRoutes(app);
  await registerBankingRoutes(app);
  await registerBankingManualJeRoutes(app);
  await registerBankingFactoringVirtualRoutes(app);
  await registerBankingEscrowVisualizerRoutes(app);
  await registerFactoringRoutes(app);
  await registerMaintenanceWorkOrderRoutes(app);
  await registerMaintenanceDashboardRoutes(app);
  await registerMaintenanceTriageRoutes(app);
  await registerMaintenanceArrivingSoonRoutes(app);
  await registerForm425CRoutes(app);
  await registerListsHubRoutes(app);
  await registerAccountingRoutes(app);
  await registerCompanyRoutes(app);
  const port = Number(process.env.PORT || 3000);
  const host = "0.0.0.0";
  try {
    await app.listen({ port, host });
    if (process.env.ENABLE_OUTBOX_PROCESSOR !== "false") {
      startOutboxProcessor();
      app.log.info("Outbox processor started");
    }
    app.log.info({ port, host }, "Server started");
  } catch (err) {
    app.log.error(err, "Server failed to start");
    process.exit(1);
  }
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

main();
