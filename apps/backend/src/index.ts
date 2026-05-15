import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { registerPhoneAuthRoutes } from "./auth/phone-routes.js";
import { registerEmailAuthRoutes } from "./auth/email-routes.js";
import { registerInviteAuthRoutes } from "./auth/invite.routes.js";
import { registerAuthRoutes } from "./auth/routes.js";
import { registerSessionMiddleware } from "./auth/session-middleware.js";
import { registerQboOAuthRoutes } from "./integrations/qbo/oauth.routes.js";
import { registerSamsaraConfigRoutes } from "./integrations/samsara/samsara-config.routes.js";
import { registerSamsaraHealthRoutes } from "./integrations/samsara/samsara-health.routes.js";
import { registerSamsaraWebhookRoutes } from "./integrations/samsara/samsara-webhook.routes.js";
import { registerQboForensicAdminRoutes } from "./integrations/qbo/forensic-admin.routes.js";
import { registerQboSyncAdminRoutes } from "./integrations/qbo/qbo-sync-admin.routes.js";
import { registerQboVendorLinkageRoutes } from "./integrations/qbo/qbo-vendor-linkage.routes.js";
import { registerIdentityRoutes } from "./identity/users.routes.js";
import { registerUserPreferencesRoutes } from "./identity/user-preferences.routes.js";
import { registerWorkflowRoutes } from "./identity/workflow-routes.js";
import { registerAccountingCatalogRoutes } from "./catalogs/accounting/index.js";
import { registerDriverCatalogRoutes } from "./catalogs/driver/index.js";
import { registerFleetCatalogRoutes } from "./catalogs/fleet/index.js";
import { registerFuelCatalogRoutes } from "./catalogs/fuel/index.js";
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
import { registerDocsFilesRoutes } from "./docs/files.routes.js";
import { registerAttachmentsRoutes } from "./documents/attachments.routes.js";
import { registerDispatchLoadRoutes } from "./dispatch/loads.routes.js";
import { registerDispatchSheetHtmlRoutes } from "./dispatch/dispatch-sheet.routes.js";
import { registerDispatchQuicksaveRoutes } from "./dispatch/quicksave.routes.js";
import { registerDispatchCancellationRoutes } from "./dispatch/cancellation.routes.js";
import { registerDispatchRefinementsRoutes } from "./dispatch/dispatch-refinements.routes.js";
import { registerIntransitIssuesRoutes } from "./dispatch/intransit-issues.routes.js";
import { registerDriverRoutes } from "./driver/index.js";
import { registerDriverFinanceSettlementRoutes } from "./driver-finance/settlements.routes.js";
import { registerDriverFinanceSettlementHtmlRoutes } from "./driver-finance/settlement-render.routes.js";
import { registerDriverFinanceDriverBillsRoutes } from "./driver-finance/driver-bills.routes.js";
import { registerDriverFinanceDebtRoutes } from "./driver-finance/debt.routes.js";
import { registerDriverFinanceDeductionRoutes } from "./driver-finance/deductions.routes.js";
import { registerCashAdvanceRequestRoutes } from "./driver-finance/cash-advance-requests.routes.js";
import { registerOwnerApprovalPortalRoutes } from "./driver-finance/owner-approval.routes.js";
import { registerAbandonmentRoutes } from "./driver-finance/abandonment.routes.js";
import { registerHomeRoutes } from "./home/home.routes.js";
import { registerReportsRoutes } from "./reports/index.js";
import { registerFuelPlannerRoutes } from "./fuel/planner.routes.js";
import { registerFuelLovesUploadRoutes } from "./fuel/loves-upload.routes.js";
import { registerSafetyRoutes } from "./safety/safety.routes.js";
import { registerDriverSchedulerRoutes } from "./safety/driver-scheduler.routes.js";
import { registerSafetyFinesRoutes } from "./safety/fines.routes.js";
import { registerSafetyCompanyViolationsRoutes } from "./safety/company-violations.routes.js";
import { registerSafetyV5Routes } from "./safety/safety-v5.routes.js";
import { registerSafetyHosViolationsRoutes } from "./routes/safety/hos-violations.js";
import { registerSafetyDotInspectionsRoutes } from "./routes/safety/dot-inspections.js";
import { registerSafetyCsaScoresRoutes } from "./routes/safety/csa-scores.js";
import { registerSafetyComplaintsRoutes } from "./routes/safety/complaints.js";
import { registerSafetyIntegrityRoutes } from "./routes/safety/integrity.js";
import { registerLiabilitiesRoutes } from "./liabilities/liabilities.routes.js";
import { registerBankTxCategorizationRoutes } from "./banking/categorization.routes.js";
import { registerBankingRoutes } from "./banking/banking.routes.js";
import { registerAccountBalanceRoutes } from "./banking/account-balance.routes.js";
import { registerPlaidLinkRoutes } from "./integrations/plaid/link.routes.js";
import { registerPlaidWebhookRoutes } from "./integrations/plaid/webhook.routes.js";
import { registerBankingPlaidWebhookRoutes } from "./banking/plaid/webhook.routes.js";
import { registerBankingTransfersRoutes } from "./banking/transfers.routes.js";
import { registerBankingManualJeRoutes } from "./banking/manual-je.routes.js";
import { registerBankingFactoringVirtualRoutes } from "./banking/factoring-virtual.routes.js";
import { registerBankingEscrowVisualizerRoutes } from "./banking/escrow-visualizer.routes.js";
import { registerFactoringRoutes } from "./factoring/factoring.routes.js";
import { registerCashAdvancesRoutes } from "./cash-advances/cash-advances.routes.js";
import { registerMaintenanceWorkOrderRoutes } from "./maintenance/work-orders.routes.js";
import { registerWorkOrdersV1Routes } from "./work-orders/work-orders.routes.js";
import { registerMaintenanceDashboardRoutes } from "./maintenance/dashboard.routes.js";
import { registerMaintenanceTriageRoutes } from "./maintenance/triage.routes.js";
import { registerMaintenanceArrivingSoonRoutes } from "./maintenance/arriving-soon.routes.js";
import { registerMaintenanceDriverReportsRoutes } from "./maintenance/driver-reports.routes.js";
import { registerWoTimeEntriesRoutes } from "./maintenance/time-entries.routes.js";
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
import { registerQboAutocompleteRoutes } from "./mdata/qbo-autocomplete.routes.js";
import { registerQboMasterWriteRoutes } from "./mdata/qbo-master-write.routes.js";
import { registerDriverTeamsAliasRoutes } from "./mdata/driver-teams-alias.routes.js";
import { registerMdataWorkflowRoutes } from "./mdata/workflow-routes.js";
import { registerAccountingRoutes } from "./accounting/index.js";
import { registerAccountingSettlementDisputesP6Routes } from "./accounting/disputes.routes.js";
import { registerDataInfrastructureRoutes } from "./data-infra/data-infra.routes.js";
import { registerOcrRoutes } from "./ocr/ocr.routes.js";
import { registerCompanyRoutes } from "./org/companies.routes.js";
import { registerLegalTemplateRoutes } from "./legal/templates.routes.js";
import { registerLegalContractRoutes } from "./legal/contracts.routes.js";
import { registerLegalSignRoutes } from "./legal/sign.routes.js";
import { registerLegalAttorneyReviewRoutes } from "./legal/attorney-review.routes.js";
import { registerLegalMattersRoutes } from "./legal/matters.routes.js";
import { startOutboxProcessor, stopOutboxProcessor } from "./outbox/index.js";
import { initializeQboHistoricalImportRunner } from "./cron/qbo-historical-import-runner.js";
import { initializeQboSyncQueueRunner } from "./cron/qbo-sync-queue-runner.js";
import { initializeQboTokenRefreshCron } from "./cron/qbo-token-refresh-cron.js";
import { initializeCashAdvanceRequestExpiryCron } from "./cron/cash-advance-request-expiry-cron.js";
import { initializeSamsaraHealthCheckCron } from "./cron/samsara-health-cron.js";
import { initializeLegalMattersReminderCron } from "./legal/matters-reminder.cron.js";
import { initializeMasterDataSyncCron } from "./qbo/master-data-sync.cron.js";
import { registerMasterDataSyncRoutes } from "./qbo/master-data-sync.routes.js";
import { initializeQboSyncAlertsCron } from "./qbo/sync-alerts-cron.js";
import { registerEmailRoutes } from "./email/email.routes.js";
import { registerEmailQueueAdminRoutes } from "./admin/email-queue-admin.routes.js";
import { registerAdminActivityRoutes } from "./admin/activity.routes.js";
import { registerAdminClientErrorRoutes } from "./admin/client-errors.routes.js";
import { initializeEmailCron } from "./email/cron.js";
import { initializeQboOutboxDispatcher, stopQboOutboxDispatcher } from "./integrations/qbo/outbox-dispatcher.js";
import { initializeQboSyncWorker, stopQboSyncWorker } from "./integrations/qbo/qbo-sync-worker.js";
import { registerQboSyncAlertsRoutes } from "./qbo/sync-alerts.routes.js";
import { registerQboSyncActionsRoutes } from "./qbo/sync-actions.routes.js";
import { registerQboSyncRunsListRoutes } from "./qbo/sync-runs-list.routes.js";
import { registerQboUnlinkedEntitiesRoutes } from "./qbo/unlinked-entities.routes.js";
import { registerQboBulkLinkRoutes } from "./qbo/bulk-link.routes.js";
import { registerQboSyncHealthRoutes } from "./qbo/sync-health.routes.js";
import { registerRunnerStatusRoutes } from "./admin/runner-status.routes.js";
import { registerForensicLiveRoutes } from "./admin/forensic-live.routes.js";
import { registerLaunchReadinessRoutes } from "./admin/launch-readiness.routes.js";
import { registerHealthDeepRoutes } from "./admin/health-deep.routes.js";
import { registerDataImportAdminRoutes } from "./admin/data-import.routes.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { attachSentryRequestScope, initBackendSentry, registerSentryFastifyErrorHandler } from "./lib/sentry.js";
import { runStartupEnvironmentChecks } from "./lib/env-validation.js";
import { verifyMigrationsOnStartup } from "./lib/migration-verification.js";
import { registerHealthRoutes } from "./health/health.routes.js";
import { setAppReady } from "./lib/startup-ready.js";

type CorsOriginValue = string | boolean | RegExp | Array<string | boolean | RegExp>;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

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

app.get("/api/v1/health", async () => {
  return { status: "ok" };
});

app.get("/api/v1/me", async (_req, reply) => {
  return reply.redirect("/api/v1/auth/me", 307);
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
    stopQboSyncWorker();
    stopQboOutboxDispatcher();
  } catch (error) {
    app.log.error({ err: error }, "Failed to stop QBO sync processors cleanly");
  }
  try {
    await app.close();
  } catch (error) {
    app.log.error({ err: error }, "Error while closing Fastify");
  }
  process.exit(0);
}

async function main() {
  initBackendSentry();
  await runStartupEnvironmentChecks();

  if (!app.hasDecorator("forensicRunnerStatus")) {
    app.decorate("forensicRunnerStatus", "pending");
  }

  registerSentryFastifyErrorHandler(app);
  await registerHealthRoutes(app);

  if (process.env.SKIP_MIGRATION_VERIFICATION !== "true") {
    try {
      await Promise.race([
        verifyMigrationsOnStartup(repoRoot),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("migration_verification_timeout_10s")), 10000)
        ),
      ]);
    } catch (error) {
      app.log.error(
        { err: error },
        "[STARTUP] migration verification failed or timed out — continuing without it"
      );
    }
  } else {
    app.log.info("[STARTUP] migration verification skipped via SKIP_MIGRATION_VERIFICATION=true");
  }
  setAppReady(true);

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
  app.addHook("preHandler", async (req, _reply) => {
    const url = req.raw.url ?? "";
    if (url.startsWith("/api/v1/healthz")) {
      return;
    }
    attachSentryRequestScope(req);
  });
  await registerRunnerStatusRoutes(app);
  await registerForensicLiveRoutes(app);
  await registerAuthRoutes(app);
  await registerQboOAuthRoutes(app);
  await registerSamsaraWebhookRoutes(app);
  await registerSamsaraConfigRoutes(app);
  await registerSamsaraHealthRoutes(app);
  await registerQboForensicAdminRoutes(app);
  await registerQboSyncAdminRoutes(app);
  await registerQboVendorLinkageRoutes(app);
  await registerMasterDataSyncRoutes(app);
  await registerQboSyncAlertsRoutes(app);
  await registerQboSyncRunsListRoutes(app);
  await registerQboSyncActionsRoutes(app);
  await registerQboUnlinkedEntitiesRoutes(app);
  await registerQboBulkLinkRoutes(app);
  await registerQboSyncHealthRoutes(app);
  await registerEmailRoutes(app);
  await registerEmailQueueAdminRoutes(app);
  await registerAdminClientErrorRoutes(app);
  await registerAdminActivityRoutes(app);
  await registerLaunchReadinessRoutes(app);
  await registerHealthDeepRoutes(app);
  await registerDataImportAdminRoutes(app);
  await registerPhoneAuthRoutes(app);
  await registerEmailAuthRoutes(app);
  await registerInviteAuthRoutes(app);
  await registerIdentityRoutes(app);
  await registerUserPreferencesRoutes(app);
  await registerWorkflowRoutes(app);
  await registerMdataRoutes(app);
  await registerQboAutocompleteRoutes(app);
  await registerQboMasterWriteRoutes(app);
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
  await registerDriverTeamsAliasRoutes(app);
  await registerCatalogsRoutes(app);
  await registerDriverCatalogRoutes(app);
  await registerFuelCatalogRoutes(app);
  await registerFleetCatalogRoutes(app);
  await registerAccountingCatalogRoutes(app);
  await registerCatalogRegistryRoutes(app);
  await registerEquipmentTypeRoutes(app);
  await registerDriverLoadStatusRoutes(app);
  await registerStatesRoutes(app);
  await registerLoadCancellationReasonRoutes(app);
  await registerDispatchFlagColorRoutes(app);
  // ─── Safety catalog routes (T11.21.2A) ───
  await registerSafetyCatalogRoutes(app);
  // ─── End Safety catalog routes ───
  await registerCatalogsWorkflowRoutes(app);
  await registerFileCategoriesRoutes(app);
  await registerDocsFilesRoutes(app);
  await registerAttachmentsRoutes(app);
  await registerDispatchLoadRoutes(app);
  await registerDispatchSheetHtmlRoutes(app);
  await registerDispatchQuicksaveRoutes(app);
  await registerDispatchCancellationRoutes(app);
  await registerDispatchRefinementsRoutes(app);
  await registerIntransitIssuesRoutes(app);
  await registerDriverRoutes(app);
  await registerDriverFinanceSettlementRoutes(app);
  await registerDriverFinanceSettlementHtmlRoutes(app);
  await registerDriverFinanceDriverBillsRoutes(app);
  await registerDriverFinanceDebtRoutes(app);
  await registerDriverFinanceDeductionRoutes(app);
  await registerOwnerApprovalPortalRoutes(app);
  await registerCashAdvanceRequestRoutes(app);
  await registerAbandonmentRoutes(app);
  await registerHomeRoutes(app);
  await registerReportsRoutes(app);
  await registerFuelPlannerRoutes(app);
  await registerFuelLovesUploadRoutes(app);
  await registerSafetyRoutes(app);
  await registerDriverSchedulerRoutes(app);
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
  await registerBankTxCategorizationRoutes(app);
  await registerBankingRoutes(app);
  await registerAccountBalanceRoutes(app);
  await registerPlaidLinkRoutes(app);
  await registerPlaidWebhookRoutes(app);
  await registerBankingPlaidWebhookRoutes(app);
  await registerBankingTransfersRoutes(app);
  await registerBankingManualJeRoutes(app);
  await registerBankingFactoringVirtualRoutes(app);
  await registerBankingEscrowVisualizerRoutes(app);
  await registerFactoringRoutes(app);
  await registerDataInfrastructureRoutes(app);
  await registerOcrRoutes(app);
  await registerMaintenanceWorkOrderRoutes(app);
  await registerWorkOrdersV1Routes(app);
  await registerWoTimeEntriesRoutes(app);
  await registerMaintenanceDriverReportsRoutes(app);
  await registerMaintenanceDashboardRoutes(app);
  await registerMaintenanceTriageRoutes(app);
  await registerMaintenanceArrivingSoonRoutes(app);
  await registerForm425CRoutes(app);
  await registerListsHubRoutes(app);
  await registerAccountingRoutes(app);
  await registerAccountingSettlementDisputesP6Routes(app);
  await registerCompanyRoutes(app);
  await registerLegalTemplateRoutes(app);
  await registerLegalContractRoutes(app);
  await registerLegalSignRoutes(app);
  await registerLegalAttorneyReviewRoutes(app);
  await registerLegalMattersRoutes(app);

  try {
    await initializeQboHistoricalImportRunner(app);
    app.log.info("[STARTUP] qbo-forensic-runner initialized");
  } catch (error) {
    app.log.error({ err: error }, "[STARTUP] qbo-forensic-runner failed");
    (app as unknown as { forensicRunnerStatus?: string }).forensicRunnerStatus = "failed";
  }

  try {
    await initializeQboSyncQueueRunner(app);
    app.log.info("[STARTUP] qbo-sync-runner initialized");
  } catch (error) {
    app.log.error({ err: error }, "[STARTUP] qbo-sync-runner failed");
  }

  try {
    await initializeQboTokenRefreshCron(app);
    app.log.info("[STARTUP] qbo-token-refresh-cron initialized");
  } catch (error) {
    app.log.error({ err: error }, "[STARTUP] qbo-token-refresh-cron failed");
  }

  try {
    initializeCashAdvanceRequestExpiryCron(app);
    app.log.info("[STARTUP] cash-advance-request-expiry-cron initialized");
  } catch (error) {
    app.log.error({ err: error }, "[STARTUP] cash-advance-request-expiry-cron failed");
  }

  try {
    initializeSamsaraHealthCheckCron(app);
    app.log.info("[STARTUP] samsara-health-cron initialized");
  } catch (error) {
    app.log.error({ err: error }, "[STARTUP] samsara-health-cron failed");
  }

  try {
    initializeLegalMattersReminderCron(app);
    app.log.info("[STARTUP] legal-matters-reminder-cron initialized");
  } catch (error) {
    app.log.error({ err: error }, "[STARTUP] legal-matters-reminder-cron failed");
  }

  try {
    await initializeMasterDataSyncCron(app);
    app.log.info("[STARTUP] qbo-master-data-sync-cron initialized");
  } catch (error) {
    app.log.error({ err: error }, "[STARTUP] qbo-master-data-sync-cron failed");
  }

  try {
    initializeQboSyncAlertsCron(app);
    app.log.info("[STARTUP] qbo-sync-alerts-cron initialized");
  } catch (error) {
    app.log.error({ err: error }, "[STARTUP] qbo-sync-alerts-cron failed");
  }

  try {
    initializeEmailCron(app);
    app.log.info("[STARTUP] email-cron initialized");
  } catch (error) {
    app.log.error({ err: error }, "[STARTUP] email-cron failed");
  }

  try {
    initializeQboSyncWorker(app);
    app.log.info("[STARTUP] qbo-sync-run-worker initialized");
  } catch (error) {
    app.log.error({ err: error }, "[STARTUP] qbo-sync-run-worker failed");
  }

  try {
    initializeQboOutboxDispatcher(app);
    app.log.info("[STARTUP] qbo-outbox-dispatcher initialized");
  } catch (error) {
    app.log.error({ err: error }, "[STARTUP] qbo-outbox-dispatcher failed");
  }

  const port = Number(process.env.PORT || 3000);
  const host = "0.0.0.0";
  try {
    const seen = new Set<string>();
    for (const r of app.printRoutes({ commonPrefix: false }).split("\n")) {
      const key = r.trim();
      if (key && seen.has(key)) {
        throw new Error(`[boot] duplicate route detected: ${key}`);
      }
      seen.add(key);
    }

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
