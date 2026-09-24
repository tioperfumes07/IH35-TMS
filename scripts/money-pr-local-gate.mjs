#!/usr/bin/env node
/**
 * money-pr-local-gate — FAIL-FAST before push (Rule 25 + Rule 29).
 *
 * Runs the same assertions CI will run later, but in seconds at husky
 * pre-push / branch:precheck-push — so a bad FINDING / MODULE_PROGRESS /
 * migration hour / verify-step parity / CLAIMED thrash / EntityLink baseline
 * never burns 15–20 minutes of build-typecheck.
 *
 * Wired as the FIRST step in scripts/branch-precheck-push.mjs buildPrecheckSteps.
 * Do not remove without updating verify-money-pr-local-gate + Rule 29.
 *
 * Cursor agents MUST also run this explicitly before every push:
 *   node scripts/money-pr-local-gate.mjs
 * Never rely on husky alone (worktrees often lack prepared hooks).
 * Never `git commit --no-verify` / `git push --no-verify` (Rule 29).
 */
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureFreshGateStepMap } from "./generate-gate-step-map.mjs";
import { guardIsInScope } from "./verify-static.mjs";
import { EMPTY_BY_PURGE_EXIT, PURGE_WINDOW_GUARDS, purgeWindow } from "./lib/purge-window.mjs";
import { dataWritePathFileActuallyWrites } from "./lib/data-write-path-detection.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "money-pr-local-gate";

/** Ordered fail-fast suite — same classes that red'd Cursor #4009–#4011 / #4198 vs Claude. */
const STEPS = [
  ["verify-definition-of-done-evidence", "scripts/verify-definition-of-done-evidence.mjs"],
  // GATE-SCOPE-01 — proves this very file's LIVE_DOMAIN_GUARDS loop runs a guard only when its
  // own declared domain is touched, never merely because DATABASE_URL happens to be set.
  ["verify-live-domain-guards-are-diff-scoped", "scripts/verify-live-domain-guards-are-diff-scoped.mjs"],
  // GATE-SCOPE-02 — the other half: proves a DATA_WRITE_PATHS path match also requires the file to
  // actually write to a database (content-checked), not just sit under db/migrations/ or
  // scripts/ops/.
  ["verify-data-write-path-detection-is-content-based", "scripts/verify-data-write-path-detection-is-content-based.mjs"],
  ["verify-no-money-theater", "scripts/verify-no-money-theater.mjs"],
  ["verify-no-capability-regression", "scripts/verify-no-capability-regression.mjs"],
  // Rule 26 — block parallel scoreboard-hotfile PRs before push (SKIP-PASS without gh token).
  ["verify-no-parallel-scoreboard-prs", "scripts/verify-no-parallel-scoreboard-prs.mjs"],
  // §7 palette — financial + nonfinancial (Cursor #4198 burned build-typecheck on amber banner).
  ["verify-section7-palette-financial", "scripts/verify-section7-palette-financial.mjs"],
  ["verify-section7-palette-nonfinancial", "scripts/verify-section7-palette-nonfinancial.mjs"],
  // CodeQL js/missing-rate-limiting on new auth routes (Cursor #4198).
  ["verify-new-auth-routes-rate-limited", "scripts/verify-new-auth-routes-rate-limited.mjs"],
  // CLS-ROUTE-STUB-ARITY — paired with the rate-limit guard above ON PURPOSE: that guard converts
  // routes to app.get(path, options, handler), which is exactly what kills a test stub that captured
  // the handler positionally (2 files went red on 2026-08-06). Shrink-only.
  ["verify-route-stub-handler-arity", "scripts/verify-route-stub-handler-arity.mjs"],
  // Cursor HH 12–23 / Claude HH 00–11 — #4009 burned a full typecheck on HH=00.
  ["verify-migration-lane-band", "scripts/verify-migration-lane-band.mjs"],
  // Cursor EVEN / Claude ODD — #4010 claimed 1900 then 1985 (odd) before 1986.
  ["verify-verify-step-lane-band", "scripts/verify-verify-step-lane-band.mjs"],
  // TOOL-F03 — filename is the claim; feature PRs must not edit CLAIMED-NUMBERS.json (#4010).
  ["verify-no-claimed-numbers-edits", "scripts/verify-no-claimed-numbers-edits.mjs"],
  // Rule 25/37 — number must already be on origin/main before authoring verify-steps/NNNN-*.mjs
  // (#4421–#4455 class: opened feature PRs before claim-reserve merged).
  ["verify-verify-step-claimed-on-main", "scripts/verify-verify-step-claimed-on-main.mjs"],
  // Concurrent claim/repair races can survive the JSON union merge driver as duplicate registry keys
  // plus two NNNN-* files. Catch the ambiguity locally before any feature push (#15449/#15448, #15453).
  ["verify-verify-step-numbers-unique", "scripts/verify-verify-step-numbers-unique.mjs"],
  // TOOL-F04 — data-mutating migrations need REHEARSED: in a branch commit (#4009).
  ["verify-data-migrations-rehearsed", "scripts/verify-data-migrations-rehearsed.mjs"],
  // EntityLink adoption ratchet — #4010 FactoringHome AST shift + bare UUID (~1.5s).
  ["verify-entity-link-adoption", "scripts/verify-entity-link-adoption.mjs"],
  // ROUND-20.7 (APP-WIDE AUTOFIT LAW, owner 2026-09-12) — a data-board page never regrows a
  // fixed page-level max-w-[NNNpx] cap; a converted planner column never loses its title=.
  ["verify-page-autofit", "scripts/verify-page-autofit.mjs"],
  // ROUND-20.8 PART A (owner 2026-09-12) — MoneyKpiTile requires tone+sub, MoneySparkline stays on
  // the 3-color dataviz palette, no registered money-module page's header link duplicates a tab.
  ["verify-money-module-design", "scripts/verify-money-module-design.mjs"],
  // LOAD-TO-CASH CHAIN (owner law, 2026-09-12) — "it should never automatch, it suggests and we
  // accept it or change the transactions." verify-load-to-cash-chain runs in LIVE_DOMAIN_GUARDS below.
  ["verify-no-automatch", "scripts/verify-no-automatch.mjs"],
  // ALL-SEATS LAW (owner, 2026-09-13) — every load-number column carries a settlement/tour column
  // beside it; only source_document_ref (never display_id) is ever the human-visible number.
  ["verify-settlement-ref-beside-load", "scripts/verify-settlement-ref-beside-load.mjs"],
  // D3-SOURCE-REF-ONLY-KEY (Lead LAW, 2026-09-23) — "source_document_ref is the ONLY key that
  // means AlwaysTrack... until this closes." Backend twin of the guard above: no query/derivation
  // matches a settlement by display_id. docs/bus/CC3-89-ROW-SETTLEMENT-NUMBERING-AUDIT-2026-09-23.md
  ["verify-settlement-source-ref-only-key", "scripts/verify-settlement-source-ref-only-key.mjs"],
  // LOAD-TO-CASH CHAIN, LINK 4 PR 3 (owner precedence, 2026-09-12) — "money-in excluded from
  // auto-categorization." Covers both pre-existing rule engines + the human refresh-suggestion route.
  ["verify-money-in-excluded-from-auto-categorization", "scripts/verify-money-in-excluded-from-auto-categorization.mjs"],
  // B6 (owner, 2026-09-12) — customer record tab bar position fix + data-dot feature.
  ["verify-customer-tab-bar-position-and-data-dot", "scripts/verify-customer-tab-bar-position-and-data-dot.mjs"],
  // B4/ROUND 21.2 (owner, 2026-09-12) — relationship-health-score honesty for the 1-4-of-5-signals case.
  ["verify-customer-relationship-score-partial-honesty", "scripts/verify-customer-relationship-score-partial-honesty.mjs"],
  // ROUND 23.3 (owner/Lead, 2026-09-13) — B1 second half: every live Diesel-memo expense either
  // matches a fuel.fuel_transactions row or is voided ABSORPTION-D5.
  // P0-A (Lead ruling, 2026-09-22) — IFTA taxable-gallon base must never include DEF (not a motor
  // fuel) or reefer_diesel (undetermined tank source, no receipt evidence). Static + live
  // deliberate-failure proof.
  ["verify-ifta-excludes-non-highway-fuel-types", "scripts/verify-ifta-excludes-non-highway-fuel-types.mjs"],
  // FEED-PARITY-01 (docs/manuals/04-RULING-FEED-PARITY-..., owner, 2026-09-22, LANE_CROSS —
  // docs/bus/LEAD-RULING-2026-09-22-CC3-FEED-PARITY-SHARED-CREATE-PATH-CROSS-LANE.md): ONE shared
  // load-create path (createLoadWithFullSideEffects); shrink-only ratchet on direct
  // `INSERT INTO mdata.loads` outside it, plus a by-symbol assertion the shared path still calls
  // every required INSERT/resolver/gate.
  ["verify-one-load-create-path", "scripts/verify-one-load-create-path.mjs"],
  // ROUND E15.7-R (DEVIN-B, task 47) — daily Relay deposit sync cron must exist and be wired.
  // POPULATION CHECK: cron absent → SKIPPED exit 0 (arms itself when CC-2 lands task 48);
  // cron present → assert daily + wired at boot, RED if broken. No .guard-exempt.json entry.
  ["verify-relay-deposits-sync-is-scheduled", "scripts/verify-relay-deposits-sync-is-scheduled.mjs"],
  // ROUND E23 §9.0.17 SWEEP (DEVIN-B, Q10) — no stale hardcoded counts in guards or baselines.
  // FAIL on: numeric literal vs live count/sum, baseline missing/stale measured_at, _comment
  // contradicting measured_at, duplicated count. Allowlist: `// STALE-LITERAL-OK: <reason>`.
  ["verify-no-stale-literals-in-guards", "scripts/verify-no-stale-literals-in-guards.mjs"],
  // Rule 30 — soft-reset onto newer main deleted other PRs' verify-steps (2026-08-02).
  ["verify-no-guard-file-deletion", "scripts/verify-no-guard-file-deletion.mjs"],
  // Rule 30 — tip commit LIVE PROOF must be Claude-green (not "UNVERIFIED browser" theater).
  ["verify-claude-green-evidence-shape", "scripts/verify-claude-green-evidence-shape.mjs"],
  ["verify-economic-columns-c25-c31-present", "scripts/verify-economic-columns-c25-c31-present.mjs"],
  ["verify-declared-is-rendered", "scripts/verify-declared-is-rendered.mjs"],
  ["verify-derived-artifact-freshness", "scripts/verify-derived-artifact-freshness.mjs"],
  ["verify-generated-artifact-registry", "scripts/verify-generated-artifact-registry.mjs"],
  ["verify-posting-hits-designed-accounts", "scripts/verify-posting-hits-designed-accounts.mjs"],
  ["verify-reversal-symmetry", "scripts/verify-reversal-symmetry.mjs"],
  ["verify-module-progress-not-authored", "scripts/verify-module-progress-not-authored.mjs"],
  ["verify-no-bulk-test-void", "scripts/verify-no-bulk-test-void.mjs"],
  // 2026-08-29 — 275/285 prod_verified greens had no live_verified_sha (SYS-S07 proof case).
  ["verify-prod-verified-live-binding", "scripts/verify-prod-verified-live-binding.mjs"],
  ["verify-fuel-planner-source-availability", "scripts/verify-fuel-planner-source-availability.mjs"],
  ["verify-driver-import-response-honesty", "scripts/verify-driver-import-response-honesty.mjs"],
  ["verify-driver-roster-bulk-deactivate", "scripts/verify-driver-roster-bulk-deactivate.mjs"],
  ["verify-fleet-trip-cost-scope-lifecycle", "scripts/verify-fleet-trip-cost-scope-lifecycle.mjs"],

  // ── GLOBAL FE COMPONENT STANDARDS (added 2026-08-05, CC-3) ──────────────────────────────────
  // WHY: this gate covered money/DoD/palette/EntityLink but NOT the shared-component ratchets, so a
  // screens-lane PR could pass every local check and still red CI. It cost #4484 two full CI cycles
  // in a row — locked-guards on verify:money-fields-use-moneyinput (raw <input> for principal), then
  // build-typecheck at step 99/1393 on no-raw-date-input (5m37s) for <input type="date">. Each was a
  // one-line component swap that a 0.1s local scan catches.
  //
  // SCOPE: only the GLOBAL ratchets — these scan all of apps/frontend/src, so ANY new FE file can
  // trip them. The ~100 per-page `*-uses-paritytable` guards are deliberately NOT here: they only
  // fire when you touch their specific page, and running them all would make the gate slow enough to
  // be skipped, which is how a gate dies. Combined cost of the five below is ~0.5s.
  // NOTE: the meta-guard that ASSERTS this list mirrors CI ships separately under claim 2632 —
  // verify:guard-wired requires every guard script to be wired into package.json + CI, which needs a
  // claimed verify-step number (Rule 37). Until it lands, this list is hand-maintained; the entries
  // below are the empirically-burned set.
  // META: asserts the FE list below still mirrors what CI runs. Hand-maintained mirrors rot — the
  // first version of this list missed verify-referenceselect-coverage-ratchet (invoked via `npm run`,
  // not `node`) and #4484 burned a cycle on it. Wired into CI as verify-step 2632.
  ["verify-local-gate-covers-fe-ratchets", "scripts/verify-local-gate-covers-fe-ratchets.mjs"],
  // Owner 2026-09-02: J1/K2 shrink-only ratchet. FAST-MERGE of #19609 landed a new
  // trapping EntityPicker + raw text-[Npx] because this gate never ran the script.
  ["verify-ui-design-system-ratchet", "scripts/verify-ui-design-system-ratchet.mjs"],
  ["verify-no-raw-date-input", "scripts/verify-no-raw-date-input.mjs"],
  ["verify-no-native-datetime-input", "scripts/verify-no-native-datetime-input.mjs"],
  ["verify-combobox-outside-dismiss", "scripts/verify-combobox-outside-dismiss.mjs"],
  ["verify-fine-create-suggest-load", "scripts/verify-fine-create-suggest-load.mjs"],
  ["verify-internal-fine-create-suggest-load", "scripts/verify-internal-fine-create-suggest-load.mjs"],
  ["verify-safety-event-create-suggest-load", "scripts/verify-safety-event-create-suggest-load.mjs"],
  // 2026-08-29 — literal `draft.col` matcher redded origin/main after page moved to input.draft.col;
  // four CC-1 PRs burned a full build-typecheck each. Run here so local gate catches source-shape drift.
  ["verify-safety-log-event-dot-fields", "scripts/verify-safety-log-event-dot-fields.mjs"],
  ["verify-cargo-claim-create-suggest-load", "scripts/verify-cargo-claim-create-suggest-load.mjs"],
  ["verify-incidents-cluster-create-suggest-load", "scripts/verify-incidents-cluster-create-suggest-load.mjs"],
  ["verify-abandonment-driver-picker", "scripts/verify-abandonment-driver-picker.mjs"],
  ["verify-driver-fuel-unit-picker", "scripts/verify-driver-fuel-unit-picker.mjs"],
  ["verify-maint-wo-resolved-vendor-label", "scripts/verify-maint-wo-resolved-vendor-label.mjs"],
  ["verify-road-service-driver-picker", "scripts/verify-road-service-driver-picker.mjs"],
  ["verify-safety-permit-unit-picker", "scripts/verify-safety-permit-unit-picker.mjs"],
  ["verify-safety-permit-unit-reverse", "scripts/verify-safety-permit-unit-reverse.mjs"],
  ["verify-safety-dot-expiry-driver-link", "scripts/verify-safety-dot-expiry-driver-link.mjs"],
  ["verify-dqf-catalog-retention-wiring", "scripts/verify-dqf-catalog-retention-wiring.mjs"],
  ["verify-driver-samsara-login-lifecycle", "scripts/verify-driver-samsara-login-lifecycle.mjs"],
  ["verify-driver-b1-visa-lifecycle", "scripts/verify-driver-b1-visa-lifecycle.mjs"],
  ["verify-driver-referral-forward-reverse-lifecycle", "scripts/verify-driver-referral-forward-reverse-lifecycle.mjs"],
  ["verify-photo-comparison-human-connectivity", "scripts/verify-photo-comparison-human-connectivity.mjs"],
  ["verify-dvir-correction-lifecycle", "scripts/verify-dvir-correction-lifecycle.mjs"],
  ["verify-vehicle-driver-overlap-lifecycle", "scripts/verify-vehicle-driver-overlap-lifecycle.mjs"],
  ["verify-road-service-driver-reverse", "scripts/verify-road-service-driver-reverse.mjs"],
  ["verify-money-fields-use-moneyinput", "scripts/verify-money-fields-use-moneyinput.mjs"],
  ["verify-referenceselect-qbo-standard", "scripts/verify-referenceselect-qbo-standard.mjs"],
  ["verify-referenceselect-coverage-ratchet", "scripts/verify-referenceselect-coverage-ratchet.mjs"],
  ["verify-no-internal-language-in-prod-ui", "scripts/verify-no-internal-language-in-prod-ui.mjs"],
  ["verify-vendor-credits-vendor-id-safe-cast", "scripts/verify-vendor-credits-vendor-id-safe-cast.mjs"],
  ["verify-payments-deposited-to-account-safe-cast", "scripts/verify-payments-deposited-to-account-safe-cast.mjs"],
  ["verify-bill-allocation-assets-limit-in-bounds", "scripts/verify-bill-allocation-assets-limit-in-bounds.mjs"],
  ["verify-cash-advances-view-load-column-present", "scripts/verify-cash-advances-view-load-column-present.mjs"],
  ["verify-payrun-close-panel-settlement-load-links", "scripts/verify-payrun-close-panel-settlement-load-links.mjs"],
  ["verify-je-source-links-invoice-bill-display-id", "scripts/verify-je-source-links-invoice-bill-display-id.mjs"],
  ["verify-acct-f9408-cash-forecast-proforma-eta-bucket", "scripts/verify-acct-f9408-cash-forecast-proforma-eta-bucket.mjs"],
  ["verify-bank-account-hide-capability-fails-closed", "scripts/verify-bank-account-hide-capability-fails-closed.mjs"],
  ["verify-insurance-payment-schedule-mark-paid-scope-snapshot", "scripts/verify-insurance-payment-schedule-mark-paid-scope-snapshot.mjs"],
  ["verify-wo-time-tracking-rate-modal-scope-snapshot", "scripts/verify-wo-time-tracking-rate-modal-scope-snapshot.mjs"],
  ["verify-escrow-forfeit-scope-snapshot", "scripts/verify-escrow-forfeit-scope-snapshot.mjs"],
  ["verify-parts-purchase-scope-snapshot", "scripts/verify-parts-purchase-scope-snapshot.mjs"],
  ["verify-fine-lifecycle-scope-snapshot", "scripts/verify-fine-lifecycle-scope-snapshot.mjs"],
  ["verify-fuel-card-overage-confirm-modal", "scripts/verify-fuel-card-overage-confirm-modal.mjs"],
  ["verify-acct-direct-creators-company-keyed-remount", "scripts/verify-acct-direct-creators-company-keyed-remount.mjs"],
  ["verify-settlement-pending-deductions-error-suppresses-cache", "scripts/verify-settlement-pending-deductions-error-suppresses-cache.mjs"],
  ["verify-cash-advance-owner-notification-durable", "scripts/verify-cash-advance-owner-notification-durable.mjs"],
  ["verify-cancellation-approver-actor-and-billable-charge", "scripts/verify-cancellation-approver-actor-and-billable-charge.mjs"],
  ["verify-expenses-created-by-actor-and-total-amount-cents-column", "scripts/verify-expenses-created-by-actor-and-total-amount-cents-column.mjs"],
  ["verify-settlements-load-ids-reverse-link", "scripts/verify-settlements-load-ids-reverse-link.mjs"],
  ["verify-g18-expense-line-category-and-load-exemption", "scripts/verify-g18-expense-line-category-and-load-exemption.mjs"],
  ["verify-inventory-vendor-historical-label-resolver", "scripts/verify-inventory-vendor-historical-label-resolver.mjs"],
  ["verify-dispatch-driver-historical-label-resolver", "scripts/verify-dispatch-driver-historical-label-resolver.mjs"],
  ["verify-border-crossing-cbp-wait-cache-rls", "scripts/verify-border-crossing-cbp-wait-cache-rls.mjs"],
  ["verify-dispatch-trip-pairing-expenses-endpoint-404", "scripts/verify-dispatch-trip-pairing-expenses-endpoint-404.mjs"],
  ["verify-dispatch-load-status-filter-enum-mismatch-400", "scripts/verify-dispatch-load-status-filter-enum-mismatch-400.mjs"],
  ["verify-dispatch-overview-derived-actions", "scripts/verify-dispatch-overview-derived-actions.mjs"],
  ["verify-driver-profile-dqf-kpi-actions", "scripts/verify-driver-profile-dqf-kpi-actions.mjs"],
  ["verify-bill-payment-print-letter-html", "scripts/verify-bill-payment-print-letter-html.mjs"],
  ["verify-account-register-ref-no-journal-entry-link", "scripts/verify-account-register-ref-no-journal-entry-link.mjs"],
  ["verify-money-detail-page-uses-ispending", "scripts/verify-money-detail-page-uses-ispending.mjs"],
  ["verify-lists-accounting-picker-law-honest", "scripts/verify-lists-accounting-picker-law-honest.mjs"],
  ["verify-lst-picker01-account-drawer-detail-type-inline-create", "scripts/verify-lst-picker01-account-drawer-detail-type-inline-create.mjs"],
  ["verify-safety-accident-reverse-deep-link", "scripts/verify-safety-accident-reverse-deep-link.mjs"],
  ["verify-safety-training-record-canonical-routes", "scripts/verify-safety-training-record-canonical-routes.mjs"],
  ["verify-safety-event-detail-list-fallback", "scripts/verify-safety-event-detail-list-fallback.mjs"],
  ["verify-factoring-outstanding-liability-honest-label", "scripts/verify-factoring-outstanding-liability-honest-label.mjs"],
  ["verify-expense-create-duplicate-submission-guard", "scripts/verify-expense-create-duplicate-submission-guard.mjs"],
  ["verify-cash-flow-projection-snapshot-wired", "scripts/verify-cash-flow-projection-snapshot-wired.mjs"],
  ["verify-financial-reports-business-date-not-utc", "scripts/verify-financial-reports-business-date-not-utc.mjs"],
  ["verify-driver-escrow-counts-deactivated-inclusion-parity", "scripts/verify-driver-escrow-counts-deactivated-inclusion-parity.mjs"],
  ["verify-deadhead-estimated-branch-not-hardcoded-zero", "scripts/verify-deadhead-estimated-branch-not-hardcoded-zero.mjs"],
  ["verify-report-export-buttons-await-and-catch", "scripts/verify-report-export-buttons-await-and-catch.mjs"],
  ["verify-tasks-membership-check-before-scope", "scripts/verify-tasks-membership-check-before-scope.mjs"],
  ["verify-vendor-balances-view-excludes-draft-bills", "scripts/verify-vendor-balances-view-excludes-draft-bills.mjs"],
  ["verify-internal-fine-no-nested-transaction", "scripts/verify-internal-fine-no-nested-transaction.mjs"],
  ["verify-internal-fine-liability-backlink-checked", "scripts/verify-internal-fine-liability-backlink-checked.mjs"],
  ["verify-warranty-reimburse-update-checked", "scripts/verify-warranty-reimburse-update-checked.mjs"],
  ["verify-insurance-renewal-atomic-bill-schedule", "scripts/verify-insurance-renewal-atomic-bill-schedule.mjs"],
  ["verify-book-load-initial-assignment-history", "scripts/verify-book-load-initial-assignment-history.mjs"],
  ["verify-cbp-wait-times-cache-lucia-bypass", "scripts/verify-cbp-wait-times-cache-lucia-bypass.mjs"],
  ["verify-dispatch-driver-label-survives-archive", "scripts/verify-dispatch-driver-label-survives-archive.mjs"],
  ["verify-auto-deduction-policy-driver-label-survives-archive", "scripts/verify-auto-deduction-policy-driver-label-survives-archive.mjs"],
  ["verify-wo-line-void-not-delete", "scripts/verify-wo-line-void-not-delete.mjs"],
  ["verify-dispatch-load-patch-commodity-column-missing-500", "scripts/verify-dispatch-load-patch-commodity-column-missing-500.mjs"],
  ["verify-bookload-edit-freight-roundtrip", "scripts/verify-bookload-edit-freight-roundtrip.mjs"],
  ["verify-road-service-wo-bill-race-locked", "scripts/verify-road-service-wo-bill-race-locked.mjs"],
  ["verify-policy-create-wizard-scope-snapshot", "scripts/verify-policy-create-wizard-scope-snapshot.mjs"],
  ["verify-safety-read-recovery-dead-ends", "scripts/verify-safety-read-recovery-dead-ends.mjs"],
  ["verify-catalog-equipment-dls-no-stale-select-all-policy", "scripts/verify-catalog-equipment-dls-no-stale-select-all-policy.mjs"],
  ["verify-revrec-bill-posting-tagged-invoice-source", "scripts/verify-revrec-bill-posting-tagged-invoice-source.mjs"],
  ["verify-insurance-claim-graph-continuity-chain-rendered", "scripts/verify-insurance-claim-graph-continuity-chain-rendered.mjs"],
  ["verify-accounting-spine-event-emitted-in-transaction", "scripts/verify-accounting-spine-event-emitted-in-transaction.mjs"],
  ["verify-je-source-links-expense-display-id", "scripts/verify-je-source-links-expense-display-id.mjs"],
  ["verify-dispatch-loads-customer-label-survives-archive", "scripts/verify-dispatch-loads-customer-label-survives-archive.mjs"],
  ["verify-bank-kpi-authoritative-cash-no-fake-zero", "scripts/verify-bank-kpi-authoritative-cash-no-fake-zero.mjs"],
  ["verify-gl-invariants-inv3-real-only-basis", "scripts/verify-gl-invariants-inv3-real-only-basis.mjs"],
  ["verify-mdata-loads-patch-writes-assignment-history", "scripts/verify-mdata-loads-patch-writes-assignment-history.mjs"],
  ["verify-settlement-header-backlink-written", "scripts/verify-settlement-header-backlink-written.mjs"],
  // Round 83 R3 / migration 202614271200: every money line's amount = qty x rate, and no invoice-line
  // writer rounds that product in floating point. Static.
  ["verify-item-line-quantity-rate-amount", "scripts/verify-item-line-quantity-rate-amount.mjs"],
  // Purge window (Lead rulings 2026-09-23): exactly the eight named guards may skip EMPTY BY PURGE. Static.
  ["verify-purge-window-exemption", "scripts/verify-purge-window-exemption.mjs"],
  ["verify-display-id-series-by-prefix", "scripts/verify-display-id-series-by-prefix.mjs"],
  ["verify-reconciler-route-read-only", "scripts/verify-reconciler-route-read-only.mjs"],
  ["verify-faro-deduction-capture", "scripts/verify-faro-deduction-capture.mjs"],
  // R-102.1-A BUILD 3 (Lead ruling, deadline 2026-09-23 18:00 UTC): the void-stamp system's own
  // guard -- 7 document families carry voided_at/void_reason/voided_by_user_id live, and
  // stampDocumentVoided() (void-document-stamp.service.ts) is the ONE writer of the four families
  // that had zero pre-existing writer; a named, frozen baseline covers the three that already had
  // established GL-aware void machinery. Live DB required, fails closed.
  ["verify-void-stamp-columns", "scripts/verify-void-stamp-columns.mjs"],
  // ROUND 124 T4 (Lead): every submitted/advanced invoice must carry factor_profile_id -- the write
  // paths resolved it and dropped it on the floor before this round; red-before-green proven live.
  ["verify-invoice-factor-profile-linkage", "scripts/verify-invoice-factor-profile-linkage.mjs"],
  // P0 (Lead-directed): a voided fuel_transaction's combined original+reversal postings must net
  // to zero per account -- the exact class of live-confirmed corruption (130 rows, $72,676.56) a
  // multi-JE-per-document double-reversal bug produced before this round's fix. Baseline is the
  // known pre-fix count only, never allowed to grow.
  ["verify-no-double-reversed-fuel-postings", "scripts/verify-no-double-reversed-fuel-postings.mjs"],
  // ROUND 130.2 (Lead, P0, permanent fix): no voided USMCA load may hold a real load_number --
  // the UNIQUE(operating_company_id, load_number) constraint has no partial predicate, so a real
  // number held by a voided row permanently blocks the AlwaysTrack feed from re-creating it.
  ["verify-voided-loads-hold-no-real-number", "scripts/verify-voided-loads-hold-no-real-number.mjs"],
  // ROUND 131.2 (Lead): the void-stamp write must set the SAME column the purge-window gate's own
  // live_predicate reads (usmca-purge-expected-zero.generated.json), never just voided_at/status --
  // static arm (FAMILY_TABLE vs the JSON) + live arm (no row missing its liveness column).
  ["verify-void-stamps-the-spec-liveness-column", "scripts/verify-void-stamps-the-spec-liveness-column.mjs"],
  // ROUND 134.1 (Lead, P0): reversed_by_je_id must be written on EVERY original JE in a combined
  // reversal set, not only when exactly one exists -- shrink-only baseline for the 116 pre-existing
  // fully-line-reversed-but-header-unlinked rows this fix found live.
  ["verify-reversed-jes-carry-header-linkage", "scripts/verify-reversed-jes-carry-header-linkage.mjs"],
  // ROUND 118/119 (Lead ruling): a cancelled load must leave no live money artifact behind it --
  // invoice/expense/vendor-bill/driver-bill/advance/settlement, checked against
  // dispatch/cancellation.service.ts's own cascade logic exactly. Baselined (shrink-only) against
  // 9 pre-existing loads cancelled before this cascade covered every family. Live DB required,
  // fails closed. Two more directions (movement-evidence line survival, dispatcher confirmation)
  // are named in this guard's own header as NOT YET BUILT -- not silently skipped.
  ["verify-cancelled-load-leaves-no-live-money", "scripts/verify-cancelled-load-leaves-no-live-money.mjs"],
  // ROUND 133 (owner law, P0): every NEW scripts/ops/ file that writes to a financial table must
  // call verify-owner-authorization.mjs first -- static check, shrink-only baseline for the 142
  // pre-existing files, zero tolerance for anything new.
  ["verify-no-unauthorized-production-write", "scripts/verify-no-unauthorized-production-write.mjs"],
  // ROUND 138 (owner order, via Lead relay, P0): voiding a parent document must cascade to its own
  // line/detail children in the SAME transaction -- static arm (CASCADE_CHILDREN vs the spec JSON)
  // + live arm (0 live children under a voided parent). Live-measured pre-fix: 119 invoice_lines,
  // 28 bill_lines under voided parents -- backfilled live in the same round this guard shipped.
  ["verify-void-cascades-to-every-child", "scripts/verify-void-cascades-to-every-child.mjs"],
  // ROUND 138 companion: no write site may void a registered parent table without also calling
  // cascadeVoidChildren( in the same file -- same-file-signal static scan, shrink-only baseline
  // (1 pre-existing entry: driver-finance/void-document-callees.service.ts, CC-3's lane, handed
  // off rather than edited directly).
  ["verify-no-caller-voids-without-cascade", "scripts/verify-no-caller-voids-without-cascade.mjs"],
  // E15.6 DEVIN-A — void/reversal guards (round 105 defect class). verify-every-void-route-reverses
  // is new; verify-no-voided-doc-has-live-postings exists on main but was not wired into the gate.
  ["verify-every-void-route-reverses", "scripts/verify-every-void-route-reverses.mjs"],
  ["verify-no-voided-doc-has-live-postings", "scripts/verify-no-voided-doc-has-live-postings.mjs"],
];

// ROUND 29.9 owner ruling (2026-09-22) — three guards, wired in this exact order, AFTER the STEPS
// array above and BEFORE this gate reports exit 0. Each uses the same runNode() non-zero-exit
// propagation as every STEPS entry (verified live: see verify-money-pr-local-gate.mjs's deliberate-
// failure case) — nothing here is a softer check than the array above.
const GUARD_303 = [
  // 03a — DUPLICATE-ROUTE-BOOT-CRASH has now hit production 3 separate times (ACCT-F26308,
  // ACCT-F5726, factor-reconciliation/#22145), each one a real deploy failure discovered only AFTER
  // merge because this guard (scripts/verify-no-duplicate-routes.mjs) existed but was never wired
  // into the fail-fast local gate — only into the slower full verify:local-ci/verify:pre-commit
  // suite (ROUND 29.5 owner ruling, queue item 3; this ROUND 29.9 message reconfirms it as 03a and
  // asks it to run first, ahead of 03b/03c below — moved from its prior tail position in the STEPS
  // array above to here, same script, same behavior).
  ["verify-no-duplicate-routes (03a)", "scripts/verify-no-duplicate-routes.mjs", {}],
  // 03b — LANE GUARD (ruled 2026-09-22 after CC-1 and CC-3 both wrote settlement rows 5805/5806 in
  // the same hour). Fails a PR touching another seat's lane per docs/bus/LANES.md. Seat resolves
  // from env SEAT or the branch name (cc-1/<topic>); no seat resolved -> FAIL, never assumed.
  // LANE_BASE defaults to origin/main inside the script itself — no extra env needed here.
  ["verify-lane-ownership (03b)", "scripts/verify-lane-ownership.mjs", {}],
  // 03d — ROUND 29.9-B owner ruling: 162 of 192 live-DB-referencing guards were found (dynamic
  // scan, not a guess) to silently exit 0 — fake green — when DATABASE_URL is unset, instead of
  // failing. 91 converted to fail-closed same pass; verify-no-silent-db-skip.mjs enforces the
  // remaining 71 as a ratchet baseline (scripts/lib/db-skip-baseline.json) that can only shrink —
  // any NEW file exhibiting the pattern, not in the baseline and not declaring
  // ALLOW_OFFLINE_SKIP, fails the gate immediately. Runs unconditionally (no DATABASE_URL needed
  // itself — it deletes DATABASE_URL from the env of every guard it dynamically spawns).
  ["verify-no-silent-db-skip (03d)", "scripts/verify-no-silent-db-skip.mjs", {}],
  // 03e — independent second-layer enforcement that verify-alwaystrack-parity.baseline.json can
  // only SHRINK between commits. Diffs the file AS COMMITTED on this branch against AS COMMITTED
  // on origin/main via git, so it also catches a baseline grown by any path other than the
  // parity guard's own in-process regenerate-refuse logic (a hand-edit, a different script, a bad
  // merge). No DATABASE_URL needed — pure git+JSON diff.
  ["verify-baseline-never-grows (03e)", "scripts/verify-baseline-never-grows.mjs", {}],
  // 03f — the USMCA/Faro reconciliation, CLOSED (owner order 2026-09-22, "SAVED SO NOBODY ASKS
  // AGAIN"). Nine figures are LAW; this asserts the JSON + the human-readable doc both still
  // match them exactly, and the purchases-receipts=AR identity holds. Static — no DATABASE_URL.
  ["verify-reconciliation-constants", "scripts/verify-reconciliation-constants.mjs", {}],
  // ROUND E11.3 — the AUTH-001 USMCA wipe left three live-money baselines (fuel, void-is-whole,
  // cancelled-load) measured against a ledger the wipe then deleted; this guard fails any of them
  // that still carries a pre-wipe measured_at, so a wipe artifact can never be baselined as
  // historical debt again.
  ["verify-baselines-are-post-wipe", "scripts/verify-baselines-are-post-wipe.mjs", {}],
  ["verify-no-stale-literals-in-guards", "scripts/verify-no-stale-literals-in-guards.mjs", {}],
  // ROUND E11.3-R item 5 — the guard that stops the AUTH-001 class of bug permanently: the wipe's
  // own DELETE FROM mdata.load_stops carried no operating_company_id predicate at all, deleting
  // the frozen TRANSP entity's rows alongside USMCA's. Static, no DB needed — scans
  // db/migrations/**/*.sql and scripts/ops/**/*.{mjs,ts} for a DELETE against a company-scoped
  // table with zero mention of operating_company_id anywhere in the statement.
  ["verify-no-unscoped-company-delete", "scripts/verify-no-unscoped-company-delete.mjs", {}],
];

// E7 (Lead ruling R56-B, 2026-09-22) — live-data guards that used to sit in STEPS above, where each
// skip-passed (exit 0) with no DATABASE_URL. Each now fails closed (requireLiveDbOrExit) and runs
// whenever a live DB is present or this diff touches its own file, a data-writing path, or a code
// path that writes the tables it reads. A diff that cannot be read counts as touching everything.
const DATA_WRITE_PATHS = ["db/migrations/", "scripts/ops/"];
const ONE_SHOT_WRITER_RE = /^scripts\/run-[^/]+-once\.m?[jt]s$/;
const LIVE_DOMAIN_GUARDS = [
  [
    "verify-costs-are-expenses-not-handwritten-jes",
    [
      "scripts/verify-costs-are-expenses-not-handwritten-jes.mjs",
      "apps/backend/src/accounting/",
      "apps/backend/src/fuel/",
      "apps/backend/src/factoring/",
    ],
  ],
  // PROTECT-LIST GUARD (owner, P0, ROUND E11.2) — "nothing in this repo prevents a purge or a feed
  // from deleting master data. The wipe spared geofences and locations because the table list
  // happened to omit them, not because anything forbade it." Static half (no new DELETE/TRUNCATE
  // against protected schemas in db/migrations/**/scripts/ops/**) is diff-scoped already; live half
  // (every protected table's USMCA row count at or above its floor) needs DATABASE_URL whenever
  // this domain is touched, same as every other LIVE_DOMAIN_GUARDS entry.
  ["verify-master-data-protected", ["db/migrations/", "scripts/ops/"]],
  [
    "verify-loves-geofences-seeded",
    ["scripts/verify-loves-geofences-seeded.mjs", "scripts/ops/loves-604-geofences-seed.ts", "db/migrations/"],
  ],
  [
    "verify-void-is-whole",
    ["apps/backend/src/accounting/", "apps/backend/src/driver-finance/", "apps/backend/src/factoring/", "apps/backend/src/fuel/", "db/migrations/", "scripts/purge/"],
  ],
  ["verify-purge-window-state", ["scripts/purge/", "scripts/lib/purge-window.mjs", "purge_state.json"]],
  ["verify-faro-invoice-lines-load-linkage", ["apps/backend/src/data-infra/", "apps/backend/src/factoring/"]],
  [
    "verify-dispute-window-unified",
    ["apps/backend/src/data-infra/", "apps/backend/src/factoring/", "apps/backend/src/accounting/"],
  ],
  [
    "verify-driver-bill-settlement-link",
    ["apps/backend/src/driver-finance/", "apps/backend/src/dispatch/", "apps/backend/src/accounting/"],
  ],
  [
    "verify-load-to-cash-chain",
    [
      "apps/backend/src/dispatch/",
      "apps/backend/src/mdata/",
      "apps/backend/src/driver-finance/",
      "apps/backend/src/accounting/",
      "apps/backend/src/work-orders/",
      "apps/backend/src/maintenance/",
      "apps/backend/src/cash-advances/",
      "apps/backend/src/governance/",
      "apps/backend/src/qbo-sync/",
    ],
  ],
  [
    "verify-fuel-transactions-per-load",
    [
      "apps/backend/src/fuel/",
      "apps/backend/src/integrations/",
      "apps/backend/src/accounting/",
      "data/alwaystrack/",
      "scripts/verify-fuel-transactions-per-load.baseline.json",
    ],
  ],
  [
    "verify-fuel-loves-prices-daily-table-and-report-guard",
    ["apps/backend/src/fuel/", "apps/backend/src/sync/", "apps/backend/src/reports/fuel-price-variance.routes.ts"],
  ],
  // E1 (#22293): every directory that calls createJournalEntry(OnClient), plus the guard's baseline.
  [
    "verify-every-posting-has-a-source",
    [
      "apps/backend/src/accounting/",
      "apps/backend/src/banking/",
      "apps/backend/src/driver-finance/",
      "apps/backend/src/fuel/",
      "apps/backend/src/insurance/",
      "apps/backend/src/payroll/",
      "apps/backend/src/safety/",
      "scripts/verify-every-posting-has-a-source.baseline.json",
    ],
  ],
  // E17 (#22309): the reconciler's invariants read loads, stops, assignments, invoices, Faro lines and
  // settlements; the empty-settlement guard reads settlements, their lines and the loads linked to them.
  [
    "verify-reconciler-exceptions",
    [
      "apps/backend/src/reconciler/",
      "scripts/reconciler/",
      "apps/backend/src/dispatch/",
      "apps/backend/src/mdata/",
      "apps/backend/src/accounting/",
      "apps/backend/src/factoring/",
      "apps/backend/src/data-infra/",
      "apps/backend/src/driver-finance/",
      "scripts/verify-reconciler-exceptions.baseline.json",
    ],
  ],
  [
    "verify-no-empty-zero-settlement",
    [
      "apps/backend/src/driver-finance/",
      "apps/backend/src/dispatch/",
      "apps/backend/src/accounting/",
      "scripts/verify-no-empty-zero-settlement.baseline.json",
    ],
  ],
  // ESCROW-LEDGER-SIGN-01 (owner ruling, 2026-09-23): "A hold is a CREDIT to the driver's escrow
  // liability... sign follows transaction_type, never the caller." Shrink-only baseline on the
  // 39 pre-fix rows (they purge, not corrected here). Domain-conditional per the E7 pattern above
  // rather than an unconditional STEPS entry, so this doesn't repeat the alwaystrack-parity class
  // of "blocks every seat regardless of their own diff" mistake.
  [
    "verify-escrow-ledger-sign-follows-type",
    [
      "apps/backend/src/driver-finance/",
      "apps/backend/src/settlements/",
      "apps/backend/src/reports/driver-settlement-summary.routes.ts",
      "scripts/verify-escrow-ledger-sign-follows-type.baseline.json",
    ],
  ],
  // Round 84 M1: every directory that writes catalogs.accounts.
  [
    "verify-no-duplicate-active-account-names",
    [
      "apps/backend/src/accounting/",
      "apps/backend/src/catalogs/",
      "apps/backend/src/outbox/",
      "apps/backend/src/qbo-sync/",
      "scripts/verify-no-duplicate-active-account-names.baseline.json",
    ],
  ],
  // ROUND E12.1-R2, TASK 27 — every directory that writes driver_finance.driver_settlements /
  // driver_finance.driver_bills.settled_in_settlement_id, mdata.loads.status, or
  // accounting.invoices.status: a settlement finalize or invoice-sent event that doesn't sync the
  // load's status forward is exactly the defect class this guard tripwires.
  [
    "verify-settled-load-carries-settled-status",
    [
      "apps/backend/src/driver-finance/",
      "apps/backend/src/dispatch/",
      "apps/backend/src/feed/",
      "apps/backend/src/accounting/",
      "scripts/verify-settled-load-carries-settled-status.baseline.json",
    ],
  ],
  // TASK 18 (ROUND E12.1-R2) — the credit_memo/liability zero-posting-lines tripwire. Fires on the
  // one known live-capable writer (escrow-forfeit.service.ts's source_transaction_type='liability'
  // path) plus the routes/dispatcher whose contract depends on the count staying zero.
  [
    "verify-credit-memo-liability-zero-posting-lines",
    [
      "apps/backend/src/accounting/void-document.service.ts",
      "apps/backend/src/accounting/credit-memos.routes.ts",
      "apps/backend/src/liabilities/",
      "apps/backend/src/driver-finance/escrow-forfeit.service.ts",
    ],
  ],
  // ROUND E14.2 (DEVIN-B, task 45): the JE memo is the ONE human-readable line on a register row.
  // CC-2 is fixing the WRITER (posting-engine.service.ts memo builders) in the same round; this
  // guard catches the output (serialized JSON, >200 chars, no document reference, empty). Baseline 0
  // (shrink-only). Domain: every directory that calls createJournalEntry(OnClient), same as
  // verify-every-posting-has-a-source above. Live guard — fail-closed without DATABASE_URL.
  [
    "verify-je-memo-is-human-readable",
    [
      "apps/backend/src/accounting/",
      "apps/backend/src/banking/",
      "apps/backend/src/driver-finance/",
      "apps/backend/src/fuel/",
      "apps/backend/src/insurance/",
      "apps/backend/src/payroll/",
      "apps/backend/src/safety/",
    ],
  ],
  // ROUND E23 (DEVIN-B, Q01): a cost-of-revenue/expense JE (debiting 5xxx/6xxx) must have a
  // matching accounting.expenses row; a fuel/expense JE must NOT credit 1090/1100/1150.
  // RED fixture: 10 live fuel JEs crediting 1090 with bare-UUID memos, $7,250.20.
  // Cursor fixes the writer; this guard catches the output. Baseline 0 (shrink-only).
  [
    "verify-costs-are-expenses-not-handwritten-jes",
    [
      "apps/backend/src/accounting/",
      "apps/backend/src/fuel/",
      "apps/backend/src/banking/",
      "apps/backend/src/driver-finance/",
      "apps/backend/src/expenses/",
    ],
  ],
  // ROUND E23 (DEVIN-B, Q11): re-assert purge-era closures (tasks 19/21/24/25/26/29/30/31/39)
  // against live state every run. "Zero now" on a 6% fed book is NOT "fixed." Derives live load
  // count dynamically, prints "closure re-measured at N live loads", self-arms as feed grows.
  [
    "verify-purge-era-closures-still-hold",
    [
      "apps/backend/src/accounting/",
      "apps/backend/src/factoring/",
      "apps/backend/src/driver-finance/",
      "apps/backend/src/fuel/",
      "apps/backend/src/dispatch/",
    ],
  ],
  // ROUND E23 (DEVIN-B, Q16): a driver merge must have at least one hard identifier
  // match (CDL, passport, INE, CURP, Samsara ID, QBO vendor ID, employee ID). Name
  // similarity alone is NOT sufficient. Baseline 0 (shrink-only).
  [
    "verify-no-driver-merge-without-hard-identifier",
    [
      "apps/backend/src/drivers/",
      "apps/backend/src/data-infra/",
      "apps/backend/src/dispatch/",
    ],
  ],
  // ROUND E23 (DEVIN-B, Q06): gate live reads must connect as ih35_ci_readonly, never
  // neondb_owner. Static source scan — no DB needed.
  [
    "verify-gate-live-reads-use-ci-readonly",
    [
      "scripts/lib/require-live-db.mjs",
      "scripts/lib/pg-connection-options.cjs",
    ],
  ],
  // ROUND E23 (DEVIN-B, Q34): bus channel — NOW-<SEAT>.md 4KB cap + 48h staleness arm.
  // Static filesystem scan — no DB needed.
  [
    "verify-bus-files-are-readable",
    [
      "docs/bus/",
    ],
  ],
  // ROUND 140.6 (DEVIN-B): bank match/suggest path is read-only. GET never writes,
  // bank_transactions count is derived and asserted unchanged, zero JEs from suggest/candidate paths.
  [
    "verify-bank-match-suggest-is-read-only",
    [
      "apps/backend/src/accounting/bank-recon/",
      "banking.bank_transactions",
      "accounting.journal_entries",
    ],
  ],
  // ROUND 141.4 (DEVIN-B): every match kind is acceptable or declared. No kind may be shown
  // that cannot be accepted. Parsed from code, live CHECK + columns verified.
  [
    "verify-every-match-kind-is-acceptable-or-declared",
    [
      "apps/backend/src/accounting/bank-recon/",
      "banking.reconciliation_matches",
      "banking.bank_transactions",
    ],
  ],
  // ROUND 142.1 (DEVIN-B): the feed has no guard — arm it. Expected set derived from manifest,
  // not hardcoded. Checks unstamped dates, duplicates, day mismatches, sample data. Prints progress.
  [
    "verify-feed-is-whole",
    [
      "apps/backend/src/accounting/factoring/",
      "docs/bus/00-FEED-MANIFEST.md",
      "accounting.factoring_advances",
    ],
  ],
];

function touchesMoneyPath() {
  const res = spawnSync("git", ["diff", "--name-only", "origin/main...HEAD"], { cwd: ROOT, encoding: "utf8" });
  if ((res.status ?? 1) !== 0) return false;
  const files = (res.stdout || "").split("\n").filter(Boolean);
  const MONEY_PATH_RE = /^(apps\/backend\/src\/(accounting|banking|factoring|driver-finance|mdata)\/|db\/migrations\/)/;
  return files.some((f) => MONEY_PATH_RE.test(f));
}

// E16.2 (owner, 2026-09-23 22:45 UTC) — gate slowness during a six-seat merge window was lock
// contention, not a slow guard: every guard's live read was connecting as `neondb_owner`, which
// contends for writer locks with the production feed. Every one of these guards is a read-only
// check (SELECT / BEGIN READ ONLY / set_config bypass_rls) — none of them ever needs write
// authority — so the gate defaults their DATABASE_URL to the `ih35_ci_readonly` role instead.
// Read once, memoized, never logged (it's a live credential).
const READONLY_DB_URL_FILE = path.join(os.homedir(), ".config/ih35/neon-prod-readonly.url");
let cachedReadonlyDbUrl;
function resolveGuardDatabaseUrl() {
  if (cachedReadonlyDbUrl !== undefined) return cachedReadonlyDbUrl;
  // An explicit env var always wins — lets a seat without the file (or CI, which injects its own
  // scoped secret) opt in without touching this file.
  if (process.env.DATABASE_URL_READONLY) {
    cachedReadonlyDbUrl = process.env.DATABASE_URL_READONLY;
    return cachedReadonlyDbUrl;
  }
  try {
    const val = fs.readFileSync(READONLY_DB_URL_FILE, "utf8").trim();
    cachedReadonlyDbUrl = val || undefined;
  } catch {
    cachedReadonlyDbUrl = undefined;
  }
  // No readonly credential available locally — fall back to whatever DATABASE_URL the caller
  // already set (unchanged behavior; never block a seat that hasn't fetched the readonly role yet).
  return cachedReadonlyDbUrl ?? process.env.DATABASE_URL;
}

function runNode(rel, extraEnv = {}, args = []) {
  const script = path.join(ROOT, rel);
  console.log(`[${LABEL}] RUN ${rel}${args.length ? ` ${args.join(" ")}` : ""}`);
  const env = { ...process.env, ...extraEnv };
  // Only override when a live DB is actually in play (DATABASE_URL set) and the caller didn't
  // already pin a specific connection string via extraEnv (e.g. a test harness).
  if (env.DATABASE_URL && !extraEnv.DATABASE_URL) {
    env.DATABASE_URL = resolveGuardDatabaseUrl();
  }
  const res = spawnSync(process.execPath, [script, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env,
  });
  const out = `${res.stdout ?? ""}${res.stderr ?? ""}`.trim();
  if (out) console.log(out);
  return res.status ?? 1;
}

function failStep(name) {
  console.error(
    `\n${LABEL}: FAIL — ${name} rejected this branch BEFORE push.\n` +
      `Fix the commit message / MODULE_PROGRESS / FINDING / lane band / CLAIMED / EntityLink baseline, then:\n` +
      `  node scripts/money-pr-local-gate.mjs\n` +
      `Then ONE push (hooks ON — never --no-verify). Do not rebase while CI is running (Rule 25 / Rule 29).\n`,
  );
}

if (process.argv.includes("--selftest")) {
  // Structural selftest only — behavioral coverage lives in verify-money-pr-local-gate.
  for (const [, rel] of STEPS) {
    if (!fs.existsSync(path.join(ROOT, rel))) {
      console.error(`${LABEL} --selftest FAIL: missing ${rel}`);
      process.exit(1);
    }
  }
  for (const [, rel] of GUARD_303) {
    if (!fs.existsSync(path.join(ROOT, rel))) {
      console.error(`${LABEL} --selftest FAIL: missing ${rel}`);
      process.exit(1);
    }
  }
  for (const [name] of LIVE_DOMAIN_GUARDS) {
    if (!fs.existsSync(path.join(ROOT, "scripts", `${name}.mjs`))) {
      console.error(`${LABEL} --selftest FAIL: missing scripts/${name}.mjs`);
      process.exit(1);
    }
  }
  const e7List = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/lib/e7-batch2-live-guards.json"), "utf8"));
  for (const file of e7List.guards) {
    const abs = path.join(ROOT, "scripts", file);
    if (!fs.existsSync(abs) || !/export\s+const\s+REQUIRES_LIVE_DB\s*=/.test(fs.readFileSync(abs, "utf8"))) {
      console.error(`${LABEL} --selftest FAIL: E7 batch-2 guard ${file} is missing or does not declare REQUIRES_LIVE_DB`);
      process.exit(1);
    }
  }
  for (const file of e7List.live_flag_guards ?? []) {
    const abs = path.join(ROOT, "scripts", file);
    if (!fs.existsSync(abs) || !/\b(?:process\.argv|argv|args)(?:\.slice\(\d+\))?\.includes\(\s*["']--live["']\s*\)/.test(fs.readFileSync(abs, "utf8"))) {
      console.error(`${LABEL} --selftest FAIL: E7 batch-2 --live guard ${file} is missing or has no --live path`);
      process.exit(1);
    }
  }
  for (const rel of ["scripts/verify-control-totals.mjs", "scripts/verify-alwaystrack-parity.mjs", "scripts/lib/require-live-db.mjs", "scripts/lib/db-skip-baseline.json"]) {
    if (!fs.existsSync(path.join(ROOT, rel))) {
      console.error(`${LABEL} --selftest FAIL: missing ${rel}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

for (const [name, rel] of STEPS) {
  const code = runNode(rel);
  if (code !== 0) {
    failStep(name);
    process.exit(code);
  }
}

// ROUND 29.9 — 03a/03b run unconditionally, in order, right after the STEPS array above.
for (const [name, rel, extraEnv] of GUARD_303) {
  const code = runNode(rel, extraEnv);
  if (code !== 0) {
    failStep(name);
    process.exit(code);
  }
}

// ROUND 29.9-B (Rule 30 corollary): a gate that prints PASS while a live check was skipped is fake
// green, exactly what Rule 30 already forbids in words. Every skip anywhere in this file — 03c
// below, and any future conditional live check — pushes here so the final line can never silently
// omit it.
const skippedLiveChecks = [];

// Purge window (Lead ruling 2026-09-23, docs/bus/09-23-2026-LEAD-RULING-CURSOR-PURGE-WINDOW-GUARD-STATE.md):
// a live guard may exit EMPTY_BY_PURGE_EXIT only if it is one of PURGE_WINDOW_GUARDS and the window in
// purge_state.json is open. Any other guard returning that code fails the gate like any failure.
const purgeSkips = [];
function acceptedAsEmptyByPurge(rel, code) {
  if (code !== EMPTY_BY_PURGE_EXIT) return false;
  const guard = path.basename(rel, ".mjs");
  if (!PURGE_WINDOW_GUARDS.includes(guard) || !purgeWindow().open || purgeSkips.includes(guard)) return false;
  purgeSkips.push(guard);
  return true;
}

// GATE-SCOPE-03-REFIX (self-discovered, 2026-09-23, second occurrence) — this exact fix was already
// shipped once (PR #22464, merged e71960a27e) and was silently reverted by a lost-update race: a
// concurrent PR (#22466, branched before #22464 landed) also touched this file and its merge
// overwrote the fix with its own stale copy — nobody's fault, a real concurrent-edit collision, not
// a deliberate revert. Re-applying the identical, already-proven pattern. These four checks all
// used `if (process.env.DATABASE_URL || touchesXPath())`, so a live DB's mere presence ran them on
// every push regardless of diff content — reproduced live a second time: this exact class blocked
// an apps/frontend-only diff (FILTER-MULTI-01) on verify-alwaystrack-parity, zero backend/migration
// paths touched. Gate purely on `touched`; a touched domain with no DATABASE_URL still fails closed
// (ROUND 29.9-B). Kept as four separate inline blocks (not a shared helper) —
// verify-purge-window-exemption.mjs counts a literal source-text pattern in this file as proof the
// purge exemption is still wired at exactly 4 named sites; a shared helper collapses that count.

// 03c — control totals against LIVE production.
if (touchesMoneyPath()) {
  if (!process.env.DATABASE_URL) {
    console.error(
      `\n${LABEL}: FAIL — scripts/verify-control-totals.mjs (03c) — this diff touches a money path ` +
        `but DATABASE_URL is not set. A touched live-domain guard with no DB is a FAIL, never a skip (ROUND 29.9-B).\n`,
    );
    process.exit(1);
  }
  const code = runNode("scripts/verify-control-totals.mjs");
  if (code !== 0 && !acceptedAsEmptyByPurge("scripts/verify-control-totals.mjs", code)) {
    failStep("verify-control-totals (03c)");
    process.exit(code);
  }
} else {
  const msg = "verify-control-totals.mjs (03c) — no money path in this diff";
  console.log(`[${LABEL}] SKIP ${msg}`);
  skippedLiveChecks.push(msg);
}

// ROUND 23.3 SUPPLEMENT (owner/Lead, 2026-09-13) — the master AlwaysTrack parity guard, proves the
// WHOLE ingest chain against prod.
if (touchesMoneyPath()) {
  if (!process.env.DATABASE_URL) {
    console.error(
      `\n${LABEL}: FAIL — scripts/verify-alwaystrack-parity.mjs — this diff touches a money path but ` +
        `DATABASE_URL is not set. A touched live-domain guard with no DB is a FAIL, never a skip (ROUND 29.9-B).\n`,
    );
    process.exit(1);
  }
  const code = runNode("scripts/verify-alwaystrack-parity.mjs");
  if (code !== 0 && !acceptedAsEmptyByPurge("scripts/verify-alwaystrack-parity.mjs", code)) {
    failStep("verify-alwaystrack-parity");
    process.exit(code);
  }
} else {
  const msg = "verify-alwaystrack-parity.mjs — no money path in this diff";
  console.log(`[${LABEL}] SKIP ${msg}`);
  skippedLiveChecks.push(msg);
}

// Lead ROUND 48 (2026-09-22): one fuel purchase, one posting. fuel/ is not in touchesMoneyPath()
// but a fuel change is exactly what can post a second copy of a purchase, so this check keys on
// its own paths.
function touchesFuelOrExpensePath() {
  const res = spawnSync("git", ["diff", "--name-only", "origin/main...HEAD"], { cwd: ROOT, encoding: "utf8" });
  if ((res.status ?? 1) !== 0) return false;
  const files = (res.stdout || "").split("\n").filter(Boolean);
  const FUEL_EXPENSE_RE = /^(apps\/backend\/src\/(accounting|fuel)\/|db\/migrations\/)/;
  return files.some((f) => FUEL_EXPENSE_RE.test(f));
}
if (touchesFuelOrExpensePath()) {
  if (!process.env.DATABASE_URL) {
    console.error(
      `\n${LABEL}: FAIL — scripts/verify-diesel-expense-fuel-dedupe.mjs — this diff touches its ` +
        `fuel/accounting/migration domain but DATABASE_URL is not set. A touched live-domain guard ` +
        `with no DB is a FAIL, never a skip (ROUND 29.9-B).\n`,
    );
    process.exit(1);
  }
  const code = runNode("scripts/verify-diesel-expense-fuel-dedupe.mjs");
  if (code !== 0) {
    failStep("verify-diesel-expense-fuel-dedupe");
    process.exit(code);
  }
} else {
  const msg = "verify-diesel-expense-fuel-dedupe.mjs — no accounting/fuel/migration path in this diff";
  console.log(`[${LABEL}] SKIP ${msg}`);
  skippedLiveChecks.push(msg);
}

// Lead ruling 4-of-4 (2026-09-22) — shrink-only ceiling ratchet, baseline 76: USMCA
// fuel.fuel_transactions rows still carrying the raw Relay bridge token (transaction_reference LIKE
// 'txn_%') instead of a real, vendor-matched reference.
if (touchesMoneyPath()) {
  if (!process.env.DATABASE_URL) {
    console.error(
      `\n${LABEL}: FAIL — scripts/verify-fuel-relay-txn-vendor-unmatched.mjs — this diff touches a ` +
        `money path but DATABASE_URL is not set. A touched live-domain guard with no DB is a FAIL, ` +
        `never a skip (ROUND 29.9-B).\n`,
    );
    process.exit(1);
  }
  const code = runNode("scripts/verify-fuel-relay-txn-vendor-unmatched.mjs");
  if (code !== 0) {
    failStep("verify-fuel-relay-txn-vendor-unmatched");
    process.exit(code);
  }
} else {
  const msg = "verify-fuel-relay-txn-vendor-unmatched.mjs — no money path in this diff";
  console.log(`[${LABEL}] SKIP ${msg}`);
  skippedLiveChecks.push(msg);
}

const changedForLiveDomains = (() => {
  const res = spawnSync("git", ["diff", "--name-only", "origin/main...HEAD"], { cwd: ROOT, encoding: "utf8" });
  if ((res.status ?? 1) !== 0) return null;
  return (res.stdout || "").split("\n").filter(Boolean);
})();
// GATE-SCOPE-01 (owner, via the Lead) — this loop's WHETHER-a-touched-guard-passes was always
// correct; its WHEN-does-it-run was not. `touched` already computes correctly whether the diff
// hits this guard's own declared domain. The prior condition ORed a live DB's mere presence in
// with the diff-derived touched flag, so every live-domain guard ran on every push for any seat
// that happened to have a live DB set — which is every seat, every push — re-introducing exactly the
// "blocks every seat regardless of their own diff" class this file's own comments say
// LIVE_DOMAIN_GUARDS exists to avoid (see the verify-fuel-relay-txn-vendor-unmatched comment
// above). Confirmed live: verify-fuel-transactions-per-load (domain: fuel/, integrations/,
// accounting/, data/alwaystrack/) blocked a banking-only PR (BANK-UNDO-01, #22452 — touches only
// apps/backend/src/banking/ + frontend, none of that guard's domain) purely because a real
// DATABASE_URL was set to let its OWN guards run for real.
//
// A live DB being available is what lets a touched guard run for real — never a reason to run an
// untouched one. A guard whose domain the diff DOES touch still needs a live DB to prove anything
// (ROUND 29.9-B: a live money guard that cannot connect is a FAIL, never a skip) — so a touched
// guard with no DATABASE_URL now fails closed instead of silently running-because-DB-was-set. A
// fuel change still runs the fuel guard and still fails closed; an untouched domain no longer
// runs at all, on any diff, regardless of whether DATABASE_URL happens to be set.
// GATE-SCOPE-02 (owner, via the Lead) — DATA_WRITE_PATHS was spread unconditionally into every
// guard's `prefixes`, so ANY file under db/migrations/ or scripts/ops/ counted as "touched" for
// every live-domain guard regardless of whether that file writes anything — confirmed live
// blocking three seats on three non-writing files (a claim-registry JSON, a read-only ops script).
// A domain path (e.g. fuel/, accounting/) still triggers unconditionally — that's real application
// code in a real money domain, not a path historically reused for unrelated bookkeeping files. A
// DATA_WRITE_PATHS match now also requires dataWritePathFileActuallyWrites() to say yes: real .sql
// migrations always do (unconditionally, by file type); everything else under either prefix is
// content-checked for an actual DB client import, with a manifest escape hatch for edge cases.
for (const [name, domainPaths] of LIVE_DOMAIN_GUARDS) {
  const rel = `scripts/${name}.mjs`;
  const touched =
    changedForLiveDomains === null ||
    changedForLiveDomains.some((f) => {
      if (f === rel || ONE_SHOT_WRITER_RE.test(f)) return true;
      if (domainPaths.some((p) => f.startsWith(p))) return true;
      if (DATA_WRITE_PATHS.some((p) => f.startsWith(p))) return dataWritePathFileActuallyWrites(f, ROOT);
      return false;
    });
  if (touched) {
    if (!process.env.DATABASE_URL) {
      console.error(
        `\n${LABEL}: FAIL — ${rel} — this diff touches its domain but DATABASE_URL is not set. ` +
          `A touched live-domain guard with no DB is a FAIL, never a skip (ROUND 29.9-B).\n`,
      );
      process.exit(1);
    }
    const code = runNode(rel);
    if (code !== 0 && !acceptedAsEmptyByPurge(rel, code)) {
      failStep(name);
      process.exit(code);
    }
  } else {
    const msg = `${rel} — none of its domain paths in this diff`;
    console.log(`[${LABEL}] SKIP ${msg}`);
    skippedLiveChecks.push(msg);
  }
}

// E7 batch 2 (Lead ROUND 84): the guards in scripts/lib/e7-batch2-live-guards.json fail closed. Each
// runs when its owned paths in scripts/.gate-step-map.json intersect the diff or its own file changed
// (verify-static's guardIsInScope), and then needs a live DB. A guard the map marks alwaysRun has no
// owned path to key on, so it runs only when a live DB is present.
const E7_BATCH2_LIST = "scripts/lib/e7-batch2-live-guards.json";
const e7Batch2List = JSON.parse(fs.readFileSync(path.join(ROOT, E7_BATCH2_LIST), "utf8"));
// live_flag_guards are static by default; their database half runs only with --live.
const e7Batch2 = [
  ...e7Batch2List.guards.map((file) => [file, []]),
  ...(e7Batch2List.live_flag_guards ?? []).map((file) => [file, ["--live"]]),
];
const { map: gateStepMap } = ensureFreshGateStepMap();
const e7Batch2Skipped = [];
for (const [file, args] of e7Batch2) {
  const entry = gateStepMap.entries?.[file];
  const inScope = entry?.alwaysRun
    ? Boolean(process.env.DATABASE_URL)
    : changedForLiveDomains === null || guardIsInScope(file, entry, changedForLiveDomains);
  if (!inScope) {
    e7Batch2Skipped.push(file);
    continue;
  }
  const code = runNode(`scripts/${file}`, {}, args);
  if (code !== 0 && !acceptedAsEmptyByPurge(`scripts/${file}`, code)) {
    failStep(file);
    process.exit(code);
  }
}
if (e7Batch2Skipped.length > 0) {
  const msg =
    `${e7Batch2Skipped.length} E7 batch-2 live guard(s) — none of their owned paths in this diff ` +
    `(alwaysRun ones need a DATABASE_URL): ${e7Batch2Skipped.join(", ")}`;
  console.log(`[${LABEL}] SKIP ${msg}`);
  skippedLiveChecks.push(msg);
}

if (purgeSkips.length > 0) {
  const w = purgeWindow();
  const msg =
    `${purgeSkips.length} GUARDS SKIPPED — EMPTY BY PURGE, verified ${w.verifiedAt}, expires ${w.expiresAt}: ` +
    purgeSkips.join(", ");
  console.log(`[${LABEL}] ${msg}`);
  skippedLiveChecks.push(msg);
}

function changedFileCountVsMain() {
  const res = spawnSync("git", ["diff", "--name-only", "origin/main...HEAD"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if ((res.status ?? 1) !== 0) return 0;
  return (res.stdout || "").split("\n").filter(Boolean).length;
}

const nFiles = changedFileCountVsMain();
if (nFiles > 50) {
  console.log(`[${LABEL}] RUN typecheck (${nFiles} files vs origin/main > 50 — DRIFT-1 tsc arm)`);
  const tsc = spawnSync("npm", ["run", "typecheck"], {
    cwd: ROOT,
    encoding: "utf8",
    env: process.env,
    timeout: 600000,
  });
  const tscOut = `${tsc.stdout ?? ""}${tsc.stderr ?? ""}`.trim();
  if (tscOut) console.log(tscOut);
  if ((tsc.status ?? 1) !== 0) {
    console.error(
      `\n${LABEL}: FAIL — typecheck rejected this branch (DRIFT-1: local gate without tsc is not merge proof for >50-file diffs).\n`,
    );
    process.exit(tsc.status ?? 1);
  }
}

if (skippedLiveChecks.length > 0) {
  console.log(`\n${LABEL}: ${skippedLiveChecks.length} LIVE CHECK(S) SKIPPED — NOT A PASS on those checks specifically:`);
  for (const s of skippedLiveChecks) console.log(`  - ${s}`);
}

console.log(
  `${LABEL}: PASS — DoD + money-theater + scoreboard serialize + §7 palette (fin+nonfin) + auth rateLimit + migration band + verify-step band + no-CLAIMED-edits + EntityLink + Rule 30 (no guard deletion + Claude-green LIVE PROOF) OK (fail-fast before CI)${skippedLiveChecks.length > 0 ? ` — WITH ${skippedLiveChecks.length} LIVE CHECK(S) SKIPPED (see above)` : ""}`,
);
process.exit(0);
