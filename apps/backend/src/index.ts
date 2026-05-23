import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { registerPhoneAuthRoutes } from "./auth/phone-routes.js";
import { registerEmailAuthRoutes } from "./auth/email-routes.js";
import { registerOfficeLoginRoutes } from "./auth/office-login.routes.js";
import { registerInviteAuthRoutes } from "./auth/invite.routes.js";
import { registerAuthRoutes } from "./auth/routes.js";
import { registerSessionMiddleware } from "./auth/session-middleware.js";
import { registerQboOAuthRoutes } from "./integrations/qbo/oauth.routes.js";
import { registerQboWebhookRoutes } from "./integrations/qbo/qbo-webhook.routes.js";
import { registerSamsaraConfigRoutes } from "./integrations/samsara/samsara-config.routes.js";
import { registerSamsaraHealthRoutes } from "./integrations/samsara/samsara-health.routes.js";
import { registerSamsaraWebhookRoutes } from "./integrations/samsara/samsara-webhook.routes.js";
import { registerSamsaraVendorMappingActionsRoutes } from "./integrations/samsara/vendor-mapping-actions.routes.js";
import { registerSamsaraVendorMappingIntegrityRoutes } from "./integrations/samsara/vendor-mapping.routes.js";
import { registerQboForensicAdminRoutes } from "./integrations/qbo/forensic-admin.routes.js";
import { registerQboSyncAdminRoutes } from "./integrations/qbo/qbo-sync-admin.routes.js";
import { registerQboVendorLinkageRoutes } from "./integrations/qbo/qbo-vendor-linkage.routes.js";
import { registerIdentityRoutes } from "./identity/users.routes.js";
import { registerCompanyContextRoutes } from "./identity/company-context.routes.js";
import { registerPasswordResetRoutes } from "./identity/password-reset.routes.js";
import { registerNotificationPreferenceRoutes } from "./identity/notification-prefs.routes.js";
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
import { registerGeofencesRoutes } from "./telematics/geofences.routes.js";
import { registerDashcamOnDemandRoutes } from "./telematics/dashcam-on-demand.routes.js";
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
import { registerDotInspectionEventsRoutes } from "./safety/dot-inspection-events.routes.js";
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
import { registerPlaidAdminRoutes } from "./integrations/plaid/admin.routes.js";
import { registerPlaidWebhookRoutes } from "./integrations/plaid/webhook.routes.js";
import { registerBankingPlaidWebhookRoutes } from "./banking/plaid/webhook.routes.js";
import { registerBankingTransfersRoutes } from "./banking/transfers.routes.js";
import { registerBankingManualJeRoutes } from "./banking/manual-je.routes.js";
import { registerBankingFactoringVirtualRoutes } from "./banking/factoring-virtual.routes.js";
import { registerBankingEscrowVisualizerRoutes } from "./banking/escrow-visualizer.routes.js";
import { registerBankingReconciliationRoutes } from "./banking/reconciliation.routes.js";
import { registerBankingP7Wave2Routes } from "./banking/p7-wave2.routes.js";
import { registerBankingObligationReconcileRoutes } from "./banking/obligation-reconcile.routes.js";
import { registerFactoringRoutes } from "./factoring/factoring.routes.js";
import { registerCashAdvancesRoutes } from "./cash-advances/cash-advances.routes.js";
import { registerMaintenanceWorkOrderRoutes } from "./maintenance/work-orders.routes.js";
import { registerWorkOrdersV1Routes } from "./work-orders/work-orders.routes.js";
import { registerMaintenanceDashboardRoutes } from "./maintenance/dashboard.routes.js";
import { registerMaintenancePmAlertsRoutes } from "./maintenance/pm-alerts.routes.js";
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
import { initializeQboInboundSyncCron, stopQboInboundSyncCron } from "./cron/qbo-inbound-sync.cron.js";
import { initializeQboCdcPollCron } from "./cron/qbo-cdc-poll.cron.js";
import { initializeRecurringTemplatesCron } from "./cron/recurring-templates.cron.js";
import { initializeQboTokenRefreshCron } from "./cron/qbo-token-refresh-cron.js";
import { initializeCashAdvanceRequestExpiryCron } from "./cron/cash-advance-request-expiry-cron.js";
import { initializeSamsaraHealthCheckCron } from "./cron/samsara-health-cron.js";
import { initializeSamsaraWebhookProjectionCron } from "./cron/samsara-webhook-projection.cron.js";
import { initializeSamsaraRemoteCountCollectorCron } from "./cron/samsara-remote-count-collector.cron.js";
import { initializeLegalMattersReminderCron } from "./legal/matters-reminder.cron.js";
import { initializeMasterDataSyncCron } from "./qbo/master-data-sync.cron.js";
import { registerMasterDataSyncRoutes } from "./qbo/master-data-sync.routes.js";
import { initializeQboSyncAlertsCron } from "./qbo/sync-alerts-cron.js";
import { initializeQboRemoteCountCollectorCron } from "./cron/qbo-remote-count-collector.cron.js";
import { initializeReconciliationWorkerCron } from "./cron/reconciliation-worker.cron.js";
import { registerEmailRoutes } from "./email/email.routes.js";
import { registerEmailQueueAdminRoutes } from "./admin/email-queue-admin.routes.js";
import { registerAdminActivityRoutes } from "./admin/activity.routes.js";
import { registerAdminAccountingSyncRoutes } from "./admin/accounting-sync.routes.js";
import { registerAdminSyncHealthRoutes } from "./admin/sync-health.routes.js";
import { registerAdminClientErrorRoutes } from "./admin/client-errors.routes.js";
import { initializeEmailCron } from "./email/cron.js";
import { initializeQboOutboxDispatcher, stopQboOutboxDispatcher } from "./integrations/qbo/outbox-dispatcher.js";
import { initializeQboSyncWorker, stopQboSyncWorker } from "./integrations/qbo/qbo-sync-worker.js";
import { registerQboSyncAlertsRoutes } from "./qbo/sync-alerts.routes.js";
import { registerQboSyncActionsRoutes } from "./qbo/sync-actions.routes.js";
import { registerQboSyncRunsListRoutes } from "./qbo/sync-runs-list.routes.js";
import { registerQboSyncConflictDetectionRoutes } from "./qbo/sync-conflict-detection.routes.js";
import { registerQboUnlinkedEntitiesRoutes } from "./qbo/unlinked-entities.routes.js";
import { registerQboBulkLinkRoutes } from "./qbo/bulk-link.routes.js";
import { registerQboSyncHealthRoutes } from "./qbo/sync-health.routes.js";
import { registerQboSyncEventLogRoutes } from "./qbo/sync-event-log.routes.js";
import { registerRunnerStatusRoutes } from "./admin/runner-status.routes.js";
import { registerForensicLiveRoutes } from "./admin/forensic-live.routes.js";
import { registerLaunchReadinessRoutes } from "./admin/launch-readiness.routes.js";
import { registerHealthDeepRoutes } from "./admin/health-deep.routes.js";
import { registerAdminJobsRoutes } from "./admin/admin-jobs.routes.js";
import { registerDataImportAdminRoutes } from "./admin/data-import.routes.js";
import { resolveMonorepoRoot } from "./lib/monorepo-root.js";
import { attachSentryRequestScope, initBackendSentry, registerSentryFastifyErrorHandler } from "./lib/sentry.js";
import { runStartupEnvironmentChecks } from "./lib/env-validation.js";
import { verifyMigrationsOnStartup } from "./lib/migration-verification.js";
import { registerHealthRoutes } from "./health/health.routes.js";
import { setAppReady } from "./lib/startup-ready.js";
import { assertNoDuplicateFastifyRoutes } from "./lib/fastify-route-duplicates.js";
import { assertMigrationDriftBootGuard } from "./lib/migration-status.js";
import { attachHttpErrorMonitor } from "./lib/error-monitor-hooks.js";
import { pool } from "./auth/db.js";
import { registerMigrationStatusRoutes } from "./admin/migration-status.routes.js";
import { registerHomeWidgetRoutes } from "./home/home-widgets.routes.js";
import { registerPlaidBankingItemsRoutes } from "./banking/plaid-items.routes.js";
import { registerWeeklyCloseRoutes } from "./driver-finance/weekly-close.routes.js";
import { registerErrorMonitorRoutes } from "./admin/error-monitor.routes.js";
import { initializeErrorDigestCron } from "./cron/error-digest.cron.js";
import { registerDailyTasksRoutes } from "./daily-tasks/daily-tasks.routes.js";
import { initializeDailyTaskAlertsCron, stopDailyTaskAlertsCron } from "./cron/daily-task-alerts.cron.js";
import { initializeAdminJobsWorker, stopAdminJobsWorker } from "./admin/admin-jobs.service.js";
import { runStartupMigrationDriftGuard } from "./db/startup-migration-drift-guard.js";
import { registerTelematicsHosRoutes } from "./telematics/hos.routes.js";
import { registerVehicleDriverPairingRoutes } from "./telematics/vehicle-driver-pairing.routes.js";

type CorsOriginValue = string | boolean | RegExp | Array<string | boolean | RegExp>;

const repoRoot = resolveMonorepoRoot(import.meta.url);

const app = Fastify({ logger: true });
attachHttpErrorMonitor(app);
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
    stopQboInboundSyncCron();
    stopDailyTaskAlertsCron();
    stopAdminJobsWorker();
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

  const driftConn = await pool.connect();
  try {
    await runStartupMigrationDriftGuard({
      repoRoot,
      client: driftConn,
    });
  } finally {
    driftConn.release();
  }

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
  await registerQboWebhookRoutes(app);
  await registerSamsaraWebhookRoutes(app);
  await registerSamsaraConfigRoutes(app);
  await registerSamsaraHealthRoutes(app);
  await registerSamsaraVendorMappingIntegrityRoutes(app);
  await registerSamsaraVendorMappingActionsRoutes(app);
  await registerQboForensicAdminRoutes(app);
  await registerQboSyncAdminRoutes(app);
  await registerQboVendorLinkageRoutes(app);
  await registerMasterDataSyncRoutes(app);
  await registerQboSyncAlertsRoutes(app);
  await registerQboSyncRunsListRoutes(app);
  await registerQboSyncConflictDetectionRoutes(app);
  await registerQboSyncActionsRoutes(app);
  await registerQboUnlinkedEntitiesRoutes(app);
  await registerQboBulkLinkRoutes(app);
  await registerQboSyncHealthRoutes(app);
  await registerQboSyncEventLogRoutes(app);
  await registerEmailRoutes(app);
  await registerEmailQueueAdminRoutes(app);
  await registerAdminClientErrorRoutes(app);
  await registerErrorMonitorRoutes(app);
  await registerAdminActivityRoutes(app);
  await registerAdminAccountingSyncRoutes(app);
  await registerAdminSyncHealthRoutes(app);
  await registerLaunchReadinessRoutes(app);
  await registerHealthDeepRoutes(app);
  await registerAdminJobsRoutes(app);
  await registerMigrationStatusRoutes(app);
  await registerDataImportAdminRoutes(app);
  await registerPhoneAuthRoutes(app);
  await registerEmailAuthRoutes(app);
  await registerOfficeLoginRoutes(app);
  await registerInviteAuthRoutes(app);
  await registerIdentityRoutes(app);
  await registerCompanyContextRoutes(app);
  await registerPasswordResetRoutes(app);
  await registerNotificationPreferenceRoutes(app);
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
  await registerGeofencesRoutes(app);
  await registerDashcamOnDemandRoutes(app);
  await registerDriverFinanceSettlementRoutes(app);
  await registerWeeklyCloseRoutes(app);
  await registerDriverFinanceSettlementHtmlRoutes(app);
  await registerDriverFinanceDriverBillsRoutes(app);
  await registerDriverFinanceDebtRoutes(app);
  await registerDriverFinanceDeductionRoutes(app);
  await registerOwnerApprovalPortalRoutes(app);
  await registerCashAdvanceRequestRoutes(app);
  await registerAbandonmentRoutes(app);
  await registerHomeRoutes(app);
  await registerHomeWidgetRoutes(app);
  await registerReportsRoutes(app);
  await registerFuelPlannerRoutes(app);
  await registerFuelLovesUploadRoutes(app);
  await registerSafetyRoutes(app);
  await registerDriverSchedulerRoutes(app);
  await registerSafetyFinesRoutes(app);
  await registerSafetyCompanyViolationsRoutes(app);
  await registerSafetyV5Routes(app);
  await registerDotInspectionEventsRoutes(app);
  await registerSafetyHosViolationsRoutes(app);
  await registerSafetyDotInspectionsRoutes(app);
  await registerSafetyCsaScoresRoutes(app);
  await registerSafetyComplaintsRoutes(app);
  await registerSafetyIntegrityRoutes(app);
  await registerLiabilitiesRoutes(app);
  await registerCashAdvancesRoutes(app);
  await registerBankTxCategorizationRoutes(app);
  await registerBankingRoutes(app);
  await registerPlaidBankingItemsRoutes(app);
  await registerAccountBalanceRoutes(app);
  await registerPlaidLinkRoutes(app);
  await registerPlaidAdminRoutes(app);
  await registerPlaidWebhookRoutes(app);
  await registerBankingPlaidWebhookRoutes(app);
  await registerBankingTransfersRoutes(app);
  await registerBankingManualJeRoutes(app);
  await registerBankingFactoringVirtualRoutes(app);
  await registerBankingEscrowVisualizerRoutes(app);
  await registerBankingReconciliationRoutes(app);
  await registerBankingP7Wave2Routes(app);
  await registerBankingObligationReconcileRoutes(app);
  await registerFactoringRoutes(app);
  await registerDataInfrastructureRoutes(app);
  await registerOcrRoutes(app);
  await registerMaintenanceWorkOrderRoutes(app);
  await registerWorkOrdersV1Routes(app);
  await registerWoTimeEntriesRoutes(app);
  await registerMaintenanceDriverReportsRoutes(app);
  await registerMaintenanceDashboardRoutes(app);
  await registerMaintenancePmAlertsRoutes(app);
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
  await registerDailyTasksRoutes(app);
  await registerTelematicsHosRoutes(app);
  await registerVehicleDriverPairingRoutes(app);

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
    initializeQboInboundSyncCron(app);
    app.log.info("[STARTUP] qbo-inbound-sync initialized");
  } catch (error) {
    app.log.error({ err: error }, "[STARTUP] qbo-inbound-sync failed");
  }

  try {
    initializeQboCdcPollCron(app);
    app.log.info("[STARTUP] qbo-cdc-poll initialized");
  } catch (error) {
    app.log.error({ err: error }, "[STARTUP] qbo-cdc-poll failed");
  }

  try {
    initializeRecurringTemplatesCron(app);
    app.log.info("[STARTUP] recurring-templates cron initialized");
  } catch (error) {
    app.log.error({ err: error }, "[STARTUP] recurring-templates cron failed");
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
    initializeSamsaraWebhookProjectionCron(app);
    app.log.info("[STARTUP] samsara-webhook-projection-cron initialized");
  } catch (error) {
    app.log.error({ err: error }, "[STARTUP] samsara-webhook-projection-cron failed");
  }

  try {
    initializeSamsaraRemoteCountCollectorCron(app);
    app.log.info("[STARTUP] samsara-remote-count-collector-cron initialized");
  } catch (error) {
    app.log.error({ err: error }, "[STARTUP] samsara-remote-count-collector-cron failed");
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
    initializeQboRemoteCountCollectorCron(app);
    app.log.info("[STARTUP] qbo-remote-count-collector-cron initialized");
  } catch (error) {
    app.log.error({ err: error }, "[STARTUP] qbo-remote-count-collector-cron failed");
  }

  try {
    initializeReconciliationWorkerCron(app);
    app.log.info("[STARTUP] reconciliation-worker-cron initialized");
  } catch (error) {
    app.log.error({ err: error }, "[STARTUP] reconciliation-worker-cron failed");
  }

  try {
    initializeEmailCron(app);
    app.log.info("[STARTUP] email-cron initialized");
  } catch (error) {
    app.log.error({ err: error }, "[STARTUP] email-cron failed");
  }

  try {
    initializeErrorDigestCron(app);
    app.log.info("[STARTUP] error-digest scheduler initialized");
  } catch (error) {
    app.log.error({ err: error }, "[STARTUP] error-digest scheduler failed");
  }

  try {
    initializeDailyTaskAlertsCron(app);
    app.log.info("[STARTUP] daily-task-alerts cron initialized");
  } catch (error) {
    app.log.error({ err: error }, "[STARTUP] daily-task-alerts cron failed");
  }

  try {
    initializeAdminJobsWorker(app);
    app.log.info("[STARTUP] admin-jobs-worker initialized");
  } catch (error) {
    app.log.error({ err: error }, "[STARTUP] admin-jobs-worker failed");
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
    await app.ready();

    const conn = await pool.connect();
    try {
      await assertMigrationDriftBootGuard({
        repoRoot,
        client: conn,
        logError: (obj, msg) => app.log.error(obj, msg),
      });
    } finally {
      conn.release();
    }

    assertNoDuplicateFastifyRoutes(app);

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
