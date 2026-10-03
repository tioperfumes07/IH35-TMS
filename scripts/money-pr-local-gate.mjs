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
import { guardDbEnv } from "./lib/guard-db-url.mjs";
import { guardIsInScope } from "./verify-static.mjs";
import { EMPTY_BY_PURGE_EXIT, PURGE_WINDOW_GUARDS, purgeWindow } from "./lib/purge-window.mjs";
import { dataWritePathDiffActuallyWrites, dataWritePathFileActuallyWrites } from "./lib/data-write-path-detection.mjs";
import { localDatabaseGuardArgs, requiresLocalDatabase } from "./lib/local-db-guard-routing.mjs";
import { reportedSkip, formatLocalOutcomes } from "./lib/run-required-guards.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "money-pr-local-gate";

// ROUND 240 — R224 GATE-SCOPE accounting mount-only skip allowlist is SHRINK-ONLY.
// Source: scripts/lib/r224-gate-exception-sets.baseline.json
// (ratchet: verify-gate-exception-sets-never-grow). bank-recon/ prefix is pre-R224 and separate.
const R224_ACCOUNTING_LIVE_DOMAIN_SKIP = new Set(
  (
    JSON.parse(
      fs.readFileSync(
        path.join(ROOT, "scripts/lib/r224-gate-exception-sets.baseline.json"),
        "utf8",
      ),
    ).r224_accounting_live_domain_skip ?? []
  ).map(String),
);

/** Ordered fail-fast suite — same classes that red'd Cursor #4009–#4011 / #4198 vs Claude. */
const STEPS = [
  // AUTH-105 condition (Lead ruling, docs/bus/00-LEAD-AUTH-105-STALE-LOAD-STATUS-SYNC.md,
  // 2026-09-28) — closing a settlement with a sent invoice must leave the load's status advanced,
  // asserted AT CLOSE/SEND TIME by source-wiring, not swept up later by a one-shot. Pure static
  // text check, no DB.
  ["verify-settlement-close-advances-load-status", "scripts/verify-settlement-close-advances-load-status.mjs"],
  // ROUND 203/205 (owner, 2026-09-28) — "white background, wrong contrast... tokens for surface/
  // border/text." TruckLineBoard.tsx had drifted off the LOCKED GLOBAL-TYPE-SIZE-BASELINE.md
  // surface/border/text palette; this asserts the retired values never reappear and the file
  // stays wired to the shared locked-baseline-tokens module. Pure static text check, no DB.
  ["verify-truck-line-surface-tokens-locked", "scripts/verify-truck-line-surface-tokens-locked.mjs"],
  // DB-F01/ACCT-F155.3 — a hand-rolled script that sets app.bypass_rls SESSION-scoped (is_local=false,
  // or a bare SET, not SET LOCAL inside an explicit BEGIN) silently loses RLS scope between statements
  // on Neon's pooled connection string. Same read went 3 -> 49 phantom failures between two runs with
  // identical inputs (ROUND 155.2, 2026-09-28) before this was wired in. Shrink-only baseline for the
  // 44 pre-existing offenders; a brand-new one is a hard FAIL.
  ["verify-no-session-scoped-rls-bypass", "scripts/verify-no-session-scoped-rls-bypass.mjs"],
  // ROUND 155.23 — the per-load Pre-Settlement/tour tab must group by tour_id only (never
  // driver_id/unit_id) and must never mix a closed load into an open settlement's legs/totals.
  // Static source-shape check; the live proof (13609/13614/13639) lives in the round's own PR.
  ["verify-presettlement-shows-only-this-load-and-its-open-tour", "scripts/verify-presettlement-shows-only-this-load-and-its-open-tour.mjs"],
  // ROUND 155.23/157-A item 6 — static sweep: no driver-finance write path may link a load into a
  // settlement/tour (presettlement_link_id) without a tour_id check nearby.
  ["verify-tour-groups-by-tour-id-only", "scripts/verify-tour-groups-by-tour-id-only.mjs"],
  ["verify-no-posting-to-inactive-account", "scripts/verify-no-posting-to-inactive-account.mjs"],
  ["verify-expense-item-lines", "scripts/verify-expense-item-lines.mjs"],
  ["verify-account-number-hidden-by-default", "scripts/verify-account-number-hidden-by-default.mjs"],
  ["verify-definition-of-done-evidence", "scripts/verify-definition-of-done-evidence.mjs"],
  // FILTER-MULTI-01 — every registered money list (registry, not whole-tree) has one always-visible
  // toolbar, no dead popover, at least one real multi-select, no duplicate search/range. Pure static
  // text analysis, no DB.
  ["verify-money-list-toolbar-one-and-multiselect", "scripts/verify-money-list-toolbar-one-and-multiselect.mjs"],
  // GATE-SCOPE-01 — proves this very file's LIVE_DOMAIN_GUARDS loop runs a guard only when its
  // own declared domain is touched, never merely because DATABASE_URL happens to be set.
  ["verify-live-domain-guards-are-diff-scoped", "scripts/verify-live-domain-guards-are-diff-scoped.mjs"],
  // GATE-SCOPE-02 — the other half: proves a DATA_WRITE_PATHS path match also requires the file to
  // actually write to a database (content-checked), not just sit under db/migrations/ or
  // scripts/ops/.
  ["verify-data-write-path-detection-is-content-based", "scripts/verify-data-write-path-detection-is-content-based.mjs"],
  // 2026-10-02 — #23954 squash-merged conflict markers into a backend route file; every deploy after it failed.
  ["verify-no-merge-conflict-markers", "scripts/verify-no-merge-conflict-markers.mjs"],
  // THE LINKAGE LAW, ENFORCED. Every path that writes a journal entry or posting must be declared with
  // the stamps it carries and the engine that reverses it. A new, undeclared money writer fails the
  // push; a lost linkage stamp fails the push. Replaces writing a 359th one-off linkage guard.
  ["verify-money-engine-linkage", "scripts/verify-money-engine-linkage.mjs"],
  // 2026-10-02 — handlers returning undefined after requireAuth sent the 401 double-sent every unauthenticated reply.
  ["verify-requireauth-returns-reply", "scripts/verify-requireauth-returns-reply.mjs"],
  // CC-3 2b — the full-enum load-status table and the canonical dispatch machine must agree on every cross-bucket edge.
  ["verify-load-status-machines-agree", "scripts/verify-load-status-machines-agree.mjs"],
  // CC-3 2g — loaded_miles is derived (shortest > 0, else practical); every miles writer recomputes it.
  ["verify-loaded-miles-derived", "scripts/verify-loaded-miles-derived.mjs"],
  // CC-3 2b/6 — every mdata.loads.status write is compare-and-set (no writer overwrites a newer status).
  ["verify-load-status-writers-cas", "scripts/verify-load-status-writers-cas.mjs"],
  // ROUND 326.5 owner design law — boards built on the tokens: no off-token hex, 34/40/44/132/120 sizes, no column borders, KPI rows across.
  ["verify-design-token-parity", "scripts/verify-design-token-parity.mjs"],
  ["verify-dispatch-date-boxes", "scripts/verify-dispatch-date-boxes.mjs"],
  ["verify-dispatch-missing-is-em-dash", "scripts/verify-dispatch-missing-is-em-dash.mjs"],
  ["verify-dispatch-tables-board-appearance", "scripts/verify-dispatch-tables-board-appearance.mjs"],
  ["verify-scheduled-engine-idempotency-header", "scripts/verify-scheduled-engine-idempotency-header.mjs"],
  ["verify-unit-stop-events-no-clipped-starts", "scripts/verify-unit-stop-events-no-clipped-starts.mjs"],
  // ROUND 345 block — money lines reference only their own company (composite same-entity FKs).
  ["verify-money-lines-same-entity-fks", "scripts/verify-money-lines-same-entity-fks.mjs"],
  // ROUND 353 — a load becomes cancelled only through an approved cancellation record (13515 route closed).
  ["verify-cancelled-load-has-cancellation-record", "scripts/verify-cancelled-load-has-cancellation-record.mjs"],
  // Standing order 2026-10-03 — invoice postings carry their spine link; no live posting loses its last link.
  ["verify-invoice-postings-carry-spine-link", "scripts/verify-invoice-postings-carry-spine-link.mjs"],
  // Dispatch D3 — every dispatch-module table audited + RLS forced.
  ["verify-dispatch-tables-audited-and-rls-forced", "scripts/verify-dispatch-tables-audited-and-rls-forced.mjs"],
  // Lead 2026-10-03 — guards read the direct endpoint, never as ih35_app (pooled SET ROLE leak).
  ["verify-guards-do-not-run-as-ih35_app", "scripts/verify-guards-do-not-run-as-ih35_app.mjs"],
  // ROUND 363-CC3-B / LAW 363.9 — a bank-line send-back keeps the match and records the release beside it.
  ["verify-send-back-preserves-the-match-and-its-load", "scripts/verify-send-back-preserves-the-match-and-its-load.mjs"],
  // ROUND 363-CC3-A / LAW 363.2 — a load-born posting or document is refused without its load; reversals walk to it.
  ["verify-every-load-born-document-and-posting-traces-to-its-load", "scripts/verify-every-load-born-document-and-posting-traces-to-its-load.mjs"],
  ["verify-no-session-advisory-locks", "scripts/verify-no-session-advisory-locks.mjs"],
  ["verify-rollup-keys-carry-company", "scripts/verify-rollup-keys-carry-company.mjs"],
  ["verify-filter-surfaces-full-set", "scripts/verify-filter-surfaces-full-set.mjs"],
  ["verify-variant-duplicate-candidates", "scripts/verify-variant-duplicate-candidates.mjs"],
  ["verify-recon-payee-never-ledger-account", "scripts/verify-recon-payee-never-ledger-account.mjs"],
  ["verify-one-open-invoice-definition", "scripts/verify-one-open-invoice-definition.mjs"],
  ["verify-party-tab-drills-and-reverse", "scripts/verify-party-tab-drills-and-reverse.mjs"],
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
  // B10 (Devin sweep, 2026-09-28) — no withCurrentUser(...) callback manages its own nested
  // BEGIN/COMMIT/ROLLBACK; withCurrentUser already owns the transaction.
  ["verify-no-nested-transactions-in-withcurrentuser", "scripts/verify-no-nested-transactions-in-withcurrentuser.mjs"],
  // B9 (Devin sweep, 2026-09-28) — named regression test: both accounting.bills paid_cents UPDATE
  // sites stay entity-scoped and rowCount-checked.
  ["verify-money-updates-are-entity-scoped-and-checked", "scripts/verify-money-updates-are-entity-scoped-and-checked.mjs"],
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
  // DEVIN-B — seat distance from main. A branch too far from main is the
  // class of defect that caused tonight's session. Static git guard, no DB.
  ["verify-seat-distance-from-main", "scripts/verify-seat-distance-from-main.mjs"],
  // ROUND 181 (DEVIN-B) — no auto-generated account numbers. Owner law: no auto
  // numbers without written owner approval. Static + live count (shrink-only).
  ["verify-no-auto-generated-account-numbers", "scripts/verify-no-auto-generated-account-numbers.mjs"],
  // ROUND 181.1 (DEVIN-B) — Samsara map one-to-many. Owner order: one driver can have
  // multiple Samsara accounts. Map table is canonical; legacy column is read-only.
  ["verify-driver-samsara-map-one-to-many", "scripts/verify-driver-samsara-map-one-to-many.mjs"],
  // ROUND 280.14 (owner order, 2026-09-30) — "every status change must carry an audit event. A
  // status with no audit row is a defect." Discovered live: loads leaving 'cancelled' with zero
  // events.event_log rows recording the transition -- a real write with no script, no audit row,
  // no actor. Shrink-only ratchet on this precise, zero-false-positive signal.
  ["verify-load-status-has-audit-event", "scripts/verify-load-status-has-audit-event.mjs"],
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
  ["verify-transaction-linkage-law", "scripts/verify-transaction-linkage-law.mjs"],
  ["verify-inventory-vendor-historical-label-resolver", "scripts/verify-inventory-vendor-historical-label-resolver.mjs"],
  ["verify-dispatch-driver-historical-label-resolver", "scripts/verify-dispatch-driver-historical-label-resolver.mjs"],
  ["verify-border-crossing-cbp-wait-cache-rls", "scripts/verify-border-crossing-cbp-wait-cache-rls.mjs"],
  ["verify-dispatch-trip-pairing-expenses-endpoint-404", "scripts/verify-dispatch-trip-pairing-expenses-endpoint-404.mjs"],
  ["verify-dispatch-load-status-filter-enum-mismatch-400", "scripts/verify-dispatch-load-status-filter-enum-mismatch-400.mjs"],
  ["verify-dispatch-overview-derived-actions", "scripts/verify-dispatch-overview-derived-actions.mjs"],
  ["verify-driver-profile-dqf-kpi-actions", "scripts/verify-driver-profile-dqf-kpi-actions.mjs"],
  ["verify-bill-payment-print-letter-html", "scripts/verify-bill-payment-print-letter-html.mjs"],
  ["verify-bill-payment-overpay-creates-vendor-credit", "scripts/verify-bill-payment-overpay-creates-vendor-credit.mjs"],
  ["verify-r342-entity-code-company-scoped", "scripts/verify-r342-entity-code-company-scoped.mjs"],
  ["verify-r342-factor-reserve-oci-field", "scripts/verify-r342-factor-reserve-oci-field.mjs"],
  ["verify-r342-dual-scoped-factoring-reads", "scripts/verify-r342-dual-scoped-factoring-reads.mjs"],
  ["verify-r342-dual-scoped-insurance-reads", "scripts/verify-r342-dual-scoped-insurance-reads.mjs"],
  ["verify-r3421-unit-plates-identity-user-company-scoped", "scripts/verify-r3421-unit-plates-identity-user-company-scoped.mjs"],
  ["verify-account-register-ref-no-journal-entry-link", "scripts/verify-account-register-ref-no-journal-entry-link.mjs"],
  ["verify-money-detail-page-uses-ispending", "scripts/verify-money-detail-page-uses-ispending.mjs"],
  ["verify-lists-accounting-picker-law-honest", "scripts/verify-lists-accounting-picker-law-honest.mjs"],
  ["verify-lst-picker01-account-drawer-detail-type-inline-create", "scripts/verify-lst-picker01-account-drawer-detail-type-inline-create.mjs"],
  ["verify-safety-accident-reverse-deep-link", "scripts/verify-safety-accident-reverse-deep-link.mjs"],
  ["verify-safety-training-record-canonical-routes", "scripts/verify-safety-training-record-canonical-routes.mjs"],
  ["verify-safety-event-detail-list-fallback", "scripts/verify-safety-event-detail-list-fallback.mjs"],
  ["verify-factoring-outstanding-liability-honest-label", "scripts/verify-factoring-outstanding-liability-honest-label.mjs"],
  // ROUND 355 R-3 — factoring fees are financing costs under 6810, never Bank Charges. Ceiling 0.
  ["verify-factoring-fees-are-financing-costs", "scripts/verify-factoring-fees-are-financing-costs.mjs"],
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
  // 03e-R224 — ROUND 240 shrink-only ratchet on the two R224 gate loosenings (13622/13624
  // load-to-cash exceptions + accounting mount-only LIVE_DOMAIN skip allowlist). Static.
  ["verify-gate-exception-sets-never-grow (03e-R224)", "scripts/verify-gate-exception-sets-never-grow.mjs", {}],
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
    "verify-bill-payment-overpay-creates-vendor-credit",
    [
      "apps/backend/src/accounting/vendor-bill-payments.routes.ts",
      "apps/backend/src/accounting/checks/checks.routes.ts",
      "apps/backend/src/accounting/posting-engine.service.ts",
      "apps/frontend/src/components/checks/WriteCheckForm.tsx",
      "db/migrations/202615292200_vendor_credits_source_bill_payment_id.sql",
    ],
  ],
  [
    "verify-r342-entity-code-company-scoped",
    [
      "db/migrations/202615312200_r342_entity_code_company_scoped.sql",
      "scripts/verify-r342-entity-code-company-scoped.mjs",
    ],
  ],
  [
    "verify-r342-factor-reserve-oci-field",
    [
      "apps/backend/src/factoring/reserve.service.ts",
      "apps/frontend/src/api/factoring.ts",
      "scripts/verify-r342-factor-reserve-oci-field.mjs",
    ],
  ],
  [
    "verify-r342-dual-scoped-factoring-reads",
    [
      "apps/backend/src/factoring/batch.service.ts",
      "apps/backend/src/factoring/bank-match.service.ts",
      "apps/backend/src/factoring/factor.service.ts",
      "apps/backend/src/factoring/submission-queue.service.ts",
      "apps/backend/src/factoring/factoring-kpi.service.ts",
      "apps/backend/src/factoring/company-scope.ts",
      "scripts/verify-r342-dual-scoped-factoring-reads.mjs",
    ],
  ],
  [
    "verify-r342-dual-scoped-insurance-reads",
    [
      "apps/backend/src/insurance/",
      "scripts/verify-r342-dual-scoped-insurance-reads.mjs",
    ],
  ],
  [
    "verify-r3421-unit-plates-identity-user-company-scoped",
    [
      "db/migrations/202615312300_r3421_unit_plates_identity_user_company_scoped.sql",
      "scripts/verify-r3421-unit-plates-identity-user-company-scoped.mjs",
    ],
  ],

  // ROUND 355 R-3 — factoring fee/interest accounts must parent under 6810 (6405 under 6400); never Bank Charges; 6820 stays dead.
  [
    "verify-factoring-fees-are-financing-costs",
    [
      "scripts/verify-factoring-fees-are-financing-costs.mjs",
      "apps/backend/src/catalogs/accounts.routes.ts",
      "apps/backend/src/factoring/",
    ],
  ],
  // RECLASSIFY (Lead 2026-10-01, QBO spec §24) — every applied reclassify line is carried by a RECLASSIFICATION JE pair; WORM on postings.
  ["verify-reclassify-batches-are-whole", ["apps/backend/src/accounting/reclassify/", "apps/backend/src/accounting/journal-entries.service.ts"]],
  ["verify-feed-gate-blocks-incomplete", ["apps/backend/src/driver-finance/feed-gate/", "apps/backend/src/settlements/approval.service.ts", "db/migrations/202615170400_feed_gate_intakes.sql"]],
  // E-41 (Lead 2026-10-01) — every engine-status catalog probe names a live relation + columns.
  // Runs when the catalog or any migration changes (a migration can rename the column a probe reads).
  ["verify-engine-catalog-probes-exist", ["apps/backend/src/system/engine-status.catalog.ts", "db/migrations/"]],
  // ROUND 166 JOB 2 — a non-void driver bill with $0 gross, OR null/zero miles, OR null/zero rate,
  // fails. Three different failure shapes caught by one comprehensive check.
  [
    "verify-driver-bill-has-miles-and-rate",
    ["apps/backend/src/dispatch/book-load.service.ts", "apps/backend/src/driver-finance/void-open-driver-bill.service.ts"],
  ],
  // ROUND 166 JOB 3 — a load whose number falls outside the sanctioned 13xxx series (and isn't
  // cancelled) fails. Catches the next "invent a load to hold an orphan invoice" shortcut.
  ["verify-no-fabricated-load-numbers", ["apps/backend/src/dispatch/", "apps/backend/src/accounting/from-load.ts"]],
  // ROUND 177 JOB 1 / ROUND 255 — Truck Line, List/Kanban, and Load Costs must agree exactly
  // on the canonical active-load set (CURRENT helper now aliases canonical).
  [
    "verify-load-boards-agree",
    [
      "apps/backend/src/dispatch/canonical-active-load-set.ts",
      "apps/backend/src/dispatch/current-truck-line-load.ts",
      "apps/backend/src/dispatch/truck-line/truck-line.routes.ts",
      "apps/backend/src/accounting/load-costs-board.routes.ts",
      "apps/backend/src/dispatch/live-loads-view.ts",
    ],
  ],
  // ROUND 255 — Truck Line board row count equals canonical active set; column order + return trip.
  [
    "verify-truck-line-board-shows-canonical-active-set",
    [
      "apps/backend/src/dispatch/canonical-active-load-set.ts",
      "apps/backend/src/dispatch/current-truck-line-load.ts",
      "apps/backend/src/dispatch/truck-line/truck-line.routes.ts",
      "apps/frontend/src/pages/dispatch/TruckLineBoard.tsx",
    ],
  ],
  // ROUND 177 JOB 3 — the current 16-load batch's invoices must keep issue_date=due_date=
  // delivery_date (the delivery-date-invoicing policy, not net-30); any of them that IS sent/
  // partial must show that same due_date in the real cash-flow rolling ledger.
  [
    "verify-cash-flow-reads-delivery-date",
    ["apps/backend/src/cash-flow/cash-flow.service.ts", "apps/backend/src/accounting/from-load.ts"],
  ],
  // ROUND 185 — a banking.reconciliation_matches row with no real "accept handler" audit event
  // (audit.audit_events, event_class='bank_match.accepted') fails. audit.row_changes' own trigger
  // reads a session var withLuciaBypass never sets, so it can't tell a real accept from a raw
  // INSERT (100% of 680 existing rows showed changed_by_user_id NULL regardless of path) -- this
  // is the real signal, and it's what makes the Lead's 207-rows-outside-the-handler incident
  // impossible to repeat.
  [
    "verify-no-match-persisted-outside-accept-handler",
    ["apps/backend/src/accounting/bank-recon/match.service.ts"],
  ],
  // P0 (owner, real-money finding) — 44 factoring advances (FAC-2026-00047..00090) had their real
  // advance amount posted into the wire-fee GL leg instead of the ~$10 real wire fee; $174,666.12
  // gross across 71 lines, netting to ~$230 via 48 later reversals (which is why the trial balance
  // still squared and it was never caught). poster.service.ts itself is verified correct and never
  // regressed; the bad value came from an uncommitted one-time script. Every live (non-reversed,
  // non-voided) factoring advance's posted legs must equal its own header fields.
  [
    "verify-factoring-posting-legs-match-header",
    ["apps/backend/src/accounting/factoring-posting/poster.service.ts", "apps/backend/src/factoring/faro-csv-import.ts"],
  ],
  // Owner ruling 2026-10-02 — each Faro reserve role is bound to its Faro bank account's GL (escrow -> Faro Escrow
  // Reserve, cash -> Faro Cash Reserve); 1230 Factoring Reserves has nothing to do with them.
  [
    "verify-factor-reserve-roles-match-faro-bank-accounts",
    [
      "db/migrations/202615220600_factor_escrow_reserve_role_to_1236.sql",
      "db/migrations/202615220800_faro_one_reserve_1230_interest_payable_transaction_fees.sql",
      "db/migrations/202615230600_faro_restore_cash_reserve_1235.sql",
      "apps/backend/src/accounting/factoring-posting/",
      "apps/backend/src/factoring/",
      "apps/backend/src/accounting/coa-roles/",
      "scripts/verify-factor-reserve-roles-match-faro-bank-accounts.mjs",
    ],
  ],
  // OWNER LAW 2026-10-02 competing-engine audit — one factoring purchase engine; legacy create / Mark Advanced /
  // release / batch submit / Faro CSV commit retired at their call sites; void delegates to voidPurchase.
  [
    "verify-one-factoring-purchase-engine",
    [
      "apps/backend/src/factoring/",
      "apps/backend/src/accounting/factoring-advances.routes.ts",
      "apps/backend/src/accounting/factoring-posting/",
      "apps/frontend/src/pages/factoring/",
      "apps/frontend/src/pages/accounting/Factoring",
      "apps/frontend/src/components/dispatch/tabs/FactoringTab.tsx",
      "apps/frontend/src/routes/manifest.tsx",
      "scripts/verify-one-factoring-purchase-engine.mjs",
    ],
  ],
  // OWNER LAW 2026-10-02 competing-engine audit (banking) — a bank line's journal entry is written in the same
  // transaction as its categorization; the poster keeps the matched-document interlock.
  [
    "verify-bank-line-posts-in-same-transaction",
    [
      "apps/backend/src/banking/bank-feed-gl-posting.service.ts",
      "apps/backend/src/banking/categorization.routes.ts",
      "apps/backend/src/banking/obligation-reconcile.routes.ts",
      "scripts/verify-bank-line-posts-in-same-transaction.mjs",
    ],
  ],
  // OWNER RULING 2026-10-02 (fuel cards are bank accounts) — a fill never posts at import; it posts when its card bank
  // line is matched in Banking (postFuelExpenseOnClient); relay posted_to_gl is derived, never hand-set.
  [
    "verify-fuel-posts-only-on-bank-match",
    [
      "apps/backend/src/accounting/fuel-posting/",
      "apps/backend/src/accounting/bank-recon/",
      "apps/backend/src/fuel/",
      "apps/backend/src/integrations/relay-payments/",
      "apps/backend/src/feed/",
      "scripts/verify-fuel-posts-only-on-bank-match.mjs",
    ],
  ],
  // ROUND 301 Cursor independent engine audit — safety reminders cron under withLuciaBypass must never
  // UPDATE/INSERT compliance_reminders without an operating_company_id predicate (USMCA only; TRANSP/TRK frozen).
  [
    "verify-safety-reminders-cron-usmca-scoped",
    [
      "apps/backend/src/safety/reminders.cron.ts",
      "scripts/verify-safety-reminders-cron-usmca-scoped.mjs",
    ],
  ],
  // ROUND 301 follow-up — CONFIRMED F-RETRY scheduled writers: business-key idempotency on double tick.
  [
    "verify-f-retry-scheduled-writers-idempotent",
    [
      "apps/backend/src/banking/drift-alerts.service.ts",
      "apps/backend/src/cron/depreciation-autopost.cron.ts",
      "apps/backend/src/compliance/compliance-reminder.job.ts",
      "apps/backend/src/reconciliation/ledger-integrity-detectors.service.ts",
      "apps/backend/src/cron/samsara-hos-pull.cron.ts",
      "scripts/verify-f-retry-scheduled-writers-idempotent.mjs",
    ],
  ],
  // ROUND 288.2 — one match writer + one unmatch writer; fuel match must write JE same txn.
  [
    "verify-one-bank-match-writer-writes-je",
    [
      "apps/backend/src/accounting/bank-recon/",
      "apps/backend/src/banking/link-suggestions-actions.routes.ts",
      "apps/backend/src/banking/reconciliation.routes.ts",
      "apps/backend/src/banking/obligation-reconcile.routes.ts",
      "scripts/verify-one-bank-match-writer-writes-je.mjs",
    ],
  ],
  // Lead ROUND 296 §3 — the per-customer Faro reserve ties to GL 1230 + 1235 to the cent, drill included.
  [
    "verify-faro-reserve-by-customer-ties-to-gl",
    [
      "apps/backend/src/factoring/reserve-by-customer",
      "apps/backend/src/factoring/factoring-kpi.service.ts",
      "scripts/lib/print-reserve-by-customer.ts",
      "scripts/verify-faro-reserve-by-customer-ties-to-gl.mjs",
    ],
  ],
  // Lead ROUND 297 — one purchase-rate resolver (assignment -> company Faro agreement -> none + reason); one base.
  [
    "verify-one-purchase-rate-resolver",
    [
      "apps/backend/src/factoring/purchase-candidates.service.ts",
      "apps/backend/src/factoring/purchase.service.ts",
      "apps/backend/src/factoring/factor.service.ts",
      "apps/frontend/src/pages/factoring/FactoringCashFlowPanel.tsx",
      "scripts/verify-one-purchase-rate-resolver.mjs",
    ],
  ],
  // Lead ROUND 296/297 — money in a table cell is right-aligned with tabular figures (QBO_MONEY_CELL_CLASS), app-wide.
  ["verify-money-table-cells-aligned", ["apps/frontend/src/", "scripts/verify-money-table-cells-aligned.mjs"]],
  // Lead ROUND 296 / 297 — day 95 asks the owner; no nightly accrual, no auto-recourse, no money on decide.
  [
    "verify-day95-asks-never-recourses",
    [
      "apps/backend/src/cron/factoring-default-interest-accrual.cron.ts",
      "apps/backend/src/accounting/factoring-posting/default-interest.service.ts",
      "apps/backend/src/factoring/repurchase-due.service.ts",
      "apps/backend/src/factoring/repurchase-due.routes.ts",
      "db/migrations/202615220700_factoring_repurchase_due_events.sql",
      "scripts/verify-day95-asks-never-recourses.mjs",
    ],
  ],
  // Lead ROUND 296 Correction 2 — Faro interest posts once at close with approval (DR 6830 / CR 2155); 2150 = open Net.
  [
    "verify-factoring-interest-at-close-2150-ties",
    [
      "apps/backend/src/factoring/interest-accrual.service.ts",
      "apps/backend/src/accounting/month-close.service.ts",
      "apps/backend/src/factoring/purchase.service.ts",
      "apps/backend/src/cron/",
      "db/migrations/202615240600_factoring_interest_accrual_runs.sql",
      "scripts/verify-factoring-interest-at-close-2150-ties.mjs",
    ],
  ],
  // BANK-F9341 — a bank-statement upload is idempotent (re-upload adds nothing; genuine identical rows still land).
  [
    "verify-csv-statement-upload-idempotent",
    [
      "apps/backend/src/banking/transaction-ingestion.ts",
      "apps/backend/src/banking/reconciliation.routes.ts",
      "scripts/verify-csv-statement-upload-idempotent.mjs",
    ],
  ],
  // Lead 2026-10-02 FARO-REPORTS-ARE-THE-BANK-FEED — the Faro reserve registers post only what each report line says.
  [
    "verify-faro-reserve-registers",
    [
      "apps/backend/src/factoring/faro-reserve-entries.service.ts",
      "apps/backend/src/factoring/faro-reserve-entries.routes.ts",
      "apps/backend/src/factoring/reserve-by-customer.service.ts",
      "apps/backend/src/factoring/factoring-spine-links.ts",
      "apps/backend/src/factoring/short-pay-resolution.service.ts",
      "db/migrations/202615280600_faro_short_pay_resolution.sql",
      "db/migrations/202615250600_faro_reserve_entries.sql",
      "scripts/verify-faro-reserve-registers.mjs",
    ],
  ],
  // Lead 2026-10-02 — a negative Faro Cash Reserve presents as Due to Faro (2156) at period end.
  [
    "verify-faro-cash-reserve-presents-as-payable",
    [
      "apps/backend/src/factoring/cash-reserve-reclass.service.ts",
      "apps/backend/src/accounting/month-close.service.ts",
      "db/migrations/202615260600_faro_cash_reserve_reclass.sql",
      "scripts/verify-faro-cash-reserve-presents-as-payable.mjs",
    ],
  ],
  // Owner ruling 2026-10-02 — identical same-day bank lines are flagged "possible duplicate", never removed.
  [
    "verify-bank-possible-duplicates-flagged-never-removed",
    [
      "apps/backend/src/banking/categorization.routes.ts",
      "apps/frontend/src/pages/banking/BankTxCategorizationPage.tsx",
      "scripts/verify-bank-possible-duplicates-flagged-never-removed.mjs",
    ],
  ],
  // ROUND 332.1 §4c — every CC-2 factoring money writer writes its spine link in the same transaction.
  [
    "verify-factoring-writers-write-the-spine",
    ["apps/backend/src/factoring/", "scripts/verify-factoring-writers-write-the-spine.mjs"],
  ],
  // ROUND 352 F-2 / F-3 — an asset holding money (1090 Undeposited Funds, 1295 Relay Fuel Wallet) never credit-balanced.
  [
    "verify-one-leg-asset-never-credit",
    ["db/migrations/202615330600_one_leg_asset_accounts_never_credit.sql", "apps/backend/src/accounting/fuel-posting/", "scripts/verify-one-leg-asset-never-credit.mjs"],
  ],
  // 10-02 queue item 5 / ROUND 353 — Relay fuel webhook: signed before parsed, lands through the pull's ingest path.
  [
    "verify-relay-fuel-webhook-receiver",
    ["apps/backend/src/integrations/relay-payments/", "apps/backend/src/index.ts", "scripts/verify-relay-fuel-webhook-receiver.mjs"],
  ],
  // ROUND 368.1 / 370 — the Reclassify balance inspector: the whole chart, and every list sums to its balance.
  [
    "verify-reclassify-list-sums-to-its-balance",
    ["apps/backend/src/accounting/reclassify/", "apps/frontend/src/pages/accounting/ReclassifyTransactionsPage.tsx", "apps/frontend/src/api/reclassify.ts", "db/migrations/202615360800_reclassify_moves_posted_expense_line_account_with_its_entry.sql", "scripts/verify-reclassify-list-sums-to-its-balance.mjs"],
  ],
  [
    "verify-reclassify-shows-every-coa-account-including-zero",
    ["apps/backend/src/accounting/reclassify/", "apps/frontend/src/pages/accounting/ReclassifyTransactionsPage.tsx", "apps/frontend/src/api/reclassify.ts", "db/migrations/202615360800_reclassify_moves_posted_expense_line_account_with_its_entry.sql", "scripts/verify-reclassify-shows-every-coa-account-including-zero.mjs"],
  ],
  // ROUND 367.1 / LAW 368.3 — two readers on one page agree: the Expenses grid returns every row its banner counts.
  [
    "verify-list-count-matches-its-own-banner-count",
    ["apps/frontend/src/pages/accounting/ExpensesListPage.tsx", "apps/backend/src/accounting/expenses.routes.ts", "scripts/verify-list-count-matches-its-own-banner-count.mjs"],
  ],
  // ROUND 368.2(b) — a bank line may not sit matched to nothing (deferred constraint triggers, both sides).
  [
    "verify-no-bank-line-is-matched-to-nothing",
    ["db/migrations/202615360600_bank_line_matched_to_nothing_refusal.sql", "apps/backend/src/banking/", "apps/backend/src/accounting/bank-recon/", "scripts/lib/bank-feed-state-machine.mjs", "scripts/verify-no-bank-line-is-matched-to-nothing.mjs"],
  ],
  // ROUND 360 — the bank feed state machine: three tabs, kind + live link, undo removes what it created, unmatch
  // breaks the link only (document back in the match pool), match posts nothing, every transition one transaction.
  [
    "verify-bank-line-buckets-are-the-three-tabs",
    ["db/migrations/202615350600_bank_feed_bucket_and_kind.sql", "apps/backend/src/banking/", "apps/backend/src/accounting/bank-recon/", "apps/backend/src/factoring/faro-reserve-entries.service.ts", "apps/backend/src/integrations/plaid/link.routes.ts", "scripts/lib/bank-feed-state-machine.mjs", "scripts/verify-bank-line-buckets-are-the-three-tabs.mjs"],
  ],
  [
    "verify-categorized-has-a-document",
    ["db/migrations/202615350600_bank_feed_bucket_and_kind.sql", "apps/backend/src/banking/", "apps/backend/src/accounting/bank-recon/", "apps/backend/src/factoring/faro-reserve-entries.service.ts", "apps/backend/src/integrations/plaid/link.routes.ts", "scripts/lib/bank-feed-state-machine.mjs", "scripts/verify-categorized-has-a-document.mjs"],
  ],
  [
    "verify-for-review-has-no-document",
    ["db/migrations/202615350600_bank_feed_bucket_and_kind.sql", "apps/backend/src/banking/", "apps/backend/src/accounting/bank-recon/", "apps/backend/src/factoring/faro-reserve-entries.service.ts", "apps/backend/src/integrations/plaid/link.routes.ts", "scripts/lib/bank-feed-state-machine.mjs", "scripts/verify-for-review-has-no-document.mjs"],
  ],
  [
    "verify-undo-leaves-no-document-behind",
    ["db/migrations/202615350600_bank_feed_bucket_and_kind.sql", "apps/backend/src/banking/", "apps/backend/src/accounting/bank-recon/", "apps/backend/src/factoring/faro-reserve-entries.service.ts", "apps/backend/src/integrations/plaid/link.routes.ts", "scripts/lib/bank-feed-state-machine.mjs", "scripts/verify-undo-leaves-no-document-behind.mjs"],
  ],
  [
    "verify-unmatched-document-is-matchable-again",
    ["db/migrations/202615350600_bank_feed_bucket_and_kind.sql", "apps/backend/src/banking/", "apps/backend/src/accounting/bank-recon/", "apps/backend/src/factoring/faro-reserve-entries.service.ts", "apps/backend/src/integrations/plaid/link.routes.ts", "scripts/lib/bank-feed-state-machine.mjs", "scripts/verify-unmatched-document-is-matchable-again.mjs"],
  ],
  [
    "verify-match-posts-nothing",
    ["db/migrations/202615350600_bank_feed_bucket_and_kind.sql", "apps/backend/src/banking/", "apps/backend/src/accounting/bank-recon/", "apps/backend/src/factoring/faro-reserve-entries.service.ts", "apps/backend/src/integrations/plaid/link.routes.ts", "scripts/lib/bank-feed-state-machine.mjs", "scripts/verify-match-posts-nothing.mjs"],
  ],
  [
    "verify-undo-is-single-transaction",
    ["db/migrations/202615350600_bank_feed_bucket_and_kind.sql", "apps/backend/src/banking/", "apps/backend/src/accounting/bank-recon/", "apps/backend/src/factoring/faro-reserve-entries.service.ts", "apps/backend/src/integrations/plaid/link.routes.ts", "scripts/lib/bank-feed-state-machine.mjs", "scripts/verify-undo-is-single-transaction.mjs"],
  ],
  // KILL THE SECOND SYSTEM — settlement deduction balance is derived from its settlement lines (CC-2).
  [
    "verify-settlement-deduction-balance-derived",
    ["db/migrations/", "apps/backend/src/driver-finance/", "apps/backend/src/accounting/settlement-posting/", "apps/backend/src/payroll/", "apps/backend/src/settlements/", "apps/backend/src/mdata/canonical/", "scripts/verify-settlement-deduction-balance-derived.mjs"],
  ],
  // Standing order point 9 — every CC-2 scheduled tick runs under a lease (withJobLease) or a named own claim.
  [
    "verify-cc2-crons-single-fire",
    ["apps/backend/src/lib/background-jobs.ts", "apps/backend/src/cron/", "apps/backend/src/banking/", "apps/backend/src/integrations/", "apps/backend/src/fuel/", "apps/backend/src/factoring/", "scripts/verify-cc2-crons-single-fire.mjs"],
  ],
  // CC-2 engine ten-point: WORM + audit on the fuel / Relay source tables, FORCE RLS on the derived fuel tables.
  [
    "verify-fuel-relay-source-worm",
    ["db/migrations/", "apps/backend/src/fuel/", "apps/backend/src/integrations/relay-payments/", "scripts/verify-fuel-relay-source-worm.mjs"],
  ],
  // Lead ruling ROUND 310: one Relay fill = one live row = one company (the unit's operator).
  [
    "verify-relay-fill-one-company",
    ["apps/backend/src/integrations/relay-payments/", "scripts/verify-relay-fill-one-company.mjs"],
  ],
  // Insurance guards that existed but were registered nowhere — they drifted red on main unnoticed (ROUND 342 rename).
  [
    "verify-insurance-claim-graph-complete-reverse",
    ["apps/backend/src/insurance/claim.routes.ts", "apps/frontend/src/pages/insurance/ClaimsTab.tsx", "scripts/verify-insurance-claim-graph-complete-reverse.mjs"],
  ],
  [
    "verify-insurance-lawsuit-update-truth",
    ["apps/backend/src/insurance/lawsuit.routes.ts", "scripts/verify-insurance-lawsuit-update-truth.mjs"],
  ],
  [
    "verify-insurance-payment-schedule-policy-company-link",
    ["apps/backend/src/insurance/payment-schedule.routes.ts", "scripts/verify-insurance-payment-schedule-policy-company-link.mjs"],
  ],
  // ROUND 355 R-2 — the fuel-card cap is gallons per unit (the unit's own tank); dollars are the last fallback.
  [
    "verify-fuel-overage-gallon-cap-per-unit",
    ["db/migrations/202615330700_fuel_overage_gallon_cap_per_unit.sql", "apps/backend/src/fuel/", "apps/backend/src/mdata/unit-update-schema.ts", "scripts/verify-fuel-overage-gallon-cap-per-unit.mjs"],
  ],
  // KPI engines' operator-facing strings (label / source / empty_reason / GL) in business language — runtime check.
  [
    "verify-kpi-provenance-business-language",
    ["apps/backend/src/factoring/factoring-kpi.service.ts", "apps/backend/src/banking/banking-kpi.service.ts", "scripts/verify-kpi-provenance-business-language.mjs"],
  ],
  // ROUND 335 item 2 — Banking home against the approved preview (engine-fed factoring + escrow cards, no dead links).
  [
    "verify-banking-home-preview-parity",
    ["apps/frontend/src/pages/banking/", "apps/frontend/src/pages/factoring/", "apps/frontend/src/pages/accounting/FactoringDetailPage.tsx", "scripts/verify-banking-home-preview-parity.mjs"],
  ],
  // ROUND 342 hotfix — no read filters a table on operating_company_id when that table has no such column.
  [
    "verify-no-opco-filter-on-tables-without-it",
    ["apps/backend/src/insurance/policy.routes.ts", "apps/backend/src/insurance/coverage-gap.service.ts", "scripts/verify-no-opco-filter-on-tables-without-it.mjs"],
  ],
  // ROUND 342 Phase 2 step 2a — operating_company_id complete + authoritative on the 17 double-scoped tables.
  [
    "verify-r342-opco-canonical-on-double-scoped",
    ["db/migrations/202615310700_r342_phase2a_expand_operating_company_id.sql", "scripts/verify-r342-opco-canonical-on-double-scoped.mjs"],
  ],
  // Standing order F-1 (CC-1) — a driver's escrow never releases more than it holds (named debt: the 3 purge-population drivers).
  [
    "verify-escrow-never-over-releases",
    ["db/migrations/", "apps/backend/src/driver-finance/", "apps/backend/src/settlements/", "apps/backend/src/accounting/escrow/", "scripts/verify-escrow-never-over-releases.mjs"],
  ],
  // ROUND 342 Phase 5 (CC-1) — one entity column: no tenant_id column / policy / equating CHECK outside the named debt.
  [
    "verify-one-entity-column",
    ["db/migrations/", "scripts/verify-one-entity-column.mjs"],
  ],
  // Lead 10-03 (CC-1) — no row escapes its company: zero NULL operating_company_id, run UNSCOPED (named debt: purge population).
  [
    "verify-no-row-escapes-its-company",
    ["db/migrations/", "apps/backend/src/accounting/", "apps/backend/src/dispatch/", "apps/backend/src/driver-finance/", "scripts/verify-no-row-escapes-its-company.mjs"],
  ],
  // ROUND 363-CC1-A (CC-1) — every posting carries the load its source document names, stamped by the poster.
  [
    "verify-every-load-born-posting-carries-its-load",
    ["db/migrations/", "apps/backend/src/accounting/", "scripts/verify-every-load-born-posting-carries-its-load.mjs"],
  ],
  // ROUND 363-CC1-B (CC-1) — a bill payment posts on its own transaction; unposted cash payments only shrink.
  [
    "verify-no-bill-payment-without-postings",
    ["db/migrations/", "apps/backend/src/accounting/", "apps/backend/src/banking/", "apps/backend/src/bill-payments/", "apps/backend/src/cash-advances/", "apps/backend/src/ap/", "scripts/verify-no-bill-payment-without-postings.mjs"],
  ],
  // ROUND 374 (CC-1) — a driver escrow GL balance is never below zero; the refusal is live and deferred.
  [
    "verify-driver-escrow-gl-never-negative",
    ["db/migrations/", "apps/backend/src/accounting/escrow/", "apps/backend/src/driver-finance/", "apps/backend/src/accounting/settlement-posting/", "scripts/verify-driver-escrow-gl-never-negative.mjs"],
  ],
  // ROUND 373.5 (CC-1) — no record points at another company's driver, unit or trailer; the refusal is live.
  [
    "verify-no-usmca-record-points-at-a-frozen-company",
    ["db/migrations/", "apps/backend/src/accounting/", "apps/backend/src/dispatch/", "apps/backend/src/driver-finance/", "apps/backend/src/fuel/", "apps/backend/src/maintenance/", "scripts/verify-no-usmca-record-points-at-a-frozen-company.mjs"],
  ],
  // ROUND 372.5 (CC-1) — settlement driver pay splits per load, to the cent, from the settlement's own arithmetic.
  [
    "verify-settlement-driver-pay-splits-per-load",
    ["apps/backend/src/driver-finance/", "apps/backend/src/accounting/", "db/migrations/", "scripts/verify-settlement-driver-pay-splits-per-load.mjs"],
  ],
  // Kill the second system (CC-1) — a driver escrow balance is the 2100-00-<nnn> GL balance, derived; no stored reader.
  [
    "verify-escrow-equals-its-gl",
    ["db/migrations/", "apps/backend/src/driver-finance/", "apps/backend/src/settlements/", "apps/backend/src/accounting/escrow/", "apps/backend/src/banking/", "apps/backend/src/mdata/canonical/", "apps/backend/src/master-data/", "scripts/verify-escrow-equals-its-gl.mjs"],
  ],
  // ROUND 342 Phase 4 — one scope column, one RLS policy on the factoring tables that carried a duplicate tenant policy.
  [
    "verify-factoring-one-scope-policy",
    ["db/migrations/202615310600_factoring_drop_duplicate_tenant_policies.sql", "apps/backend/src/factoring/factor.service.ts", "scripts/verify-factoring-one-scope-policy.mjs"],
  ],
  // ROUND 336 rule 7 — a factored invoice's amount is locked in the DB while its Faro purchase is open.
  [
    "verify-factored-invoice-amount-locked",
    ["db/migrations/202615300600_factored_invoice_amount_lock.sql", "apps/backend/src/factoring/factored-invoice-lock.routes.ts", "scripts/verify-factored-invoice-amount-locked.mjs"],
  ],
  // ROUND 326.2 items 3-4 — banking / factoring surfaces: every table tabular-nums, and Banking's
  // factoring reserve reads the factoring KPI engine (one reserve engine, no duplicate math).
  [
    "verify-banking-factoring-surfaces-standard",
    [
      "apps/frontend/src/pages/banking/",
      "apps/frontend/src/pages/factoring/",
      "apps/frontend/src/components/banking/",
      "apps/frontend/src/components/factoring/",
      "apps/frontend/src/components/parity/ParityTable.tsx",
      "apps/frontend/src/components/shared/LedgerKpiPanel.tsx",
      "scripts/verify-banking-factoring-surfaces-standard.mjs",
    ],
  ],
  // ROUND 326.2 items 1-2 — every factoring and banking KPI the engine serves is recomputed from the ledger with
  // independent SQL; any cent of drift, or a tile whose row_count != its drilldown rows, fails.
  [
    "verify-factoring-banking-kpis-tie-to-ledger",
    [
      "apps/backend/src/factoring/factoring-kpi",
      "apps/backend/src/banking/banking-kpi",
      "scripts/lib/print-factoring-kpis.ts",
      "scripts/lib/print-banking-kpis.ts",
      "scripts/verify-factoring-banking-kpis-tie-to-ledger.mjs",
    ],
  ],
  // ROUND 326 items 1-2 — canonical customers / vendors: duplicate normalized-name groups shrink-only per company,
  // the engine discovers every reference at run time, both profile surfaces return every block, and no open
  // invoice / bill resolves to a missing same-company customer / vendor.
  [
    "verify-canonical-customers",
    [
      "apps/backend/src/mdata/canonical/",
      "apps/frontend/src/components/customers/CustomerProfileOverview.tsx",
      "apps/frontend/src/pages/CustomerDetail.tsx",
      "scripts/verify-canonical-customers",
    ],
  ],
  // ROUND 326 item 3 — every active USMCA driver's whole profile returns all 17 blocks (value or named reason);
  // per-block empty counts are shrink-only (linkage only grows).
  [
    "verify-driver-profile-linkage",
    [
      "apps/backend/src/mdata/canonical/driver-profile.service.ts",
      "apps/frontend/src/components/driver-profile/DriverWholeProfile.tsx",
      "apps/frontend/src/pages/DriverDetail.tsx",
      "scripts/lib/print-driver-profiles.ts",
      "scripts/verify-driver-profile-linkage",
    ],
  ],
  // ROUND 326.5 — Customers / Vendors list boards: every tile and chip ties to an independent recompute.
  [
    "verify-party-boards-bound-live",
    [
      "apps/backend/src/mdata/canonical/party-board.service.ts",
      "apps/backend/src/mdata/canonical/driver-hub.service.ts",
      "apps/backend/src/mdata/canonical/driver-overview.service.ts",
      "apps/frontend/src/components/boards/",
      "apps/frontend/src/routes/manifest.tsx",
      "scripts/lib/print-party-boards.ts",
      "scripts/verify-party-boards-bound-live.mjs",
    ],
  ],
  // CC-3 item 11 — the telematics + geocode preservation ledger: natural keys, no FK, WORM, engine + cron, not lagging.
  [
    "verify-preserve-ledger",
    [
      "db/migrations/202615220900_preserve_telematics_geocode.sql",
      "apps/backend/src/telematics/preservation.service.ts",
      "apps/backend/src/cron/telematics-preservation.cron.ts",
      "scripts/verify-preserve-ledger.mjs",
    ],
  ],
  [
    "verify-canonical-vendors",
    [
      "apps/backend/src/mdata/canonical/",
      "apps/frontend/src/components/vendors/VendorProfileOverview.tsx",
      "apps/frontend/src/pages/VendorDetail.tsx",
      "scripts/verify-canonical-vendors",
    ],
  ],
  // ROUND 166 JOB 1(e) (P0) — the permanent alarm: fails when no USMCA unit has a fresh telematics
  // position during operating hours. USMCA's Samsara feed was off for weeks with zero stamps
  // accumulating and nobody noticed; this is the gate that catches the next silent death.
  [
    "verify-telematics-feed-is-live",
    ["apps/backend/src/integrations/samsara/", "apps/backend/src/telematics/", "apps/backend/src/cron/samsara-positions-cron.ts"],
  ],
  // ROUND 168 (P0, retraction) — Samsara was never the break; mdata.load_stops had no coordinates,
  // so the (healthy) geofence engine had nothing to compare a position against. Fails when any
  // dispatchable load has a stop with no lat/lng or a live geocode_failure_reason.
  [
    "verify-stops-are-geocoded",
    ["apps/backend/src/telematics/stop-geocode-fallback.service.ts", "apps/backend/src/telematics/stops-geocode-backfill.service.ts", "apps/backend/src/dispatch/loads.routes.ts"],
  ],
  // ROUND 168 JOB 2 — the permanent health check for the actual root cause: calls the same geocode
  // path a real stop uses against a known-good address, so "provider_unavailable" (nothing
  // configured/enabled) or any other provider failure raises loudly here instead of silently
  // producing hundreds of uncoordinated stops again.
  // ROUND 173 JOB 2 — 8 named dispatchable-load stops had no street address, sourced one by one
  // from signed rate confirmations. Pins those 8 stop ids so none of them regresses to NULL.
  [
    "verify-round173-8-stops-have-addresses",
    ["apps/backend/src/dispatch/loads.routes.ts", "scripts/ops/2026-09-28-round173-job2-fill-8-stop-addresses.mjs"],
  ],
  [
    "verify-geocode-provider-is-reachable",
    ["apps/backend/src/telematics/stop-geocode-fallback.service.ts", "apps/backend/src/integrations/google/google-places-client.ts"],
  ],
  // ROUND 163 JOB 1 (P0) — our issued-invoice total must tie to the QBO control file for its date
  // range, or the gate reports the exact delta (actionable/mismatched/unmatched broken out).
  [
    "verify-ar-ties-to-qbo-invoice-list",
    ["apps/backend/src/accounting/from-load.ts", "apps/backend/src/accounting/invoice-send.service.ts", "feed-input/qbo-invoice-list-2026-08-07-to-2026-09-27.csv"],
  ],
  // ROUND 155.23/157-A item 6 — a load whose first and last scheduled stop share the same city
  // while its own recorded miles exceed 100 is physically impossible and always means copied/
  // corrupted stop data (found live: 13614 and 6 other historical loads).
  [
    "verify-stop-lane-is-consistent-with-miles",
    ["apps/backend/src/dispatch/update-load.service.ts", "apps/backend/src/dispatch/book-load.service.ts"],
  ],
  // ROUND 155.20 JOB 2 / 157-A item 2 — a load frozen at an active status whose last scheduled
  // stop is 24h+ past with zero actual_arrival_at anywhere in its stops. Root cause diagnosed live:
  // USMCA's Samsara integration was disabled this entire time (see the guard's own header).
  [
    "verify-dispatched-load-has-stop-stamps",
    ["apps/backend/src/dispatch/stop-stamp.service.ts", "apps/backend/src/telematics/geofence-detector.service.ts", "apps/backend/src/cron/samsara-positions-cron.ts"],
  ],
  // ROUND 155.12 (Lead, 2026-09-28) — canonicalActiveLoadNotFinishedByMoneyCte treated an OPEN,
  // unsettled driver bill (raised AT DISPATCH) as "finished money", silently dropping every
  // freshly-dispatched load off every board. Live check: no load whose only money artifact is an
  // open/unsettled driver bill or an active line on a still-open settlement is excluded.
  [
    "verify-open-driver-bill-keeps-load-active",
    ["apps/backend/src/dispatch/canonical-active-load-set.ts"],
  ],
  // Claude-Lead 2026-09-26 — two LIVE guards that ran nowhere (verify-guard-wired orphans, neither in CI nor here).
  // Both LIVE PASS at wiring: 10 loads / 5 multi-load tours; 758 Samsara profiles, 0 structural problems.
  [
    "verify-load-cost-rollup-lateral-no-alias-shadow",
    ["apps/backend/src/accounting/load-cost-rollup", "apps/backend/src/accounting/load-unit-cost-split", "apps/backend/src/dispatch/"],
  ],
  [
    "verify-samsara-mapping-integrity",
    ["apps/backend/src/integrations/samsara/", "apps/backend/src/telematics/"],
  ],
  // ROUND 165 order 6 — seed-settlement-document.service.ts's expense writer. Both guards are
  // self-gated report-only via their own *.gate.json (blocking:false) until the Lead's R-164
  // (AUTH-021) data fix lands; this array only decides WHEN they run, not blocking vs report.
  [
    "verify-expense-line-account-matches-item",
    ["apps/backend/src/feed/", "scripts/verify-expense-line-account-matches-item.gate.json"],
  ],
  [
    "verify-no-fuel-purchase-booked-twice",
    ["apps/backend/src/feed/", "apps/backend/src/fuel/", "scripts/verify-no-fuel-purchase-booked-twice.gate.json"],
  ],
  [
    "verify-costs-are-expenses-not-handwritten-jes",
    [
      "scripts/verify-costs-are-expenses-not-handwritten-jes.mjs",
      "apps/backend/src/accounting/",
      "apps/backend/src/fuel/",
      "apps/backend/src/factoring/",
    ],
  ],
  // R-159.2 (Claude-Lead ruling) — a factoring lifecycle posting-key claim used to be permanent,
  // blocking any corrected re-post of a reversed event forever. Fixed with revision claims
  // ("<event_key>#revN", reversal_of); this guard is the live proof the mechanism stays correct.
  [
    "verify-factoring-event-one-live-claim",
    [
      "scripts/verify-factoring-event-one-live-claim.mjs",
      "apps/backend/src/accounting/factoring-posting/",
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
  // GATE-SCOPE B-1 (2026-10-01): whole apps/backend/src/accounting/ was too broad — the account
  // register read model (account-register.service) cannot create Faro variance / invoice disputes.
  // Keep data-infra + factoring + the dispute writers only (same pattern as driver-bill-settlement-link).
  [
    "verify-dispute-window-unified",
    [
      "apps/backend/src/data-infra/",
      "apps/backend/src/factoring/",
      "apps/backend/src/accounting/invoice-disputes",
      "apps/backend/src/accounting/disputes",
      "scripts/verify-dispute-window-unified.mjs",
    ],
  ],
  // ROUND 23.3 B6 — driver bills whose load already has a settlement must be linked.
  // Domain narrowed 2026-09-28 (GATE-SCOPE): whole apps/backend/src/accounting/ was too broad —
  // bank-recon MatchDrawer / accept-multi-match cannot create or clear settled_in_settlement_id.
  // Keep driver-finance + dispatch + settlement/from-load writers only.
  [
    "verify-driver-bill-settlement-link",
    [
      "apps/backend/src/driver-finance/",
      "apps/backend/src/dispatch/",
      "apps/backend/src/accounting/from-load.ts",
      "apps/backend/src/accounting/settlement",
      "apps/backend/src/accounting/driver-settlement",
      "scripts/verify-driver-bill-settlement-link.mjs",
    ],
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
  // 00-ROOT-CAUSE-THE-SPINE (CC-2): every posting with a live document carries its spine link (ceiling 0); postings
  // stranded by a purge (document deleted, GL kept) are a committed shrink-only ceiling that must net to zero.
  [
    "verify-every-posting-has-a-spine-link",
    [
      "apps/backend/src/accounting/posting-engine.service.ts",
      "apps/backend/src/accounting/void.service.ts",
      "apps/backend/src/accounting/accounting-spine-emit.ts",
      "scripts/ops/",
      "db/migrations/",
      "scripts/verify-every-posting-has-a-spine-link.mjs",
    ],
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
  // ROUND-290.3 (owner ruling, 2026-09-30): driver escrow is a liability to a NAMED driver, never
  // cash. Shrink-only baseline on the 16 pre-fix documents (corrected by document, per the ruling,
  // never by a blanket JE). Domain-conditional, same E7 pattern as the escrow-ledger-sign guard
  // directly above.
  [
    "verify-driver-escrow-counter-leg-is-clearing",
    [
      "apps/backend/src/accounting/escrow/",
      "apps/backend/src/driver-finance/escrow-forfeit.service.ts",
      "apps/backend/src/driver-finance/escrow-separation.service.ts",
      "scripts/verify-driver-escrow-counter-leg-is-clearing.baseline.json",
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
  // Writer: fuel-posting maybe-post buildFuelTxnJeMemo + poster default (never bare fuel UUID).
  // Shrink-only baseline for tip debt (Lead 2026-09-25). Live guard — fail-closed without DATABASE_URL.
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
      "scripts/verify-je-memo-is-human-readable.baseline.json",
    ],
  ],
  // ROUND E23 (DEVIN-B, Q01): a cost-of-revenue/expense JE (debiting 5xxx/6xxx) must have a
  // matching accounting.expenses row; a fuel/expense JE must NOT credit 1090/1100/1150.
  // RED fixture: 10 live fuel JEs crediting 1090 with bare-UUID memos, $7,250.20.
  // CC-2 owns the writer (R-153.6); CC-3 owns guard scope (R-153.7). Baseline 0 (shrink-only).
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
  // Domain narrowed 2026-09-28 (GATE-SCOPE): bank-recon MatchDrawer cannot create AR gaps,
  // missing mileage, or orphan expenses — do not block Match/Resolve PRs on feed tip debt.
  // ROUND 213 (owner ruling 2026-09-28): verify-purge-era-closures-still-hold is REPORT-ONLY.
  // It still runs (see GUARD_REPORT_ONLY below), still prints every arm and every number, but
  // no longer blocks unrelated work. The guard was written against the purge-era EMPTY book;
  // that book is gone. It now asserts a closed-books steady state against a system mid-build
  // and fires on normal operating data (proforma A/R, loads dispatched hours ago, $28 in test
  // expenses). Every other money guard stays a hard blocking gate. No baselines grow.
  // [
  //   "verify-purge-era-closures-still-hold",
  //   [
  //     "apps/backend/src/accounting/from-load.ts",
  //     "apps/backend/src/accounting/invoice",
  //     "apps/backend/src/accounting/expenses",
  //     "apps/backend/src/factoring/",
  //     "apps/backend/src/driver-finance/",
  //     "apps/backend/src/fuel/",
  //     "apps/backend/src/dispatch/",
  //     "scripts/verify-purge-era-closures-still-hold.mjs",
  //   ],
  // ],
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
  // ROUND 155.2c: dispatch.non_owned_trailers had two identical rows for trailer 538306 live —
  // migration 202614440000 added the missing unique index, this is the independent live proof
  // that invariant holds, same pattern as verify-no-driver-merge-without-hard-identifier above.
  [
    "verify-no-duplicate-non-owned-trailer",
    [
      "apps/backend/src/dispatch/trailer-interchange.routes.ts",
      "apps/backend/src/dispatch/trailer-interchange.service.ts",
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
  // ROUND 142.1 (DEVIN-B): the feed has no guard — arm it. Expected set derived from
  // scripts/feed/day_control.json (ROUND 153 item 5 — switched from the older prose manifest, see
  // the guard's own header), not hardcoded. Checks unstamped dates, duplicates, day mismatches,
  // sample data. Prints progress.
  [
    "verify-feed-is-whole",
    [
      "apps/backend/src/accounting/factoring/",
      "scripts/feed/day_control.json",
      "accounting.factoring_advances",
    ],
  ],
  // ROUND 142.1 (DEVIN-B): every variance_posted audit event resolves to a live JE. 7-day scoped (LAW 3).
  [
    "verify-no-audit-event-without-its-journal-entry",
    [
      "apps/backend/src/accounting/bank-recon/",
      "audit.audit_events",
      "accounting.journal_entries",
    ],
  ],
  // ROUND 142.3 (DEVIN-B) reconcile-feed-day is the per-DAY close gate: it REQUIRES a purchase-day argument
  // (node scripts/reconcile-feed-day.mjs 8/10/26) and is run by the day-close procedure for that day. Listed here it
  // was spawned with NO argument and failed "usage" on every in-scope push (Lead 2026-09-26) — it cannot run in this
  // zero-argument loop, so it is not listed; the whole-book control is verify-usmca-book-equals-faro-and-alwaystrack.
  // Lead AUTH-072 (2026-09-26): a settlement line is switched off only by voiding it (113 half-voids measured).
  [
    "verify-settlement-line-off-is-voided",
    ["apps/backend/src/driver-finance/", "apps/backend/src/settlements/", "driver_finance.settlement_lines"],
  ],
  // ROUND 143.2 (DEVIN-B): no document without a ledger. Derives document classes from live schema.
  // FAIL on any class where non-voided documents carry NO ledger. 7-day scoped (LAW 3).
  [
    "verify-no-document-without-a-ledger",
    [
      "apps/backend/src/accounting/",
      "apps/backend/src/factoring/",
      "apps/backend/src/fuel/",
      "apps/backend/src/driver-finance/",
      "accounting.journal_entry_postings",
      "accounting.expenses",
      "accounting.invoices",
      "accounting.factoring_advances",
      "fuel.fuel_transactions",
      "driver_finance.driver_bills",
    ],
  ],
  // ROUND 145.3 (DEVIN-B): fuel costs post exactly once. Fuel transactions NEVER post;
  // expenses post ONCE at creation; bank match NEVER posts again. 7-day scoped (LAW 3).
  [
    "verify-fuel-cost-posts-exactly-once",
    [
      // GATE-SCOPE 2026-09-28: do not list bank-recon/match.service.ts — Match Resolve cannot
      // create fuel_event JE tip debt; static accept-path check still lives inside this guard when
      // fuel/accounting fuel-posting paths change.
      "apps/backend/src/fuel/",
      "apps/backend/src/accounting/fuel-posting/",
      "scripts/verify-fuel-cost-posts-exactly-once.mjs",
      "accounting.expenses",
      "fuel.fuel_transactions",
      "accounting.journal_entry_postings",
      "catalogs.accounts",
    ],
  ],
  // ROUND 143.2 Item 2 (DEVIN-B): trial balance and balance sheet guard.
  // Checks the full accounting equation, not just balance. 7 assertions: A-G.
  [
    "verify-trial-balance-and-balance-sheet",
    [
      "apps/backend/src/accounting/",
      "accounting.journal_entries",
      "accounting.journal_entry_postings",
      "catalogs.accounts",
    ],
  ],
  // ROUND 153 (owner, via Lead) — the closing guard for the USMCA reconciliation, built
  // incrementally as each of the six items lands (this PR: items 2 and 3). See the guard's own
  // header for exactly which assertions are live vs. not-yet-built.
  // 2026-10-01 (Lead): moved to REPORT-ONLY below (same shape as ROUND 213). Owner, verbatim:
  // "THESE ARE THE REAL AND TRUE INVOICES IN QBO, IN FARO, AND IN ALLWAYS TRACK ... I TOLD YOU NOT
  // TO SEED ANYTHING YET AND NOBODY SHOULD BE ADDING OR CREATING ANYTHING YET ... ONCE FULLY AND
  // COMPLETE ALL ENGINES WE WILL SEED." The book-vs-Faro/AlwaysTrack state is now the owner's own
  // seeding work (his 09-30 reconciliation workbook is the source); no seat may write the rows this
  // guard asks for, so as a hard gate it only blocks code. It still runs and prints every item.
  // LAW 5 (owner, 2026-09-23/24): "one source per number, every screen reads it." Static arm
  // (no bill-header-total-as-load-cost anti-pattern; SettlementDetailPage's KPI grid reads the
  // company-scoped report) is diff-scoped like every LIVE_DOMAIN_GUARDS entry; live arm
  // cross-checks canonical vs. naive bill_cents for every load with live bill_lines.
  [
    "verify-one-source-per-number",
    [
      "apps/backend/src/accounting/",
      "apps/backend/src/driver-finance/",
      "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx",
      "accounting.bill_lines",
      "accounting.bills",
    ],
  ],
  // ROUND 153 STEP 3 (owner, 2026-09-25) — "linkage renders both ways." Static arm: the six
  // load->X forward links (driver bill, expenses, bills, fuel, Faro advance, invoice) and the
  // settlement->loads reverse link stay wired; live arm: 0 dangling FKs on any of them.
  [
    "verify-load-linkage-renders-both-directions",
    [
      "apps/frontend/src/components/dispatch/",
      "apps/backend/src/driver-finance/tour-readout.routes.ts",
      "driver_finance.driver_bills",
      "accounting.expenses",
      "fuel.fuel_transactions",
      "accounting.invoices",
      "accounting.factoring_advances",
    ],
  ],
  // ROUND 191 item 4 (Lead order) — 330 of 336(+) active USMCA settlement_lines had NULL
  // posting_account_id; nothing on a settlement reached the GL. The canonical backfill
  // (backfillExistingSettlementLineAccounts) already existed but was never wired into
  // settlement-creator.service.ts's bare-AlwaysTrack-digit path, so every line it inserts lands
  // with no account. Every CLOSED settlement's active line must have posting_account_id, except a
  // named, structural exemption (reimbursement/deduction lines with no upstream source record at
  // all — never guessed, per the owner's 2026-09-10 ruling against blind generic-account
  // assignment).
  [
    "verify-settlement-line-posting-account-complete",
    [
      "apps/backend/src/driver-finance/settlement-lines-materialize.service.ts",
      "apps/backend/src/driver-finance/settlement-creator.service.ts",
      "apps/backend/src/driver-finance/escrow-resolver.service.ts",
    ],
  ],
  // ROUND 195 (owner order) — "the QuickBooks flags are blocked permanently. Not 'off' - blocked,
  // so that no seat, script or UI can ever set them true." catalogs.blocked_feature_flags (the
  // named, auditable list) + BEFORE INSERT/UPDATE triggers on lib.feature_flag_overrides and
  // lib.feature_flags RAISE EXCEPTION on any write that would resolve a blocked flag_key to
  // enabled. Catches the next PATCH/migration/ops-script that tries to flip a QBO write-back or
  // pull flag on, whether or not the trigger itself is touched.
  [
    "verify-qbo-flags-blocked",
    [
      "apps/backend/src/lib/feature-flags/service.ts",
      "apps/backend/src/lib/feature-flags/routes.ts",
    ],
  ],
  // ROUND 195.1 (owner law, 2026-09-28) — "THE DELIVERY DATE OF THE LOAD IS THE PROJECTED INCOME
  // DATE. Faro buys the invoice at delivery. There is no lag." Supersedes the 2026-06-17 lock that
  // said the lag is never zero. Catches the next edit to receivable-lag.ts or
  // projected-cash-date.ts that re-introduces a nonzero factored-load lag.
  [
    "verify-projected-cash-date-equals-delivery",
    [
      "apps/backend/src/dispatch/receivable-lag.ts",
      "apps/backend/src/cash-flow/projected-cash-date.ts",
      "apps/backend/src/cash-flow/cash-flow.service.ts",
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
//
// ROUND 210 repoint (CC-1): this used to read a lone-purpose file at
// ~/.config/ih35/neon-prod-readonly.url with no write-attribution anywhere in this repo, and that
// file was silently overwritten by an unidentified seat on 2026-09-28 with neondb_owner credentials
// — a read-only gate credential quietly became a real-bypass one with nothing to notice it. Now
// reads the single, owner-designated master credentials file instead, extracting the connection
// string from its own dedicated "READONLY GATE CREDENTIAL (ih35_ci_readonly)" section (a fenced
// code block, not the whole file) so a stray edit elsewhere in that doc can't be misread as this
// credential. Read once, memoized, never logged (it's a live credential).
const MASTER_KEYS_FILE = path.join(
  os.homedir(),
  "Desktop/09-28-2026-IH35-MASTER-KEYS-ENVS-SINGLE-SOURCE-OF-TRUTH.md"
);
const READONLY_SECTION_RE =
  /## READONLY GATE CREDENTIAL[^\n]*\n(?:(?!\n## )[^\n]*\n)*?\s*(postgresql:\/\/\S+)/;
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
    const doc = fs.readFileSync(MASTER_KEYS_FILE, "utf8");
    const match = doc.match(READONLY_SECTION_RE);
    cachedReadonlyDbUrl = match ? match[1].trim() : undefined;
  } catch {
    cachedReadonlyDbUrl = undefined;
  }
  // No readonly credential available locally — fall back to whatever DATABASE_URL the caller
  // already set (unchanged behavior; never block a seat that hasn't fetched the readonly role yet).
  return cachedReadonlyDbUrl ?? process.env.DATABASE_URL;
}

const localOutcomes = { passed: 0, failed: 0, skipped: 0 };
const skippedLiveChecks = [];
process.once('exit', code => console.log(formatLocalOutcomes(LABEL, localOutcomes, skippedLiveChecks.length, code)));

function runNode(rel, extraEnv = {}, args = []) {
  const localArgs = localDatabaseGuardArgs([rel, ...args]);
  const routed = localArgs === null || localArgs.length !== args.length + 1;
  if (routed) localOutcomes.skipped++; // Database phase is deferred, even if its static phase passes.
  if (localArgs === null) return 0; // X-16: required CI execution, no local/live verdict.
  args = localArgs.slice(1);
  const script = path.join(ROOT, rel);
  console.log(`[${LABEL}] RUN ${rel}${args.length ? ` ${args.join(" ")}` : ""}`);
  const env = { ...process.env, ...extraEnv };
  // Only override when a live DB is actually in play (DATABASE_URL set) and the caller didn't
  // already pin a specific connection string via extraEnv (e.g. a test harness).
  if (env.DATABASE_URL && !extraEnv.DATABASE_URL) {
    env.DATABASE_URL = resolveGuardDatabaseUrl();
  }
  // Every guard reads the DIRECT endpoint — never the pooler, where the app's SET ROLE ih35_app leaks.
  const res = spawnSync(process.execPath, [script, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: guardDbEnv(env),
  });
  const out = `${res.stdout ?? ""}${res.stderr ?? ""}`.trim();
  if (out) console.log(out);
  if (res.error || res.signal || res.status !== 0) localOutcomes.failed++;
  else if (reportedSkip(out)) {
    if (!routed) localOutcomes.skipped++;
  }
  else localOutcomes.passed++;
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

// R297.5 X-19: local in-memory contract; production inventory is REQUIRED in CI.
{
  const name = "verify-no-test-markers-in-live-tables selftest";
  const code = runNode("scripts/verify-no-test-markers-in-live-tables.mjs", {}, ["--selftest"]);
  if (code !== 0) { failStep(name); process.exit(code); }
}

// B3 (Devin sweep, 2026-09-28; migration 202614540000) — mdata.workflow_requests cross-tenant RLS
// proof. Must INSERT synthetic rows + SET LOCAL ROLE ih35_app (NOBYPASSRLS). The gate's default
// ih35_ci_readonly rewrite cannot run this: readonly has BYPASSRLS and cannot SET ROLE ih35_app.
// Pin the caller's write DATABASE_URL explicitly so runNode does not rewrite it.
{
  const name = "verify-workflow-requests-entity-scoped";
  const rel = "scripts/verify-workflow-requests-entity-scoped.mjs";
  const writerUrl = process.env.DATABASE_URL;
  const code = writerUrl ? runNode(rel, { DATABASE_URL: writerUrl }) : runNode(rel);
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
  if (!process.env.DATABASE_URL && requiresLocalDatabase("scripts/verify-control-totals.mjs")) {
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
  if (!process.env.DATABASE_URL && requiresLocalDatabase("scripts/verify-alwaystrack-parity.mjs")) {
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

// R-162 GUARD B (Lead order, 2026-09-25) — settlement net_pay must equal the signed document's
// own TOTAL DUE (the same runtime check closeSettlementPayRun now runs at close time). Mirrors
// verify-control-totals/verify-alwaystrack-parity's own touchesMoneyPath()-gated live pattern.
if (touchesMoneyPath()) {
  if (!process.env.DATABASE_URL && requiresLocalDatabase("scripts/verify-settlement-net-equals-document.mjs")) {
    console.error(
      `\n${LABEL}: FAIL — scripts/verify-settlement-net-equals-document.mjs — this diff touches a ` +
        `money path but DATABASE_URL is not set. A touched live-domain guard with no DB is a FAIL, never a skip (ROUND 29.9-B).\n`,
    );
    process.exit(1);
  }
  // No acceptedAsEmptyByPurge here (verify-purge-window-exemption.mjs hard-counts exactly 4 sites:
  // control totals, parity, LIVE_DOMAIN_GUARDS, E7 batch 2) — this guard does not need it anyway: a
  // purge that empties driver_settlements just yields "0 settlement(s) checked, 0 mismatches", a
  // legitimate PASS with no special-cased exemption required.
  const code = runNode("scripts/verify-settlement-net-equals-document.mjs");
  if (code !== 0) {
    failStep("verify-settlement-net-equals-document");
    process.exit(code);
  }
} else {
  const msg = "verify-settlement-net-equals-document.mjs — no money path in this diff";
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
  if (!process.env.DATABASE_URL && requiresLocalDatabase("scripts/verify-diesel-expense-fuel-dedupe.mjs")) {
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
  if (!process.env.DATABASE_URL && requiresLocalDatabase("scripts/verify-fuel-relay-txn-vendor-unmatched.mjs")) {
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
      if (DATA_WRITE_PATHS.some((p) => f.startsWith(p))) {
        const diff = spawnSync("git", ["diff", "--unified=0", "origin/main...HEAD", "--", f], {
          cwd: ROOT,
          encoding: "utf8",
        });
        if ((diff.status ?? 1) !== 0) return true;
        return dataWritePathDiffActuallyWrites(f, ROOT, diff.stdout || "");
      }
      if (
        domainPaths.some((p) => {
          if (!f.startsWith(p)) return false;
          // GATE-SCOPE bank-recon (2026-09-28): blanket accounting/ must not pull MatchDrawer /
          // accept-multi-match into every tip-debt money guard. bank-recon owns its own guards
          // (verify-no-match-persisted-outside-accept-handler lists match.service.ts explicitly).
          // GATE-SCOPE checks mount (2026-09-29, ROUND 224 / ROUND 240 ratchet): exact-file
          // allowlist from r224-gate-exception-sets.baseline.json — NOT whole accounting/.
          // check-create.service.ts / check-void.service.ts still trip ledger-population guards.
          if (
            p === "apps/backend/src/accounting/" &&
            (f.startsWith("apps/backend/src/accounting/bank-recon/") ||
              R224_ACCOUNTING_LIVE_DOMAIN_SKIP.has(f) ||
              // GATE-SCOPE B-1 (2026-10-01): account-register is a read-only GL ledger surface —
              // it cannot create fuel rows, Faro variance, or voided headers. Do not pull tip-debt
              // fuel/dispute/void censuses into a register-only PR.
              f === "apps/backend/src/accounting/account-register.service.ts" ||
              f === "apps/backend/src/accounting/account-register.service.test.ts" ||
              f === "apps/backend/src/accounting/account-register.routes.ts" ||
              f === "apps/backend/src/accounting/account-register.guard.test.ts")
          ) {
            return false;
          }
          return true;
        })
      ) {
        return true;
      }
      return false;
    });
  if (touched) {
    if (!process.env.DATABASE_URL && requiresLocalDatabase(rel)) {
      console.error(
        `\n${LABEL}: FAIL — ${rel} — this diff touches its domain but DATABASE_URL is not set. ` +
          `A touched live-domain guard with no DB is a FAIL, never a skip (ROUND 29.9-B).\n`,
      );
      process.exit(1);
    }
    // Guards that SET LOCAL ROLE neondb_owner (or INSERT+ROLLBACK) cannot run under the gate's
    // default ih35_ci_readonly rewrite — pin the caller's write DATABASE_URL.
    const needsWriterUrl = name === "verify-no-match-persisted-outside-accept-handler";
    const code = needsWriterUrl
      ? runNode(rel, { DATABASE_URL: process.env.DATABASE_URL })
      : runNode(rel);
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

// ROUND 213 (owner ruling 2026-09-28): verify-purge-era-closures-still-hold is REPORT-ONLY.
// It still runs, still prints every arm and every number, every run — nothing is silenced.
// But it no longer blocks pushes. The guard was written against the purge-era EMPTY book; that
// book is gone. It now asserts a closed-books steady state against a system mid-build and fires
// on normal operating data (proforma A/R, loads dispatched hours ago, $28 in test expenses).
// Every other money guard stays a hard blocking gate. No baselines grow. No exclusion lists.
if (process.env.DATABASE_URL) {
  const reportCode = runNode("scripts/verify-purge-era-closures-still-hold.mjs");
  if (reportCode !== 0) {
    console.log(`[${LABEL}] REPORT-ONLY — verify-purge-era-closures-still-hold exited ${reportCode} (ROUND 213: no longer blocking)`);
  }
} else {
  console.log(`[${LABEL}] SKIP verify-purge-era-closures-still-hold.mjs (REPORT-ONLY, no DATABASE_URL)`);
}

// 2026-10-01 (Lead): verify-usmca-book-equals-faro-and-alwaystrack is REPORT-ONLY for the same
// reason as ROUND 213 — it asserts a reconciled-book steady state that the owner has taken into his
// own hands (seeding through the Settlements creator from his 09-30 workbook; "nobody should be
// adding or creating anything yet"). Every item still prints every run; it re-arms as a hard gate
// the moment the owner says the seeding is complete. No baselines grow. No exclusion lists.
if (process.env.DATABASE_URL) {
  const bookCode = runNode("scripts/verify-usmca-book-equals-faro-and-alwaystrack.mjs");
  if (bookCode !== 0) {
    console.log(`[${LABEL}] REPORT-ONLY — verify-usmca-book-equals-faro-and-alwaystrack exited ${bookCode} (owner seeding freeze 2026-10-01: not blocking until the owner seeds)`);
  }
} else {
  console.log(`[${LABEL}] SKIP verify-usmca-book-equals-faro-and-alwaystrack.mjs (REPORT-ONLY, no DATABASE_URL)`);
}

// E7 batch 2 (Lead ROUND 84): the guards in scripts/lib/e7-batch2-live-guards.json fail closed. Each
// runs when its owned paths in scripts/.gate-step-map.json intersect the diff or its own file changed
// (verify-static's guardIsInScope), and then needs a live DB. A guard the map marks alwaysRun has no
// owned path to key on, so it runs only when a live DB is present.
const E7_BATCH2_LIST = "scripts/lib/e7-batch2-live-guards.json";
const e7Batch2List = JSON.parse(fs.readFileSync(path.join(ROOT, E7_BATCH2_LIST), "utf8"));
const { map: gateStepMap } = ensureFreshGateStepMap();

// GATE-SCOPE index.ts (2026-09-29, ROUND 224): ~199 guards list apps/backend/src/index.ts as an
// owned path because they assert a mount line there. An index.ts-only intersection must still run
// the STATIC half of live_flag_guards (mount still present), but must NOT pull the live fleet
// census (--live) — that census is tip-debt shared across seats and is not caused by mounting an
// unrelated registrar (e.g. registerCheckRoutes). Real telematics/geocode/writer path changes still
// get --live via a non-index ownedPath hit.
function ownedIntersectionIsIndexOnly(entry, changedFiles) {
  if (!changedFiles || !entry?.ownedPaths?.length) return false;
  const hits = entry.ownedPaths.filter((owned) =>
    changedFiles.some(
      (changed) => changed === owned || changed.startsWith(owned) || owned.startsWith(changed),
    ),
  );
  return hits.length > 0 && hits.every((h) => h === "apps/backend/src/index.ts");
}

// live_flag_guards are static by default; their database half runs only with --live.
const e7Batch2 = [
  ...e7Batch2List.guards.map((file) => [file, []]),
  ...(e7Batch2List.live_flag_guards ?? []).map((file) => {
    const entry = gateStepMap.entries?.[file];
    const indexOnly =
      changedForLiveDomains !== null && ownedIntersectionIsIndexOnly(entry, changedForLiveDomains);
    return [file, indexOnly ? [] : ["--live"]];
  }),
];
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
  if (args.length === 0 && (e7Batch2List.live_flag_guards ?? []).includes(file)) {
    console.log(
      `[${LABEL}] GATE-SCOPE — ${file} static only (index.ts mount intersection; --live census not pulled)`,
    );
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
  skippedLiveChecks.push(...e7Batch2Skipped.map(file => `${file} — no owned paths in diff`));
}

if (purgeSkips.length > 0) {
  const w = purgeWindow();
  const msg =
    `${purgeSkips.length} GUARDS SKIPPED — EMPTY BY PURGE, verified ${w.verifiedAt}, expires ${w.expiresAt}: ` +
    purgeSkips.join(", ");
  console.log(`[${LABEL}] ${msg}`);
  skippedLiveChecks.push(...purgeSkips);
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
