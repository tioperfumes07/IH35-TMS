import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import cron from "node-cron";
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
import { registerTrkMigrationRoutes } from "./integrations/qbo/trk-migration.js";
import { registerIdentityRoutes } from "./identity/users.routes.js";
import { registerCompanyContextRoutes } from "./identity/company-context.routes.js";
import { registerPasswordResetRoutes } from "./identity/password-reset.routes.js";
import { registerNotificationPreferenceRoutes } from "./identity/notification-prefs.routes.js";
import { registerUserPreferencesRoutes } from "./identity/user-preferences.routes.js";
import { registerWorkflowRoutes } from "./identity/workflow-routes.js";
import { registerIdentityApplicantRoutes } from "./identity/applicants.routes.js";
import { registerAccountingCatalogRoutes } from "./catalogs/accounting/index.js";
import { registerDriverCatalogRoutes } from "./catalogs/driver/index.js";
import { registerFleetCatalogRoutes } from "./catalogs/fleet/index.js";
import { registerGenericCatalogRoutes } from "./catalogs/generic-catalog.routes.js";
import { registerStubCatalogPurgeRoutes } from "./catalogs/stub-catalog-purge.routes.js";
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
import { registerDocsFoundationRoutes } from "./docs/docs.routes.js";
import { registerDocsFilesRoutes } from "./docs/files.routes.js";
import { registerAttachmentsRoutes } from "./documents/attachments.routes.js";
import { registerDispatchLoadRoutes } from "./dispatch/loads.routes.js";
import { registerLoadsBulkRoutes } from "./dispatch/loads-bulk.routes.js";
import { registerDispatchCancelLoadRoutes } from "./dispatch/cancel-load.routes.js";
import { registerDispatchSheetHtmlRoutes } from "./dispatch/dispatch-sheet.routes.js";
import { registerDispatchLoadAssignRoutes } from "./dispatch/load-assign.routes.js";
import { registerDispatchQuicksaveRoutes } from "./dispatch/quicksave.routes.js";
import { registerDispatchAssignmentsQuicksaveRoutes } from "./dispatch/assignments/quicksave.routes.js";
import { registerDispatchCancellationRoutes } from "./dispatch/cancellation.routes.js";
import { registerDispatchRefinementsRoutes } from "./dispatch/dispatch-refinements.routes.js";
import { registerIntransitIssuesRoutes } from "./dispatch/intransit-issues.routes.js";
import { registerDispatchArchTabsRoutes } from "./dispatch/arch-tabs.routes.js";
import { registerDispatchAlertsRoutes } from "./dispatch/alerts.routes.js";
import { registerLateArrivalAnalyticsRoutes } from "./dispatch/analytics/late-arrival.routes.js";
import { registerDispatchPlannerRoutes } from "./dispatch/planner.routes.js";
import { registerDispatchDetentionRoutes } from "./dispatch/detention.routes.js";
import { registerDispatchOcrIntakeRoutes } from "./dispatch/ocr-intake.routes.js";
import { registerDispatchCustomerNotifyRoutes } from "./dispatch/customer-notify.routes.js";
import { registerDispatchPodBolRoutes } from "./dispatch/pod.routes.js";
import { registerPreDispatchValidationRoutes } from "./dispatch/validation/pre-dispatch.routes.js";
import { registerDispatcherRoleViewRoutes } from "./dispatcher-board/role-views/routes.js";
import { registerDriverRoutes } from "./driver/index.js";
import { registerDriversMessagesRoutes } from "./drivers/messages.routes.js";
import { registerDriversDocumentAlertsRoutes } from "./drivers/document-alerts.routes.js";
import { initializeDocumentAlertEngineCron } from "./drivers/document-alerts.cron.js";
import { registerGeofencesRoutes } from "./telematics/geofences.routes.js";
import { registerGeofenceStateMachineRoutes } from "./integrations/samsara/geofences/state-machine/routes.js";
import { registerDashcamOnDemandRoutes } from "./telematics/dashcam-on-demand.routes.js";
import { registerTelematicsPositionsRoutes } from "./telematics/positions.routes.js";
import { registerDriverDaySummaryRoutes } from "./telematics/driver-day-summary.routes.js";
import { registerTelematicsHeatmapRoutes } from "./telematics/heatmap.routes.js";
import { registerDriverFinanceSettlementRoutes } from "./driver-finance/settlements.routes.js";
import { registerDriverFinanceSettlementHtmlRoutes } from "./driver-finance/settlement-render.routes.js";
import { registerDriverFinanceDriverBillsRoutes } from "./driver-finance/driver-bills.routes.js";
import { registerDriverFinanceDebtRoutes } from "./driver-finance/debt.routes.js";
import { registerDriverFinanceDeductionRoutes } from "./driver-finance/deductions.routes.js";
import { registerCashAdvanceRequestRoutes } from "./driver-finance/cash-advance-requests.routes.js";
import { registerOwnerApprovalPortalRoutes } from "./driver-finance/owner-approval.routes.js";
import { registerAbandonmentRoutes } from "./driver-finance/abandonment.routes.js";
import { registerSettlementsDisputesRoutes } from "./settlements/disputes/disputes.routes.js";
import { registerHomeRoutes } from "./home/home.routes.js";
import { registerReportsRoutes } from "./reports/index.js";
import { registerReportCategoryCatalogRoutes } from "./reports/categories/routes.js";
import { registerReportsScheduledCrudRoutes } from "./reports/scheduled-reports.routes.js";
import { registerCustomReportBuilderRoutes } from "./reports/custom-report-builder.routes.js";
import { initializeReportsRoleScheduler, stopReportsRoleScheduler } from "./reports/scheduler.js";
import { registerIftaQuarterlyPreparerRoutes } from "./ifta/ifta-quarterly-preparer.routes.js";
import { registerFleetTrailerRoutes } from "./fleet/index.js";
import { registerFuelPlannerRoutes } from "./fuel/planner.routes.js";
import { registerFuelLovesUploadRoutes } from "./fuel/loves-upload.routes.js";
import { registerSafetyRoutes } from "./safety/safety.routes.js";
import { registerSafetyAudit425cRoutes } from "./safety/audit-425c.routes.js";
import { registerSafetyBackgroundChecksRoutes } from "./safety/background-checks.routes.js";
import { registerDriverSchedulerRoutes } from "./safety/driver-scheduler.routes.js";
import { registerSafetyDriverDocumentsRoutes } from "./safety/driver-documents.routes.js";
import { registerSafetyDriverProfileRoutes } from "./safety/driver-profile.routes.js";
import { registerSafetyFinesRoutes } from "./safety/fines.routes.js";
import { registerSafetyCompanyViolationsRoutes } from "./safety/company-violations.routes.js";
import { registerSafetyV5Routes } from "./safety/safety-v5.routes.js";
import { registerDriverScoringRoutes } from "./safety/driver-scoring.routes.js";
import { registerFuelGpsMatchRoutes } from "./safety/fuel-gps-match.routes.js";
import { registerGeofenceBreachRoutes } from "./safety/geofence-breach.routes.js";
import { registerDotInspectionEventsRoutes } from "./safety/dot-inspection-events.routes.js";
import { registerSafetyFoundationKpiRoutes } from "./safety/foundation-kpis.routes.js";
import { registerSafetyEventsRoutes } from "./safety/events/safety-events.routes.js";
import { registerSafetyDriverQualificationRoutes } from "./safety/driver-qualification.routes.js";
import { registerSafetyHosRoutes } from "./safety/hos.routes.js";
import { registerSafetyHosViolationsRoutes } from "./routes/safety/hos-violations.js";
import { registerSafetyIntegrityAlertsRoutes } from "./safety/integrity-alerts.routes.js";
import { registerSafetyDotInspectionsRoutes } from "./routes/safety/dot-inspections.js";
import { registerSafetyCsaScoresRoutes } from "./routes/safety/csa-scores.js";
import { registerSafetyComplaintsRoutes } from "./routes/safety/complaints.js";
import { registerSafetyIntegrityRoutes } from "./routes/safety/integrity.js";
import { registerSafetyMedicalCardsRoutes } from "./safety/medical-cards.routes.js";
import { registerSafetyRemindersRoutes } from "./safety/reminders.routes.js";
import { registerSafetyReportsRoutes } from "./safety/reports/safety-reports.routes.js";
import { registerSafetyDrugProgramRoutes } from "./safety/drug-program.routes.js";
import { registerDrugAlcoholProgramRoutes } from "./safety/drug-alcohol/routes.js";
import { registerCertExpiryTrackingRoutes } from "./safety/expiry-tracking/routes.js";
import { registerFeatureFlagRoutes } from "./lib/feature-flags/routes.js";
import { registerEldAuditTrailRoutes } from "./safety/eld-audit-trail/routes.js";
import { registerSafetyRtdRoutes } from "./safety/rtd.routes.js";
import { registerSafetySettingsRoutes } from "./safety/settings.routes.js";
import { registerSafetyTrainingProgramsRoutes } from "./safety/training-programs.routes.js";
import { registerSafetyTrainingRecordsRoutes } from "./safety/training-records.routes.js";
import { registerSafetyDvirRoutes } from "./safety/dvir.routes.js";
import { registerSafetyIncidentsRoutes } from "./safety/incidents.routes.js";
import { registerDamageContinuityRoutes } from "./safety/damage-continuity/continuity.routes.js";
import { registerDamagePhotoEvidenceRoutes } from "./safety/damage-reports/photo-evidence.routes.js";
import { registerSafetyPermitsRoutes } from "./safety/permits.routes.js";
import { registerSafetyOnboardingRoutes } from "./safety/onboarding.routes.js";
import { registerOnboardingStateRoutes } from "./onboarding/state.routes.js";
import { registerLiabilitiesRoutes } from "./liabilities/liabilities.routes.js";
import { registerBankTxCategorizationRoutes } from "./banking/categorization.routes.js";
import { registerBankingRoutes } from "./banking/banking.routes.js";
import { registerAccountBalanceRoutes } from "./banking/account-balance.routes.js";
import { registerPlaidLinkRoutes } from "./integrations/plaid/link.routes.js";
import { registerPlaidAdminRoutes } from "./integrations/plaid/admin.routes.js";
import { registerPlaidWebhookRoutes } from "./integrations/plaid/webhook.routes.js";
import { registerBankingPlaidWebhookRoutes } from "./banking/plaid/webhook.routes.js";
import { registerBankingTransfersRoutes } from "./banking/transfers.routes.js";
import { registerCcPaymentRoutes } from "./bill-payments/cc-payment.routes.js";
import { registerBankingManualJeRoutes } from "./banking/manual-je.routes.js";
import { registerBankingFactoringVirtualRoutes } from "./banking/factoring-virtual.routes.js";
import { registerBankingEscrowVisualizerRoutes } from "./banking/escrow-visualizer.routes.js";
import { registerBankingReconciliationRoutes } from "./banking/reconciliation.routes.js";
import { registerBankingP7Wave2Routes } from "./banking/p7-wave2.routes.js";
import { registerBankingObligationReconcileRoutes } from "./banking/obligation-reconcile.routes.js";
import { registerFactoringRoutes } from "./factoring/factoring.routes.js";
import { registerFactoringBatchRoutes } from "./factoring/batch.routes.js";
import { registerFactorRoutes } from "./factoring/factor.routes.js";
import { registerReserveRoutes } from "./factoring/reserve.routes.js";
import { registerFaroCsvImportRoutes } from "./factoring/faro-csv-import.routes.js";
import { registerScanDuplicateVendorRoutes } from "./factoring/scan-duplicate-vendors.routes.js";
import { registerCashAdvancesRoutes } from "./cash-advances/cash-advances.routes.js";
import { registerMaintenanceWorkOrderRoutes } from "./maintenance/work-orders.routes.js";
import { registerWorkOrdersV1Routes } from "./work-orders/work-orders.routes.js";
import { registerMaintenanceDashboardRoutes } from "./maintenance/dashboard.routes.js";
import { registerMaintenanceDashboardKpisRoutes } from "./maintenance/dashboard-kpis.routes.js";
import { registerMaintenancePmAlertsRoutes } from "./maintenance/pm-alerts.routes.js";
import { registerMaintenanceTriageRoutes } from "./maintenance/triage.routes.js";
import { registerMaintenanceArrivingSoonRoutes } from "./maintenance/arriving-soon.routes.js";
import { registerMaintenanceDriverReportsRoutes } from "./maintenance/driver-reports.routes.js";
import { registerMaintenanceLaborRoutes } from "./maintenance/labor.routes.js";
import { registerWoTimeEntriesRoutes } from "./maintenance/time-entries.routes.js";
import { registerMaintenancePartsInventoryRoutes } from "./maintenance/parts-inventory.routes.js";
import { registerMaintenancePartsInvoiceLinksRoutes } from "./maintenance/parts-invoice-links.routes.js";
import { registerMaintenanceSevereRepairEstimateRoutes } from "./maintenance/severe-repair-estimate.routes.js";
import { registerMaintenanceIntegrityRoutes } from "./maintenance/integrity.routes.js";
import { registerWoCostContextRoutes } from "./maintenance/wo-cost-context.routes.js";
import { registerMaintenancePmScheduleRoutes } from "./maintenance/pm-schedule.routes.js";
import { registerMaintenanceInspectionsRoutes } from "./maintenance/inspections.routes.js";
import { registerMaintenanceTiresRoutes } from "./maintenance/tires.routes.js";
import { registerMaintenanceWarrantyRoutes } from "./maintenance/warranty.routes.js";
import { registerMaintenanceReeferHoursRoutes } from "./maintenance/reefer-hours.routes.js";
import { registerMaintenanceVendorsRoutes } from "./maintenance/vendors.routes.js";
import { registerMaintenanceReportsRoutes } from "./maintenance/reports.routes.js";
import { registerMaintenanceComplianceRoutes } from "./maintenance/compliance.routes.js";
import { registerMaintenanceVehiclesRoutes } from "./maintenance/vehicles.routes.js";
import { registerMaintenanceDriversRoutes } from "./maintenance/drivers.routes.js";
import { registerMaintenancePartsRoutes } from "./maintenance/parts.routes.js";
import { registerMaintenanceDefectsRoutes } from "./maintenance/defects.routes.js";
import { registerMaintenancePmAutoEngineRoutes } from "./maintenance/pm-auto-engine.service.js";
import { registerMaintenanceServiceTimelineRoutes } from "./maintenance/service-timeline.service.js";
import { registerMaintenanceKpiRoutes } from "./maintenance/kpi.routes.js";
import { initializePmAutoEngineCron } from "./maintenance/pm-auto-engine.cron.js";
import { registerMaintPartsRoutes } from "./maint/parts.routes.js";
import { registerMaintPmRoutes } from "./maint/pm.routes.js";
import { registerMaintWoApRoutes } from "./maint/wo-ap.routes.js";
import { registerInsuranceCoiRequestRoutes } from "./insurance/coi-request.routes.js";
import { registerInsuranceClaimRoutes } from "./insurance/claim.routes.js";
import { registerInsuranceDispersalRoutes } from "./insurance/dispersal.routes.js";
import { registerInsuranceLawsuitRoutes } from "./insurance/lawsuit.routes.js";
import { initializeInsurancePaymentReminderCron } from "./insurance/payment-reminder.service.js";
import { registerInsurancePaymentScheduleRoutes } from "./insurance/payment-schedule.routes.js";
import { registerInsurancePolicyRoutes } from "./insurance/policy.routes.js";
import { registerInsuranceTypeCatalogRoutes } from "./insurance/type-catalog.routes.js";
import { registerAuditRoutes } from "./audit/audit.routes.js";
import { registerDriverAuditEventsRoutes } from "./audit/driver-events.routes.js";
import { registerDriverMetricsRoutes } from "./integrity/driver-metrics.routes.js";
import { registerAnomalyStatusRoutes } from "./integrity/anomaly-status.routes.js";
import { runAnomalyDetectionForTenant } from "./integrity/anomaly-detector.service.js";
import { registerForm425CRoutes } from "./compliance/form-425c.routes.js";
import { registerListsHubRoutes } from "./lists/lists-hub.routes.js";
import { registerListsCountsRoutes } from "./lists/lists-counts.routes.js";
import { registerDriverCatalogDeprecatedRoutes } from "./lists/driver-catalogs.routes.js";
import { registerNamesMasterRoutes } from "./lists/names-master.routes.js";
import { registerDriversReferenceRoutes } from "./lists/drivers-reference.routes.js";
import { registerOemPartsRoutes } from "./lists/oem-parts.routes.js";
import { registerAssetsRoutes } from "./assets/assets.routes.js";
import { registerDriverProfileRoutes } from "./mdata/driver-profile.routes.js";
import { registerDriverReturningDetectionRoutes } from "./mdata/driver-returning-detection.routes.js";
import { registerDriverSafetyEventsRoutes } from "./mdata/driver-safety-events.routes.js";
import { registerDispatcherSafetyEventsRoutes } from "./mdata/dispatcher-safety-events.routes.js";
import { registerCustomerContactRoutes } from "./mdata/customer-contacts.routes.js";
import { registerCustomerQualityEventsRoutes } from "./mdata/customer-quality-events.routes.js";
import { registerCustomerBillingRoutes } from "./mdata/customer-billing.routes.js";
import { registerCustomerLanesRoutes } from "./mdata/customer-lanes.routes.js";
import { registerCustomerDetailAliasRoutes } from "./mdata/customer-detail-alias.routes.js";
import { registerCustomerRoutes } from "./customers/index.js";
import { registerAssignmentsQuicksaveRoutes } from "./assignments/quicksave.routes.js";
import { registerMdataRoutes } from "./mdata/index.js";
import { registerQboAutocompleteRoutes } from "./mdata/qbo-autocomplete.routes.js";
import { registerQboMasterWriteRoutes } from "./mdata/qbo-master-write.routes.js";
import { registerDriverTeamsAliasRoutes } from "./mdata/driver-teams-alias.routes.js";
import { registerMdataWorkflowRoutes } from "./mdata/workflow-routes.js";
import { registerUnitPermitsRoutes } from "./master-data/units/permits/routes.js";
import { registerUnitTollTagsRoutes } from "./master-data/units/toll-tags/routes.js";
import { initializeAccountingCrons, registerAccountingRoutes } from "./accounting/index.js";
import { registerApPaymentApplicationRoutes } from "./ap/payment-application.routes.js";
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
import { initializeSamsaraMasterSyncCron } from "./cron/samsara-master-sync.cron.js";
import { initializeSamsaraPositionsCron } from "./cron/samsara-positions-cron.js";
import { initializeFuelGpsMatchCron } from "./cron/fuel-gps-match.cron.js";
import { initializeGeofenceBreachDetectorCron } from "./cron/geofence-breach-detector.cron.js";
import { initializeGeofenceStateWatcher } from "./jobs/geofence-state-watcher.js";
import { initializeLegalMattersReminderCron } from "./legal/matters-reminder.cron.js";
import { initializeSafetyRemindersCron } from "./safety/reminders.cron.js";
import { initializeIntegrityAlertEngineCron } from "./safety/integrity-alert-engine.cron.js";
import { initializeMasterDataSyncCron } from "./qbo/master-data-sync.cron.js";
import { registerMasterDataSyncRoutes } from "./qbo/master-data-sync.routes.js";
import { registerChartOfAccountsSyncRoutes } from "./qbo-sync/chart-of-accounts.routes.js";
import { registerItemsSyncRoutes } from "./qbo-sync/items.routes.js";
import { registerCustomersSyncRoutes } from "./qbo-sync/customers.routes.js";
import { registerVendorsSyncRoutes } from "./qbo-sync/vendors.routes.js";
import { registerQboSyncDriftDashboardRoutes } from "./qbo-sync/drift-dashboard.routes.js";
import { initializeQboSyncDriftScheduler } from "./qbo-sync/sync-scheduler.js";
import { registerAccountingCatalogLookupRoutes } from "./accounting/items.routes.js";
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
import { registerQboCustomersPushStatusRoutes } from "./sync/qbo-customers-status.routes.js";
import { initializeQboCustomersPushScheduler, stopQboCustomersPushScheduler } from "./sync/qbo-customers-push.js";
import { registerQboVendorsPushStatusRoutes } from "./sync/qbo-vendors-status.routes.js";
import { initializeQboVendorsPushScheduler, stopQboVendorsPushScheduler } from "./sync/qbo-vendors-push.js";
import { registerQboAccountsPushStatusRoutes } from "./sync/qbo-accounts-status.routes.js";
import { initializeQboAccountsPushScheduler, stopQboAccountsPushScheduler } from "./sync/qbo-accounts-push.js";
import { registerLovesSyncStatusRoutes } from "./sync/loves-status.routes.js";
import { initializeLovesCardImportCron } from "./cron/loves-card-import.cron.js";
import { initializePlaidDailySyncCron } from "./cron/plaid-daily-sync.js";
import { initializePlaidDailyRefreshCron } from "./integrations/plaid/daily-refresh.cron.js";
import { initializeDriverSettlementAutoPayCron } from "./driver-finance/auto-pay.cron.js";
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
import { pool, withLuciaBypass } from "./auth/db.js";
import { registerUrlCanonicalizeMiddleware } from "./middleware/url-canonicalize.js";
import { registerRequestIdMiddleware } from "./middleware/request-id.js";
import { registerSecurityHeaders } from "./middleware/security-headers.js";
import { registerIdempotencyMiddleware } from "./middleware/idempotency.js";
import { initializeIdempotencyCleanupCron } from "./middleware/idempotency-cleanup.cron.js";
import { registerMigrationStatusRoutes } from "./admin/migration-status.routes.js";
import { registerAdminObservabilityRoutes } from "./admin/observability.routes.js";
import { registerHomeWidgetRoutes } from "./home/home-widgets.routes.js";
import { registerOwnerTodaysAttentionRoutes } from "./owner/todays-attention/routes.js";
import { registerAccountingRoleHomeRoutes } from "./accounting/role-home/routes.js";
import { registerSafetyOfficerRoleHomeRoutes } from "./safety-officer/role-views/routes.js";
import { registerDriverManagerRoleHomeRoutes } from "./driver-manager/role-views/routes.js";
import { registerDispatchViewRoutes } from "./dispatch/driver-pwa/dispatch-view.routes.js";
import { initializeTodaysAttentionWorker, stopTodaysAttentionWorker } from "./jobs/todays-attention-worker.js";
import {
  initializeLateArrivalAggregatorWorker,
  stopLateArrivalAggregatorWorker,
} from "./jobs/late-arrival-aggregator-worker.js";
import { registerPlaidBankingItemsRoutes } from "./banking/plaid-items.routes.js";
import { registerWeeklyCloseRoutes } from "./driver-finance/weekly-close.routes.js";
import { registerErrorMonitorRoutes } from "./admin/error-monitor.routes.js";
import { initializeErrorDigestCron } from "./cron/error-digest.cron.js";
import { registerDailyTasksRoutes } from "./daily-tasks/daily-tasks.routes.js";
import { initializeDailyTaskAlertsCron, stopDailyTaskAlertsCron } from "./cron/daily-task-alerts.cron.js";
import { initializeAdminJobsWorker, stopAdminJobsWorker } from "./admin/admin-jobs.service.js";
import { initializeDaRandomPoolDrawWorker } from "./jobs/da-random-pool-draw-worker.js";
import { initializeCertExpiryMonitor } from "./jobs/cert-expiry-monitor.js";
import { initializeDamageContinuityWorker } from "./jobs/damage-continuity-worker.js";
import { initializeSamsaraCacheWarmer } from "./integrations/samsara/cache/cache-warmer.js";
import { initializeSearchIndexerIncremental } from "./jobs/search-indexer-incremental.js";
import { registerUniversalSearchRoutes } from "./search/universal/routes.js";
import { runStartupMigrationDriftGuard } from "./db/startup-migration-drift-guard.js";
import { registerTelematicsHosRoutes } from "./telematics/hos.routes.js";
import { registerVehicleDriverPairingRoutes } from "./telematics/vehicle-driver-pairing.routes.js";
import { registerPayrollDriverSettlementRoutes } from "./payroll/driver-settlement.routes.js";
import { registerPayrollAggregatedRoutes } from "./payroll/aggregated.routes.js";
import { applyEnvStartupChecks, isFeatureDisabled, setDisabledFeatures } from "./config/required-env.js";

type CorsOriginValue = string | boolean | RegExp | Array<string | boolean | RegExp>;

const repoRoot = resolveMonorepoRoot(import.meta.url);

const app = Fastify({ logger: true });
attachHttpErrorMonitor(app);
let shuttingDown = false;

function getAllowedOrigins(): string[] {
  const origins =
    process.env.CORS_ALLOWED_ORIGINS ??
    "https://app.ih35dispatch.com,https://ih35-tms-web.onrender.com,https://ih35-tms-driver.onrender.com,http://localhost:5173,http://localhost:5174";
  return origins
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

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
    stopQboCustomersPushScheduler();
    stopQboVendorsPushScheduler();
    stopQboAccountsPushScheduler();
    stopQboInboundSyncCron();
    stopDailyTaskAlertsCron();
    stopTodaysAttentionWorker();
    stopLateArrivalAggregatorWorker();
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
  const envCheck = applyEnvStartupChecks(app.log);
  setDisabledFeatures(envCheck.disabled_features);
  if (envCheck.hard_fail_messages.length > 0) {
    throw new Error(`required_env_missing:\n${envCheck.hard_fail_messages.join("\n")}`);
  }

  if (!app.hasDecorator("forensicRunnerStatus")) {
    app.decorate("forensicRunnerStatus", "pending");
  }

  registerSentryFastifyErrorHandler(app);
  await registerRequestIdMiddleware(app);
  await registerUrlCanonicalizeMiddleware(app);
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
  setAppReady(true);

  await registerSecurityHeaders(app);
  await registerIdempotencyMiddleware(app);
  await app.register(cors, {
    origin: (origin: string | undefined, cb: (err: Error | null, allow: CorsOriginValue) => void) => {
      if (!origin) return cb(null, true);
      if (getAllowedOrigins().includes(origin)) return cb(null, true);
      return cb(new Error("CORS: origin not allowed"), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
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
  await registerTrkMigrationRoutes(app);
  await registerMasterDataSyncRoutes(app);
  await registerChartOfAccountsSyncRoutes(app);
  await registerItemsSyncRoutes(app);
  await registerCustomersSyncRoutes(app);
  await registerVendorsSyncRoutes(app);
  await registerQboSyncDriftDashboardRoutes(app);
  await registerAccountingCatalogLookupRoutes(app);
  await registerQboSyncAlertsRoutes(app);
  await registerQboSyncRunsListRoutes(app);
  await registerQboSyncConflictDetectionRoutes(app);
  await registerQboSyncActionsRoutes(app);
  await registerQboUnlinkedEntitiesRoutes(app);
  await registerQboBulkLinkRoutes(app);
  await registerQboSyncHealthRoutes(app);
  await registerQboCustomersPushStatusRoutes(app);
  await registerQboVendorsPushStatusRoutes(app);
  await registerQboAccountsPushStatusRoutes(app);
  await registerLovesSyncStatusRoutes(app);
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
  await registerAdminObservabilityRoutes(app);
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
  await registerIdentityApplicantRoutes(app);
  await registerMdataRoutes(app);
  await registerUnitPermitsRoutes(app);
  await registerUnitTollTagsRoutes(app);
  await registerAssignmentsQuicksaveRoutes(app);
  await registerFleetTrailerRoutes(app);
  await registerAssetsRoutes(app);
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
  await registerCustomerRoutes(app);
  await registerMdataWorkflowRoutes(app);
  await registerDriverTeamsAliasRoutes(app);
  await registerCatalogsRoutes(app);
  await registerDriverCatalogRoutes(app);
  await registerDriverCatalogDeprecatedRoutes(app);
  await registerFuelCatalogRoutes(app);
  await registerFleetCatalogRoutes(app);
  await registerGenericCatalogRoutes(app);
  await registerStubCatalogPurgeRoutes(app);
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
  await registerDocsFoundationRoutes(app);
  await registerDocsFilesRoutes(app);
  await registerAttachmentsRoutes(app);
  await registerDispatchLoadRoutes(app);
  await registerLoadsBulkRoutes(app);
  await registerDispatchCancelLoadRoutes(app);
  await registerDispatchSheetHtmlRoutes(app);
  await registerDispatchLoadAssignRoutes(app);
  await registerDispatchQuicksaveRoutes(app);
  await registerDispatchAssignmentsQuicksaveRoutes(app);
  await registerDispatchCancellationRoutes(app);
  await registerDispatchRefinementsRoutes(app);
  await registerIntransitIssuesRoutes(app);
  await registerDispatchArchTabsRoutes(app);
  await registerDispatchAlertsRoutes(app);
  await registerLateArrivalAnalyticsRoutes(app);
  await registerDispatchPlannerRoutes(app);
  await registerDispatchDetentionRoutes(app);
  await registerDispatchOcrIntakeRoutes(app);
  await registerDispatchCustomerNotifyRoutes(app);
  await registerDispatchPodBolRoutes(app);
  await registerPreDispatchValidationRoutes(app);
  await registerDispatcherRoleViewRoutes(app);
  await registerDriverRoutes(app);
  await registerDriversMessagesRoutes(app);
  await registerDriversDocumentAlertsRoutes(app);
  await registerGeofencesRoutes(app);
  await registerGeofenceStateMachineRoutes(app);
  await registerDriverDaySummaryRoutes(app);
  await registerTelematicsHeatmapRoutes(app);
  await registerDashcamOnDemandRoutes(app);
  await registerTelematicsPositionsRoutes(app);
  await registerDriverFinanceSettlementRoutes(app);
  await registerWeeklyCloseRoutes(app);
  await registerSettlementsDisputesRoutes(app);
  await registerDriverFinanceSettlementHtmlRoutes(app);
  await registerDriverFinanceDriverBillsRoutes(app);
  await registerDriverFinanceDebtRoutes(app);
  await registerDriverFinanceDeductionRoutes(app);
  await registerOwnerApprovalPortalRoutes(app);
  await registerCashAdvanceRequestRoutes(app);
  await registerAbandonmentRoutes(app);
  await registerHomeRoutes(app);
  await registerHomeWidgetRoutes(app);
  await registerOwnerTodaysAttentionRoutes(app);
  await registerAccountingRoleHomeRoutes(app);
  await registerSafetyOfficerRoleHomeRoutes(app);
  await registerDriverManagerRoleHomeRoutes(app);
  await registerDispatchViewRoutes(app);
  await registerReportsRoutes(app);
  await registerReportCategoryCatalogRoutes(app);
  await registerReportsScheduledCrudRoutes(app);
  await registerCustomReportBuilderRoutes(app);
  await registerIftaQuarterlyPreparerRoutes(app);
  await registerFuelPlannerRoutes(app);
  await registerFuelLovesUploadRoutes(app);
  await registerSafetyRoutes(app);
  await registerSafetyAudit425cRoutes(app);
  await registerSafetyBackgroundChecksRoutes(app);
  await registerDriverSchedulerRoutes(app);
  await registerSafetyDriverDocumentsRoutes(app);
  await registerSafetyDriverProfileRoutes(app);
  await registerSafetyFinesRoutes(app);
  await registerSafetyCompanyViolationsRoutes(app);
  await registerSafetyV5Routes(app);
  await registerDriverScoringRoutes(app);
  await registerFuelGpsMatchRoutes(app);
  await registerGeofenceBreachRoutes(app);
  await registerDotInspectionEventsRoutes(app);
  await registerSafetyFoundationKpiRoutes(app);
  await registerSafetyEventsRoutes(app);
  await registerSafetyDriverQualificationRoutes(app);
  await registerSafetyHosRoutes(app);
  await registerSafetyHosViolationsRoutes(app);
  await registerSafetyDotInspectionsRoutes(app);
  await registerSafetyCsaScoresRoutes(app);
  await registerSafetyComplaintsRoutes(app);
  await registerSafetyIntegrityRoutes(app);
  await registerSafetyIntegrityAlertsRoutes(app);
  await registerSafetyMedicalCardsRoutes(app);
  await registerSafetyRemindersRoutes(app);
  await registerSafetyReportsRoutes(app);
  await registerSafetyDrugProgramRoutes(app);
  await registerDrugAlcoholProgramRoutes(app);
  await registerCertExpiryTrackingRoutes(app);
  await registerFeatureFlagRoutes(app);
  await registerUniversalSearchRoutes(app);
  await registerEldAuditTrailRoutes(app);
  await registerSafetyRtdRoutes(app);
  await registerSafetySettingsRoutes(app);
  await registerSafetyTrainingProgramsRoutes(app);
  await registerSafetyTrainingRecordsRoutes(app);
  await registerSafetyDvirRoutes(app);
  await registerSafetyIncidentsRoutes(app);
  await registerDamageContinuityRoutes(app);
  await registerDamagePhotoEvidenceRoutes(app);
  await registerSafetyPermitsRoutes(app);
  await registerSafetyOnboardingRoutes(app);
  await registerOnboardingStateRoutes(app);
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
  await registerCcPaymentRoutes(app);
  await registerBankingManualJeRoutes(app);
  await registerBankingFactoringVirtualRoutes(app);
  await registerBankingEscrowVisualizerRoutes(app);
  await registerBankingReconciliationRoutes(app);
  await registerBankingP7Wave2Routes(app);
  await registerBankingObligationReconcileRoutes(app);
  await registerFactoringRoutes(app);
  await registerFactoringBatchRoutes(app);
  await registerFactorRoutes(app);
  await registerReserveRoutes(app);
  await registerFaroCsvImportRoutes(app);
  await registerScanDuplicateVendorRoutes(app);
  await registerDataInfrastructureRoutes(app);
  await registerOcrRoutes(app);
  await registerMaintenanceWorkOrderRoutes(app);
  await registerWorkOrdersV1Routes(app);
  await registerMaintenanceLaborRoutes(app);
  await registerWoTimeEntriesRoutes(app);
  await registerMaintenanceDriverReportsRoutes(app);
  await registerMaintenanceDashboardKpisRoutes(app);
  await registerMaintenanceDashboardRoutes(app);
  await registerMaintenancePmAlertsRoutes(app);
  await registerMaintenanceTriageRoutes(app);
  await registerMaintenanceArrivingSoonRoutes(app);
  await registerMaintenancePartsInventoryRoutes(app);
  await registerMaintenancePartsInvoiceLinksRoutes(app);
  await registerMaintenanceSevereRepairEstimateRoutes(app);
  await registerMaintenanceIntegrityRoutes(app);
  await registerWoCostContextRoutes(app);
  await registerMaintenancePmScheduleRoutes(app);
  await registerMaintenanceInspectionsRoutes(app);
  await registerMaintenanceTiresRoutes(app);
  await registerMaintenanceWarrantyRoutes(app);
  await registerMaintenanceReeferHoursRoutes(app);
  await registerMaintenanceVendorsRoutes(app);
  await registerMaintenanceReportsRoutes(app);
  await registerMaintenanceComplianceRoutes(app);
  await registerMaintenanceVehiclesRoutes(app);
  await registerMaintenanceDriversRoutes(app);
  await registerMaintenancePartsRoutes(app);
  await registerMaintenanceDefectsRoutes(app);
  await registerMaintenancePmAutoEngineRoutes(app);
  await registerMaintenanceServiceTimelineRoutes(app);
  await registerMaintenanceKpiRoutes(app);
  await registerMaintPartsRoutes(app);
  await registerInsurancePolicyRoutes(app);
  await registerInsuranceClaimRoutes(app);
  await registerInsuranceLawsuitRoutes(app);
  await registerInsurancePaymentScheduleRoutes(app);
  await registerInsuranceDispersalRoutes(app);
  await registerInsuranceCoiRequestRoutes(app);
  await registerInsuranceTypeCatalogRoutes(app);
  await registerAuditRoutes(app);
  await registerDriverAuditEventsRoutes(app);
  await registerDriverMetricsRoutes(app);
  await registerAnomalyStatusRoutes(app);
  await registerMaintPmRoutes(app);
  await registerMaintWoApRoutes(app);
  await registerForm425CRoutes(app);
  await registerListsHubRoutes(app);
  await registerListsCountsRoutes(app);
  await registerDriversReferenceRoutes(app);
  await registerOemPartsRoutes(app);
  await registerNamesMasterRoutes(app);
  await registerAccountingRoutes(app);
  await registerApPaymentApplicationRoutes(app);
  await registerCompanyRoutes(app);
  await registerLegalTemplateRoutes(app);
  await registerLegalContractRoutes(app);
  await registerLegalSignRoutes(app);
  await registerLegalAttorneyReviewRoutes(app);
  await registerLegalMattersRoutes(app);
  await registerDailyTasksRoutes(app);
  await registerTelematicsHosRoutes(app);
  await registerVehicleDriverPairingRoutes(app);
  await registerPayrollDriverSettlementRoutes(app);
  await registerPayrollAggregatedRoutes(app);

  try {
    initializeAccountingCrons(app);
    app.log.info("[STARTUP] accounting cron suite initialized");
  } catch (error) {
    app.log.error({ err: error }, "[STARTUP] accounting cron suite failed");
  }

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
    initializeSamsaraPositionsCron(app);
    app.log.info("[STARTUP] samsara-positions-cron initialized");
  } catch (error) {
    app.log.error({ err: error }, "[STARTUP] samsara-positions-cron failed");
  }

  try {
    if (isFeatureDisabled("samsara_master_sync")) {
      app.log.warn("[STARTUP] samsara-master-sync-cron disabled by required env checks");
    } else {
      initializeSamsaraMasterSyncCron(app);
      app.log.info("[STARTUP] samsara-master-sync-cron initialized");
    }
  } catch (error) {
    app.log.error({ err: error }, "[STARTUP] samsara-master-sync-cron failed");
  }

  try {
    initializeFuelGpsMatchCron(app);
    app.log.info("[STARTUP] fuel-gps-match-cron initialized");
  } catch (error) {
    app.log.error({ err: error }, "[STARTUP] fuel-gps-match-cron failed");
  }

  try {
    initializeLovesCardImportCron(app);
    app.log.info("[STARTUP] loves-card-import-cron initialized");
  } catch (error) {
    app.log.error({ err: error }, "[STARTUP] loves-card-import-cron failed");
  }

  try {
    initializePlaidDailySyncCron(app);
    initializePlaidDailyRefreshCron(app);
    app.log.info("[STARTUP] plaid-daily-sync-cron initialized");
  } catch (error) {
    app.log.error({ err: error }, "[STARTUP] plaid-daily-sync-cron failed");
  }

  try {
    initializeDriverSettlementAutoPayCron(app);
    app.log.info("[STARTUP] driver-settlement-auto-pay-cron initialized");
  } catch (error) {
    app.log.error({ err: error }, "[STARTUP] driver-settlement-auto-pay-cron failed");
  }

  try {
    initializeGeofenceBreachDetectorCron(app);

    initializeGeofenceStateWatcher(app);
    app.log.info("[STARTUP] geofence-state-watcher initialized");
    app.log.info("[STARTUP] geofence-breach-cron initialized");
  } catch (error) {
    app.log.error({ err: error }, "[STARTUP] geofence-breach-cron failed");
  }

  try {
    cron.schedule(
      "*/30 * * * *",
      async () => {
        await withLuciaBypass(async (client) => {
          const companies = await client.query<{ id: string }>(
            `SELECT id::text AS id FROM org.companies WHERE is_active = true AND deactivated_at IS NULL ORDER BY id`
          );
          for (const company of companies.rows) {
            await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [company.id]);
            const result = await runAnomalyDetectionForTenant(client, company.id);
            app.log.info(
              { operating_company_id: company.id, scanned: result.scanned, inserted: result.inserted },
              "[STARTUP] anomaly detector run complete"
            );
          }
        });
      },
      { timezone: "America/Chicago" }
    );
    app.log.info("[STARTUP] anomaly-detector-cron initialized");
  } catch (error) {
    app.log.error({ err: error }, "[STARTUP] anomaly-detector-cron failed");
  }

  try {
    initializeLegalMattersReminderCron(app);
    app.log.info("[STARTUP] legal-matters-reminder-cron initialized");
  } catch (error) {
    app.log.error({ err: error }, "[STARTUP] legal-matters-reminder-cron failed");
  }

  try {
    initializeInsurancePaymentReminderCron(app);
    app.log.info("[STARTUP] insurance-payment-reminder-cron initialized");
  } catch (error) {
    app.log.error({ err: error }, "[STARTUP] insurance-payment-reminder-cron failed");
  }

  try {
    initializeSafetyRemindersCron(app);
    app.log.info("[STARTUP] safety-reminders-cron initialized");

    initializeIntegrityAlertEngineCron(app);
    app.log.info("[STARTUP] integrity-alert-engine-cron initialized");

    initializeDocumentAlertEngineCron(app);
    app.log.info("[STARTUP] document-alert-engine-cron initialized");

    initializeDaRandomPoolDrawWorker(app);
    app.log.info("[STARTUP] da-random-pool-draw-worker initialized");

    initializeCertExpiryMonitor(app);
    initializeDamageContinuityWorker(app);
    app.log.info("[STARTUP] damage-continuity-worker initialized");
    initializeSamsaraCacheWarmer(app);
    app.log.info("[STARTUP] samsara-cache-warmer initialized");
    initializeSearchIndexerIncremental(app);
    app.log.info("[STARTUP] cert-expiry-monitor initialized");

    initializePmAutoEngineCron(app);
    app.log.info("[STARTUP] pm-auto-engine-cron initialized");
  } catch (error) {
    app.log.error({ err: error }, "[STARTUP] safety-reminders-cron failed");
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
    initializeQboSyncDriftScheduler(app);
    app.log.info("[STARTUP] qbo-sync-drift-scheduler initialized");
  } catch (error) {
    app.log.error({ err: error }, "[STARTUP] qbo-sync-drift-scheduler failed");
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
    initializeReportsRoleScheduler(app);
    app.log.info("[STARTUP] reports-role-scheduler initialized");
  } catch (error) {
    app.log.error({ err: error }, "[STARTUP] reports-role-scheduler failed");
  }

  try {
    initializeErrorDigestCron(app);
    app.log.info("[STARTUP] error-digest scheduler initialized");
  } catch (error) {
    app.log.error({ err: error }, "[STARTUP] error-digest scheduler failed");
  }

  try {
    initializeIdempotencyCleanupCron(app);
    app.log.info("[STARTUP] idempotency-cleanup cron initialized");
  } catch (error) {
    app.log.error({ err: error }, "[STARTUP] idempotency-cleanup cron failed");
  }

  try {
    initializeDailyTaskAlertsCron(app);
    app.log.info("[STARTUP] daily-task-alerts cron initialized");
    initializeTodaysAttentionWorker(app);
    app.log.info("[STARTUP] todays-attention worker initialized");
    initializeLateArrivalAggregatorWorker(app);
    app.log.info("[STARTUP] late-arrival aggregator worker initialized");
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
    initializeQboCustomersPushScheduler(app);
    app.log.info("[STARTUP] qbo-customers-push scheduler initialized");
  } catch (error) {
    app.log.error({ err: error }, "[STARTUP] qbo-customers-push scheduler failed");
  }

  try {
    initializeQboVendorsPushScheduler(app);
    app.log.info("[STARTUP] qbo-vendors-push scheduler initialized");
  } catch (error) {
    app.log.error({ err: error }, "[STARTUP] qbo-vendors-push scheduler failed");
  }

  try {
    initializeQboAccountsPushScheduler(app);
    app.log.info("[STARTUP] qbo-accounts-push scheduler initialized");
  } catch (error) {
    app.log.error({ err: error }, "[STARTUP] qbo-accounts-push scheduler failed");
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
