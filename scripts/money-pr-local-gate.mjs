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
];

function runNode(rel) {
  const script = path.join(ROOT, rel);
  console.log(`[${LABEL}] RUN ${rel}`);
  const res = spawnSync(process.execPath, [script], {
    cwd: ROOT,
    encoding: "utf8",
    env: process.env,
  });
  const out = `${res.stdout ?? ""}${res.stderr ?? ""}`.trim();
  if (out) console.log(out);
  return res.status ?? 1;
}

if (process.argv.includes("--selftest")) {
  // Structural selftest only — behavioral coverage lives in verify-money-pr-local-gate.
  for (const [, rel] of STEPS) {
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
    console.error(
      `\n${LABEL}: FAIL — ${name} rejected this branch BEFORE push.\n` +
        `Fix the commit message / MODULE_PROGRESS / FINDING / lane band / CLAIMED / EntityLink baseline, then:\n` +
        `  node scripts/money-pr-local-gate.mjs\n` +
        `Then ONE push (hooks ON — never --no-verify). Do not rebase while CI is running (Rule 25 / Rule 29).\n`,
    );
    process.exit(code);
  }
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

console.log(
  `${LABEL}: PASS — DoD + money-theater + scoreboard serialize + §7 palette (fin+nonfin) + auth rateLimit + migration band + verify-step band + no-CLAIMED-edits + EntityLink + Rule 30 (no guard deletion + Claude-green LIVE PROOF) OK (fail-fast before CI)`,
);
process.exit(0);
