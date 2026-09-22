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
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "money-pr-local-gate";

/** Ordered fail-fast suite — same classes that red'd Cursor #4009–#4011 / #4198 vs Claude. */
const STEPS = [
  ["verify-definition-of-done-evidence", "scripts/verify-definition-of-done-evidence.mjs"],
  ["verify-no-money-theater", "scripts/verify-no-money-theater.mjs"],
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
  // accept it or change the transactions." All seats bound by these two.
  ["verify-no-automatch", "scripts/verify-no-automatch.mjs"],
  ["verify-load-to-cash-chain", "scripts/verify-load-to-cash-chain.mjs"],
  // ALL-SEATS LAW (owner, 2026-09-13) — every load-number column carries a settlement/tour column
  // beside it; only source_document_ref (never display_id) is ever the human-visible number.
  ["verify-settlement-ref-beside-load", "scripts/verify-settlement-ref-beside-load.mjs"],
  // LOAD-TO-CASH CHAIN, LINK 4 PR 3 (owner precedence, 2026-09-12) — "money-in excluded from
  // auto-categorization." Covers both pre-existing rule engines + the human refresh-suggestion route.
  ["verify-money-in-excluded-from-auto-categorization", "scripts/verify-money-in-excluded-from-auto-categorization.mjs"],
  // B6 (owner, 2026-09-12) — customer record tab bar position fix + data-dot feature.
  ["verify-customer-tab-bar-position-and-data-dot", "scripts/verify-customer-tab-bar-position-and-data-dot.mjs"],
  // B4/ROUND 21.2 (owner, 2026-09-12) — relationship-health-score honesty for the 1-4-of-5-signals case.
  ["verify-customer-relationship-score-partial-honesty", "scripts/verify-customer-relationship-score-partial-honesty.mjs"],
  // ROUND 23.3 DELTA (owner, 2026-09-13) — every live Faro invoice line must carry a real load_id.
  ["verify-faro-invoice-lines-load-linkage", "scripts/verify-faro-invoice-lines-load-linkage.mjs"],
  // ROUND 23.3 (owner/Lead, 2026-09-13) — B1 fuel absorption: 171 fuel_purchases rows ->
  // 171 fuel.fuel_transactions rows, $110,072.33, 0 DEF rows, disclosed corrections intact.
  ["verify-fuel-transactions-per-load", "scripts/verify-fuel-transactions-per-load.mjs"],
  // ROUND 23.3 (owner/Lead, 2026-09-13) — B1 second half: every live Diesel-memo expense either
  // matches a fuel.fuel_transactions row or is voided ABSORPTION-D5.
  // P0-A (Lead ruling, 2026-09-22) — IFTA taxable-gallon base must never include DEF (not a motor
  // fuel) or reefer_diesel (undetermined tank source, no receipt evidence). Static + live
  // deliberate-failure proof.
  ["verify-ifta-excludes-non-highway-fuel-types", "scripts/verify-ifta-excludes-non-highway-fuel-types.mjs"],
  // ROUND 23.3 DELTA (owner, 2026-09-13) — Part C unified dispute window: dispute exists for
  // every Faro-vs-face variance (both directions) + zero null load_id in faro_invoice_lines.
  ["verify-dispute-window-unified", "scripts/verify-dispute-window-unified.mjs"],
  // ROUND 23.3 B6 (owner, 2026-09-13) — every live driver bill whose load carries a settlement
  // is linked via settled_in_settlement_id; unlinked-because-no-settlement-yet is a B5 gap, not B6.
  ["verify-driver-bill-settlement-link", "scripts/verify-driver-bill-settlement-link.mjs"],
  // FEED-PARITY-01 (docs/manuals/04-RULING-FEED-PARITY-..., owner, 2026-09-22, LANE_CROSS —
  // docs/bus/LEAD-RULING-2026-09-22-CC3-FEED-PARITY-SHARED-CREATE-PATH-CROSS-LANE.md): ONE shared
  // load-create path (createLoadWithFullSideEffects); shrink-only ratchet on direct
  // `INSERT INTO mdata.loads` outside it, plus a by-symbol assertion the shared path still calls
  // every required INSERT/resolver/gate.
  ["verify-one-load-create-path", "scripts/verify-one-load-create-path.mjs"],
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
  ["verify-fuel-loves-prices-daily-table-and-report-guard", "scripts/verify-fuel-loves-prices-daily-table-and-report-guard.mjs"],
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
];

function touchesMoneyPath() {
  const res = spawnSync("git", ["diff", "--name-only", "origin/main...HEAD"], { cwd: ROOT, encoding: "utf8" });
  if ((res.status ?? 1) !== 0) return false;
  const files = (res.stdout || "").split("\n").filter(Boolean);
  const MONEY_PATH_RE = /^(apps\/backend\/src\/(accounting|banking|factoring|driver-finance|mdata)\/|db\/migrations\/)/;
  return files.some((f) => MONEY_PATH_RE.test(f));
}

function runNode(rel, extraEnv = {}) {
  const script = path.join(ROOT, rel);
  console.log(`[${LABEL}] RUN ${rel}`);
  const res = spawnSync(process.execPath, [script], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
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

// 03c — control totals against LIVE production. Skipped only when DATABASE_URL is absent AND this
// PR touches no money path (apps/backend/src/{accounting,banking,factoring,driver-finance,mdata}/**
// or db/migrations/**). Touching a money path with no DATABASE_URL is NOT a skip — the guard's own
// script refuses outright ("Refusing to pass a money gate that never ran"), which is correct: an
// operator working a money path must have prod access wired before this gate can pass.
if (process.env.DATABASE_URL || touchesMoneyPath()) {
  const code = runNode("scripts/verify-control-totals.mjs");
  if (code !== 0) {
    failStep("verify-control-totals (03c)");
    process.exit(code);
  }
} else {
  const msg = "verify-control-totals.mjs (03c) — no DATABASE_URL and no money path in this diff";
  console.log(`[${LABEL}] SKIP ${msg}`);
  skippedLiveChecks.push(msg);
}

// ROUND 23.3 SUPPLEMENT (owner/Lead, 2026-09-13) — the master AlwaysTrack parity guard, proves the
// WHOLE ingest chain against prod. P0 (2026-09-22): moved OUT of the unconditional STEPS array
// above (where it used to silently skip-pass with no DATABASE_URL, masking a real, pre-existing
// 34-of-34-document mismatch) and into this SAME conditional 03c already uses — a non-money push
// is never blocked by it; a money-relevant push with no DATABASE_URL correctly fails, never skips.
if (process.env.DATABASE_URL || touchesMoneyPath()) {
  const code = runNode("scripts/verify-alwaystrack-parity.mjs");
  if (code !== 0) {
    failStep("verify-alwaystrack-parity");
    process.exit(code);
  }
} else {
  const msg = "verify-alwaystrack-parity.mjs — no DATABASE_URL and no money path in this diff";
  console.log(`[${LABEL}] SKIP ${msg}`);
  skippedLiveChecks.push(msg);
}

// Lead ROUND 48 (2026-09-22): one fuel purchase, one posting. Moved out of the unconditional STEPS
// array, where it skip-passed without DATABASE_URL. fuel/ is not in touchesMoneyPath() but a fuel
// change is exactly what can post a second copy of a purchase, so this check keys on its own paths.
function touchesFuelOrExpensePath() {
  const res = spawnSync("git", ["diff", "--name-only", "origin/main...HEAD"], { cwd: ROOT, encoding: "utf8" });
  if ((res.status ?? 1) !== 0) return false;
  const files = (res.stdout || "").split("\n").filter(Boolean);
  const FUEL_EXPENSE_RE = /^(apps\/backend\/src\/(accounting|fuel)\/|db\/migrations\/)/;
  return files.some((f) => FUEL_EXPENSE_RE.test(f));
}
if (process.env.DATABASE_URL || touchesFuelOrExpensePath()) {
  const code = runNode("scripts/verify-diesel-expense-fuel-dedupe.mjs");
  if (code !== 0) {
    failStep("verify-diesel-expense-fuel-dedupe");
    process.exit(code);
  }
} else {
  const msg = "verify-diesel-expense-fuel-dedupe.mjs — no DATABASE_URL and no accounting/fuel/migration path in this diff";
  console.log(`[${LABEL}] SKIP ${msg}`);
  skippedLiveChecks.push(msg);
}

// Lead ruling 4-of-4 (2026-09-22) — shrink-only ceiling ratchet, baseline 76: USMCA
// fuel.fuel_transactions rows still carrying the raw Relay bridge token (transaction_reference LIKE
// 'txn_%') instead of a real, vendor-matched reference. Freezes growth, target 0. Same conditional
// shape as verify-alwaystrack-parity above (NOT the unconditional STEPS array) — this guard uses
// requireLiveDbOrExit() internally and fails closed whenever it actually runs (ROUND 29.9-B: a live
// money guard that cannot connect is a FAIL, never a pass), so it must only be forced to run when
// this push is money-relevant or a live DB is already available — putting a fail-closed guard in
// the unconditional STEPS array would make DATABASE_URL mandatory for every push in the repo,
// which would also compound the already-known, already-worsened verify-alwaystrack-parity block
// (docs/bus/OUTBOX-CC-1.md, 2026-09-23) onto pushes that have nothing to do with fuel.
if (process.env.DATABASE_URL || touchesMoneyPath()) {
  const code = runNode("scripts/verify-fuel-relay-txn-vendor-unmatched.mjs");
  if (code !== 0) {
    failStep("verify-fuel-relay-txn-vendor-unmatched");
    process.exit(code);
  }
} else {
  const msg = "verify-fuel-relay-txn-vendor-unmatched.mjs — no DATABASE_URL and no money path in this diff";
  console.log(`[${LABEL}] SKIP ${msg}`);
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
