#!/usr/bin/env node
/**
 * LEAD 443.184 item 1 — GUARDS THAT NEVER RUN.
 *
 * Measured on origin/main a10f46b2d8 (every scripts/verify-*.mjs vs every CI / verify-step / gate caller): 6,266 guards
 * authored, 5,803 wired, 463 never run by CI. Each of the 463 was run once with no database: 367 PASS, 79 FAIL (static),
 * 17 need a database. The 367 GREEN ones are listed below and RUN here (this file is in scripts/verify-steps, which
 * verify:pre-commit executes in CI — so each is now wired). The RED / DB ones are posted to the Lead for their owning seat;
 * none is weakened.
 *
 *   1. Every GUARDS entry runs (8 at a time, 90 s each, with no DATABASE_URL — the condition it was measured GREEN under)
 *      and must exit 0.
 *   2. RATCHET: scripts/.guard-exempt.json (the register of guards CI does not run) only shrinks against origin/main, and
 *      no guard run here is still listed as exempt.
 * --selftest plants each regression.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const EXEMPT_REL = "scripts/.guard-exempt.json";

export const GUARDS = [
  // LEAD 443.314: step-1 wiring guard (passes on main: no added files vs origin/main).
  "verify-branch-new-guards-and-surfaces-wired.mjs",
  // LEAD 443.312 (2026-10-24): 10 guards merged 10-23/10-24 with no CI caller (guard census 10 > 8); each GREEN with no DB.
  "verify-delivered-load-has-final-departure.mjs",
  "verify-escrow-register-per-load-expansion.mjs",
  "verify-fleet-health-no-false-ok.mjs",
  "verify-hos-latest-clocks-per-driver-probe.mjs",
  "verify-live-get-routes-no-5xx.mjs",
  "verify-override-reasons-one-catalog.mjs",
  "verify-person-names-normalized-at-write.mjs",
  "verify-settlement-boundary-writers.mjs",
  "verify-settlement-finalize-assigns-source-doc-ref.mjs",
  "verify-settlement-number-assigned-at-close.mjs",
  "verify-425-s01-s02-surfaces.mjs",
  "verify-active-driver-set.mjs",
  "verify-add-training-creator-draft-lifecycle.mjs",
  "verify-add-training-program-picker.mjs",
  "verify-admin-api-webhooks-honest-disabled.mjs",
  "verify-admin-settings-notifications-chrome.mjs",
  "verify-apierror-message-reads-fielderrors.mjs",
  "verify-arrival-haversine-uses-locked-radius.mjs",
  "verify-arriving-soon-convert-atomic.mjs",
  "verify-assets-workspace-human-unit-labels.mjs",
  "verify-assign-truck-draft-lifecycle.mjs",
  "verify-assigned-safety-datepicker-label-completion.mjs",
  "verify-assignment-history-resolves-names.mjs",
  "verify-audit-coverage.mjs",
  "verify-audit-log-viewer.mjs",
  "verify-auto-status-no-direct-status-write.mjs",
  "verify-banking-home-transfers-reconcile-human-labels.mjs",
  "verify-blocker-errors-carry-message.mjs",
  "verify-border-crossing-history-errors.mjs",
  "verify-branch-fresh-wired.mjs",
  "verify-business-date-parsed-local.mjs",
  "verify-c1-3-button-targets-routed.mjs",
  "verify-cancellation-tonu-backlink-scoped-check.mjs",
  "verify-check-routes-mounted.mjs",
  "verify-claim-graph-human-labels.mjs",
  "verify-class-picker-shows-names.mjs",
  "verify-class-scoreboard-fresh.mjs",
  "verify-class-scoreboard-live-sourced.mjs",
  "verify-closure-17-on-hold-triage.mjs",
  "verify-closure-18-perf-artifacts.mjs",
  "verify-closure-19-sec-artifacts.mjs",
  "verify-closure-20-a11y-artifacts.mjs",
  "verify-closure-23-dr-artifacts.mjs",
  "verify-closure-24-onboarding-artifacts.mjs",
  "verify-collections-excludes-sample-data.mjs",
  "verify-comparison-respects-basis.mjs",
  "verify-compliance-filings-error-honesty.mjs",
  "verify-compliance-hos-tracker-shell.mjs",
  "verify-compliance-overview-error-honesty.mjs",
  "verify-create-trailer-kind-lifecycle.mjs",
  "verify-create-unit-submit-context-isolation.mjs",
  "verify-create-vocab-section7.mjs",
  "verify-cron-observability.mjs",
  "verify-cross-module-reverse-failure-exclusion.mjs",
  "verify-cross-package-imports-resolve.mjs",
  "verify-cu09-catalog-submit-error.mjs",
  "verify-cu09-create-surfaces.mjs",
  "verify-cu09-err-remainder.mjs",
  "verify-cu09-legal-maint-collections.mjs",
  "verify-cu09-ops-surfaces.mjs",
  "verify-cu09-table-error-detail.mjs",
  "verify-cu09-user-facing-api-error.mjs",
  "verify-customers-tenant-scope.mjs",
  "verify-da-active-enrollment-unique.mjs",
  "verify-damage-insurance-continuity.mjs",
  "verify-damage-photo-evidence-durable.mjs",
  "verify-datatable-page-size.mjs",
  "verify-detention-customer-deactivation-survives-lifecycle.mjs",
  "verify-detention-notify-claim-before-send.mjs",
  "verify-dhub-s02-reporting-surface.mjs",
  "verify-disp-s02-alerts-surface.mjs",
  "verify-disp-s11-chat-surface.mjs",
  "verify-disp-s26-planner-surface.mjs",
  "verify-docs-econ-link-pack.mjs",
  "verify-docs-foundation-preview-link.mjs",
  "verify-docs-preview-category-field-alias.mjs",
  "verify-docs-type-filter-substring-match.mjs",
  "verify-document-alerts-failure-exclusion.mjs",
  "verify-dot-dwell-events-range.mjs",
  "verify-dot-inspection-events-append-only.mjs",
  "verify-dot-inspection-reverse-range.mjs",
  "verify-driver-profile-tabs-stay-on-the-profile.mjs",
  "verify-driver-safety-residual-datepicker-wrappers.mjs",
  "verify-drug-alcohol-program.mjs",
  "verify-drv03-dqf-checklist-catalog-driven.mjs",
  "verify-dvir-severity-current-surfaces.mjs",
  "verify-dvir-severity-tagging.mjs",
  "verify-e10-never-posted-document-is-not-skipped.mjs",
  "verify-edi-foundation.mjs",
  "verify-edit-load-charge-replacement-checked.mjs",
  "verify-edit-trailer-equipment-type-combobox.mjs",
  "verify-edit-unit-enum-comboboxes.mjs",
  "verify-eld-read-error-suppresses-stale-rows.mjs",
  "verify-equipment-plate-update-cas.mjs",
  "verify-equipment-transfer-finalize-identities.mjs",
  "verify-exif-chain-preservation.mjs",
  "verify-export-business-date.mjs",
  "verify-fact-s01-home-surface.mjs",
  "verify-fact-s03-batches-surface.mjs",
  "verify-fact-s04-reserves-surface.mjs",
  "verify-feature-flags-read-only.mjs",
  "verify-filter-law.mjs",
  "verify-financial-reports-business-date-defaults.mjs",
  "verify-fleet-bulk-action-lifecycle.mjs",
  "verify-fleet-bulk-controls-comboboxes.mjs",
  "verify-fleet-bulk-update-all-or-nothing.mjs",
  "verify-fleet-create-drawer-discard-lifecycle.mjs",
  "verify-fleet-create-trailer-type-combobox.mjs",
  "verify-fleet-deactivate-rowcount-truth.mjs",
  "verify-fleet-edit-discard-lifecycle.mjs",
  "verify-fleet-edit-title-no-uuid-fallback.mjs",
  "verify-fleet-fault-summary-exact-counts.mjs",
  "verify-fleet-fault-summary-read-recovery.mjs",
  "verify-fleet-lifecycle-business-date.mjs",
  "verify-fleet-live-telemetry-read-recovery.mjs",
  "verify-fleet-location-hos-export-business-date.mjs",
  "verify-fleet-profile-archive-failure-lifecycle.mjs",
  "verify-fleet-table-complete-unified-roster.mjs",
  "verify-fleet-table-failure-exclusion.mjs",
  "verify-fleet-trailer-status-cas.mjs",
  "verify-fleet-transfer-ack-write-cas.mjs",
  "verify-fleet-unit-photo-gallery-complete-range.mjs",
  "verify-form2290-generate-draft-visible-errors.mjs",
  "verify-from-load-rate-resync.mjs",
  "verify-frontend-api-routes-exist.mjs",
  "verify-fuel-completion-current-route-contracts.mjs",
  "verify-fuel-create-datepicker-label-wrapper.mjs",
  "verify-fuel-fraud-alert-action-lifecycle.mjs",
  "verify-fuel-history-exact-range.mjs",
  "verify-fuel-manual-create-active-linkages.mjs",
  "verify-fuel-match-tenant-scope.mjs",
  "verify-fuel-planner-active-routes-exact-range.mjs",
  "verify-fuel-planner-settings-get-readonly.mjs",
  "verify-fuel-posting-uses-resolver.mjs",
  "verify-fuel-recommendation-queue-truth.mjs",
  "verify-fuel-recommendation-send-idempotent.mjs",
  "verify-fuel-stop-location-catalog.mjs",
  "verify-fuel-stop-planner-no-db-writes.mjs",
  "verify-fuel-transaction-null-gallons-honesty.mjs",
  "verify-generated-column-immutability.mjs",
  "verify-geofence-recon.mjs",
  "verify-harsh-event-dashcam-complete-range.mjs",
  "verify-harsh-events-append-only.mjs",
  "verify-home-fleet-restore-read-recovery.mjs",
  "verify-hos-duty-events-append-only.mjs",
  "verify-hos-tracker-endpoints.mjs",
  "verify-hos-violation-catalog-read-recovery.mjs",
  "verify-i18n-coverage.mjs",
  "verify-ifta-aggregator-determinism.mjs",
  "verify-inline-create-forms-stop-native-submit.mjs",
  "verify-inspection-update-failure-truth.mjs",
  "verify-insurance-claim-accident-read-recovery.mjs",
  "verify-insurance-claim-create-atomic-truth.mjs",
  "verify-insurance-claim-update-atomic-truth.mjs",
  "verify-insurance-coi-create-result.mjs",
  "verify-insurance-fleet-reverse-failure-exclusion.mjs",
  "verify-insurance-lawsuit-create-truth.mjs",
  "verify-insurance-module.mjs",
  "verify-insurance-policy-complete-unit-picker.mjs",
  "verify-insurance-policy-create-truth.mjs",
  "verify-insurance-policy-filter-comboboxes.mjs",
  "verify-insurance-policy-update-pending-lock.mjs",
  "verify-insurance-type-catalog-create-truth.mjs",
  "verify-insurance-type-catalog-update-pending-lock.mjs",
  "verify-integrity-alert-engine-no-subject-fabrication.mjs",
  "verify-inventory-parts-stock-cache-coherence.mjs",
  "verify-invoice-source-load-uniqueness-race.mjs",
  "verify-items-list-sort-values-wired.mjs",
  "verify-kanban-cross-column-drag-wired.mjs",
  "verify-lane-mileage-import-columns-populated.mjs",
  "verify-late-arrival-analytics.mjs",
  "verify-legal-compliance-destructive-confirm.mjs",
  "verify-legal-create-matter-error-surfacing.mjs",
  "verify-legal-hearing-deadline-derived-fallback.mjs",
  "verify-legal-matter-deadline-create-tz-instant.mjs",
  "verify-legal-matter-detail-read-recovery.mjs",
  "verify-legal-matters-deadline-date-display.mjs",
  "verify-legal-matters-error-honesty.mjs",
  "verify-legal-matters-list-sol-hearing-column-reads-both.mjs",
  "verify-legal-matters-single-pager.mjs",
  "verify-legal-privacy-terms-not-orphaned.mjs",
  "verify-legal-reverse-failure-exclusion.mjs",
  "verify-legal-templates-back-to-legal-hub.mjs",
  "verify-list-detail-source-parity.mjs",
  "verify-lists-catalog-archive-restore-error-surfacing.mjs",
  "verify-lists-termination-reasons-parse-conflict-any-field.mjs",
  "verify-load-creators-mint-or-audit-driver-pay.mjs",
  "verify-load-drawer-money-query-error-disclosure.mjs",
  "verify-load-profitability-trip-end-active-stop.mjs",
  "verify-load-reverse-work-orders.mjs",
  "verify-load-write-paths-run-driver-qualification.mjs",
  "verify-loves-cron-write-atomic.mjs",
  "verify-maint-defect-detail-action-lifecycle.mjs",
  "verify-maint-defects-inbox-action-lifecycle.mjs",
  "verify-maint-fault-draft-confirm-lifecycle.mjs",
  "verify-maint-fault-rule-create-truth.mjs",
  "verify-maint-fault-rules-action-lifecycle.mjs",
  "verify-maint-inspection-create-results.mjs",
  "verify-maint-labor-query-failure-exclusion.mjs",
  "verify-maint-master-data-read-recovery.mjs",
  "verify-maint-parts-catalog-enhanced.mjs",
  "verify-maint-preflight-dvir-action-lifecycle.mjs",
  "verify-maint-rm-status-board-exact-range.mjs",
  "verify-maint-settings-save-lifecycle.mjs",
  "verify-maint10-migrate-idempotent.mjs",
  "verify-maintenance-arriving-soon-conversion-history.mjs",
  "verify-maintenance-arriving-soon-exact-range.mjs",
  "verify-maintenance-compliance-425c-exact-range.mjs",
  "verify-maintenance-defect-triage-history-range.mjs",
  "verify-maintenance-home-read-recovery.mjs",
  "verify-maintenance-home-triage-read-recovery.mjs",
  "verify-maintenance-inspection-dvir-picker-complete.mjs",
  "verify-maintenance-inspections-exact-range.mjs",
  "verify-maintenance-intransit-exact-range.mjs",
  "verify-maintenance-kpi-drilldowns-exact-range.mjs",
  "verify-maintenance-master-create-identities.mjs",
  "verify-maintenance-parts-create-sub-category-barcode-null-400.mjs",
  "verify-maintenance-preflight-dvir-range.mjs",
  "verify-maintenance-recent-activity-exact-pagers.mjs",
  "verify-maintenance-reverse-failure-exclusion.mjs",
  "verify-maintenance-rm-status-failure-exclusion.mjs",
  "verify-maintenance-service-timeline-exact-range.mjs",
  "verify-maintenance-severe-alerts-failure-exclusion.mjs",
  "verify-maintenance-tire-event-history-exact-range.mjs",
  "verify-maintenance-triage-conversions-atomic.mjs",
  "verify-master-data-create-targets.mjs",
  "verify-md-clone-origin.mjs",
  "verify-mdata-business-date-not-utc.mjs",
  "verify-mdata-loads-driver-dqf-gate.mjs",
  "verify-mdata-workflow-target-fulfillment.mjs",
  "verify-migration-schema-grants.mjs",
  "verify-mnt5-migrate-idempotent.mjs",
  "verify-modal-attempt-close-registration.mjs",
  "verify-modal-blocks-parent-submit.mjs",
  "verify-month-close-requires-checklist-complete.mjs",
  "verify-names-master-hub-single-pager.mjs",
  "verify-nav-pattern.mjs",
  "verify-no-empty-string-uuid-bind.mjs",
  "verify-no-overflow-at-edge-breakpoints.mjs",
  "verify-nonmoney-frontend-business-date.mjs",
  "verify-notif-a-contract.mjs",
  "verify-office-i18n-preview-honesty.mjs",
  "verify-onboarding-flow-completes.mjs",
  "verify-onboarding-wizard-human-subtitle.mjs",
  "verify-opening-balance-source-ties-to-doc.mjs",
  "verify-owner-admin-quickstart-help-anchors.mjs",
  "verify-p0-settlement-schema-grants.mjs",
  "verify-packet-assemble-insert-not-silently-caught.mjs",
  "verify-parity-export-computed-column-blank.mjs",
  "verify-parity-sort-computed-column-no-op.mjs",
  "verify-parts-assignment-history-exact-range-vertical.mjs",
  "verify-parts-inventory-kpi-failure-exclusion.mjs",
  "verify-payroll-aggregate-matches-qbo.mjs",
  "verify-photo-comparison-ai.mjs",
  "verify-photo-comparison-diff-findings-contract.mjs",
  "verify-photo-comparison-evidence-durable.mjs",
  "verify-plaid-escrow-billpay-human-labels.mjs",
  "verify-planner-outside-range-widens.mjs",
  "verify-position-endpoints-no-pii-leak.mjs",
  "verify-position-history-create-linkage-truth.mjs",
  "verify-pre-dispatch-validation.mjs",
  "verify-pre-settlements.mjs",
  "verify-preflight-dvir-route-lock.mjs",
  "verify-proforma-not-in-ar.mjs",
  "verify-program-api-error-banner.mjs",
  "verify-program-board-note-error-surfacing.mjs",
  "verify-program-scenario-tracker-poll-footer-matches-cadence.mjs",
  "verify-program-surfaces-s01-s05.mjs",
  "verify-qbo-class-linkage-human-labels.mjs",
  "verify-qbo-sync-state-machine-transitions.mjs",
  "verify-quick-assign-draft-lifecycle.mjs",
  "verify-rate-change-resyncs-proforma.mjs",
  "verify-reefer-hours-archive-failure-truth.mjs",
  "verify-reefer-specs-update-failure-truth.mjs",
  "verify-reference-before-introduction.mjs",
  "verify-referenceselect-id-label-binding.mjs",
  "verify-rename-fallout.mjs",
  "verify-reports-hub-9-categories.mjs",
  "verify-reports-lists-no-dead-buttons.mjs",
  "verify-revrec-interlock-bidirectional.mjs",
  "verify-road-service-creator-draft-lifecycle.mjs",
  "verify-road-service-ticket-create-result.mjs",
  "verify-road-service-ticket-creates-wo.mjs",
  "verify-route-content-boundary-location-key.mjs",
  "verify-rpt-s01-s05-reports-home-ifta.mjs",
  "verify-rpt-s06-scheduled-count-honest.mjs",
  "verify-rpt-s06-scheduled-honest-zero.mjs",
  "verify-rpt-s07-audit-reports-section.mjs",
  "verify-rtd-edit-zero-row-not-500.mjs",
  "verify-saf-drug-alcohol-read-recovery-class.mjs",
  "verify-safety-accident-patch-persists-cost-lines.mjs",
  "verify-safety-accident-photo-durable.mjs",
  "verify-safety-accident-report-drawer-lifecycle.mjs",
  "verify-safety-accidents-range-vertical.mjs",
  "verify-safety-action-datepicker-label-wrappers.mjs",
  "verify-safety-anomalies-range.mjs",
  "verify-safety-anomaly-dashboard-range-vertical.mjs",
  "verify-safety-anomaly-full-scan-idempotent.mjs",
  "verify-safety-anomaly-severity-combobox.mjs",
  "verify-safety-background-checks-range.mjs",
  "verify-safety-cargo-claim-read-errors.mjs",
  "verify-safety-cert-expiry-filter-comboboxes.mjs",
  "verify-safety-civil-fine-types-create-description-null-400.mjs",
  "verify-safety-civil-fines-reverse-range.mjs",
  "verify-safety-complaint-create-linkage-truth.mjs",
  "verify-safety-complaints-error-messages.mjs",
  "verify-safety-complaints-range-vertical.mjs",
  "verify-safety-composite-reverse-failure-exclusion.mjs",
  "verify-safety-create-datepicker-label-association.mjs",
  "verify-safety-csa-history-range-vertical.mjs",
  "verify-safety-csa-mitigation-category-combobox.mjs",
  "verify-safety-damage-evidence-record-lifecycle.mjs",
  "verify-safety-dashboard-failure-exclusion.mjs",
  "verify-safety-datepicker-label-wrappers.mjs",
  "verify-safety-dot-inspection-create-atomic-truth.mjs",
  "verify-safety-dot-inspections-range.mjs",
  "verify-safety-dot-reminder-read-recovery.mjs",
  "verify-safety-drug-alcohol-comboboxes.mjs",
  "verify-safety-drug-program-auxiliary-range.mjs",
  "verify-safety-drug-program-create-class.mjs",
  "verify-safety-drug-test-history-range.mjs",
  "verify-safety-dvir-range-vertical.mjs",
  "verify-safety-events-comboboxes.mjs",
  "verify-safety-events-read-recovery.mjs",
  "verify-safety-filter-datepicker-label-wrappers.mjs",
  "verify-safety-filter-range-datepicker-labels.mjs",
  "verify-safety-fine-create-lifecycle.mjs",
  "verify-safety-fines-range.mjs",
  "verify-safety-hos-exception-create-truth.mjs",
  "verify-safety-hos-partial-detail-failure.mjs",
  "verify-safety-hos-violations-range-vertical.mjs",
  "verify-safety-incident-catalog-read-recovery.mjs",
  "verify-safety-incident-photo-durable.mjs",
  "verify-safety-incident-status-cas.mjs",
  "verify-safety-insurance-backend-business-date.mjs",
  "verify-safety-insurance-nested-active-tab.mjs",
  "verify-safety-integrity-alerts-range.mjs",
  "verify-safety-integrity-reports-range-vertical.mjs",
  "verify-safety-internal-fines-range.mjs",
  "verify-safety-internal-fines-reverse-range.mjs",
  "verify-safety-medical-card-create-truth.mjs",
  "verify-safety-medical-cards-range.mjs",
  "verify-safety-onboarding-create-atomic.mjs",
  "verify-safety-permit-create-linkage-truth.mjs",
  "verify-safety-permit-update-linkage-truth.mjs",
  "verify-safety-position-history-action-combobox.mjs",
  "verify-safety-position-history-single-pager.mjs",
  "verify-safety-profile-record-datepicker-labels.mjs",
  "verify-safety-random-testing-exact-range.mjs",
  "verify-safety-reverse-bulk-human-labels.mjs",
  "verify-safety-reverse-failure-exclusion.mjs",
  "verify-safety-settings-context-lifecycle.mjs",
  "verify-safety-training-batch-atomic.mjs",
  "verify-safety-training-program-comboboxes.mjs",
  "verify-safety-training-program-create-truth.mjs",
  "verify-safety-training-range-vertical.mjs",
  "verify-samsara-equipment-vin-collision-isolated.mjs",
  "verify-samsara-mapping-page-reads-the-canonical-map.mjs",
  "verify-samsara-units-vin-collision-isolated.mjs",
  "verify-scenario-tracker-single-mount.mjs",
  "verify-scheduled-report-catalog-shared.mjs",
  "verify-search-inputs-have-aria.mjs",
  "verify-send-message-draft-lifecycle.mjs",
  "verify-sentry-receives-test-error.mjs",
  "verify-server-paged-paritytable-single-pager.mjs",
  "verify-setl-finalize-recompute-debt.mjs",
  "verify-settlements-grid-honest-labels.mjs",
  "verify-settlements-open-driver-bills.mjs",
  "verify-sort-law.mjs",
  "verify-sync-alerts-column-names.mjs",
  "verify-sys-s05-qbo-sync-writeback-off.mjs",
  "verify-system-module-surfaces-s01-s04.mjs",
  "verify-table-alignment.mjs",
  "verify-task-create-catalog-failure-exclusion.mjs",
  "verify-tasks-chat-read-recovery.mjs",
  "verify-team-split-action-lifecycle.mjs",
  "verify-telematics-schema-references.mjs",
  "verify-test-insert-columns.mjs",
  "verify-timezone.mjs",
  "verify-tire-record-archive-failure-truth.mjs",
  "verify-tire-record-update-failure-truth.mjs",
  "verify-tire-replacement-source-cas.mjs",
  "verify-tonu-invoice-line-zero-rows-check.mjs",
  "verify-trailer-profile-complete-reverse-ranges.mjs",
  "verify-training-program-recertify-rw.mjs",
  "verify-training-record-datepicker-labels.mjs",
  "verify-ts-brace-balance.mjs",
  "verify-ui-control-law.mjs",
  "verify-unit-create-atomic-spine.mjs",
  "verify-unit-create-mints-asset.mjs",
  "verify-unit-fault-xfer-human-labels.mjs",
  "verify-user-detail-status-matches-list.mjs",
  "verify-users-list-silent-50-cap.mjs",
  "verify-usmca-driver-bill-per-load-rate.mjs",
  "verify-usmca-inbox9-23-fe.mjs",
  "verify-usmca-launch-readiness.mjs",
  "verify-usmca-load-status-dispatch-transition.mjs",
  "verify-vehicle-locations-append-only.mjs",
  "verify-vendor-default-expense-account.mjs",
  "verify-verbatim-hos-clocks.mjs",
  "verify-w8ben-draft-lifecycle.mjs",
  "verify-warranty-claim-archive-failure-truth.mjs",
  "verify-warranty-claim-file-failure-truth.mjs",
  "verify-warranty-claim-update-failure-truth.mjs",
  "verify-wo-create-ux-escape-zindex.mjs",
];

const exemptKeys = (json) => Object.keys(json).filter((k) => !k.startsWith("_"));

export function checkRatchet(exempt, mainExempt, guards = GUARDS) {
  const p = [];
  const now = exemptKeys(exempt);
  if (mainExempt) {
    const was = new Set(exemptKeys(mainExempt));
    for (const k of now) if (!was.has(k)) p.push(`${EXEMPT_REL}: ${k} added — the unwired register only shrinks (2)`);
    if (now.length > was.size) p.push(`${EXEMPT_REL}: ${now.length} entries > ${was.size} on origin/main (2)`);
  }
  for (const g of guards) if (Object.prototype.hasOwnProperty.call(exempt, g)) p.push(`${EXEMPT_REL}: ${g} runs here but is still listed as exempt (2)`);
  for (const g of guards) if (!existsSync(resolve(ROOT, "scripts", g))) p.push(`scripts/${g}: listed guard is missing (1)`);
  return p;
}

function runOne(cmd, args) {
  return new Promise((done) => {
    const env = { ...process.env };
    delete env.DATABASE_URL;
    delete env.DATABASE_DIRECT_URL;
    const child = spawn(cmd, args, { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => child.kill("SIGKILL"), 90_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      done({ code: code ?? 1, out });
    });
  });
}

export async function runGuards(list, mk = (g) => ["node", [`scripts/${g}`]]) {
  const failed = [];
  let i = 0;
  async function worker() {
    while (i < list.length) {
      const g = list[i++];
      const [cmd, args] = mk(g);
      const r = await runOne(cmd, args);
      if (r.code !== 0) failed.push(`${g}: exit ${r.code} — ${r.out.trim().split("\n").slice(-2).join(" | ").slice(0, 240)}`);
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  return failed;
}

function loadExempt() {
  const exempt = JSON.parse(readFileSync(resolve(ROOT, EXEMPT_REL), "utf8"));
  const r = spawnSync("git", ["show", `origin/main:${EXEMPT_REL}`], { cwd: ROOT, encoding: "utf8" });
  return { exempt, mainExempt: r.status === 0 ? JSON.parse(r.stdout) : null };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain && process.argv.includes("--selftest")) {
  const { exempt, mainExempt } = loadExempt();
  if (checkRatchet(exempt, mainExempt).length) {
    console.error("SELFTEST FAIL: baseline not clean", checkRatchet(exempt, mainExempt));
    process.exit(1);
  }
  const plants = [
    ["register grows", checkRatchet({ ...exempt, "verify-new-orphan.mjs": "x" }, mainExempt ?? exempt)],
    ["wired guard still exempt", checkRatchet({ ...exempt, [GUARDS[0]]: "x" }, null)],
    ["listed guard missing", checkRatchet(exempt, null, ["verify-does-not-exist.mjs"])],
    ["a failing guard is caught", await runGuards(["x"], () => ["node", ["-e", "process.exit(3)"]])],
  ];
  for (const [n, p] of plants) {
    if (!p.length) {
      console.error(`SELFTEST FAIL: plant "${n}" not caught`);
      process.exit(1);
    }
  }
  console.log(`SELFTEST PASS: ${plants.length} plants caught`);
  process.exit(0);
}
if (isMain) {
  const { exempt, mainExempt } = loadExempt();
  const p = [...checkRatchet(exempt, mainExempt), ...(await runGuards(GUARDS))];
  if (p.length) {
    console.error(`verify-unwired-guards-shrink-only FAIL (${p.length}):`);
    for (const x of p) console.error(`  ${x}`);
    process.exit(1);
  }
  console.log(`verify-unwired-guards-shrink-only PASS: ${GUARDS.length} previously-unwired guards ran GREEN; unwired register ${exemptKeys(exempt).length} (shrink-only)`);
}
