# OUTBOX-CC-1 · money/GL/settlements/factoring/banking lane

---

## CC-1 — CYCLE REPORT 2026-09-13 03:5x UTC — Auto-match violations neutralized (Owner Law B) + repo-wide CI P0 sweep + ROUND 21.1 item 1

**PRIORITY 2 — DONE.** Both live auto-match violations CC-2 found (#21955) are neutralized, per the
Lead's ruling. PR #21988, merged, deployed, live-verified:
- **Violation 1**: `match.service.ts`'s `findCandidates()` no longer auto-persists a
  `banking.reconciliation_matches` row on a bare GET. It is now READ-ONLY — candidates still carry
  their own `auto_match` boolean for the UI, but persistence happens exclusively in the explicit
  `acceptMatchWithResolveDifference()` accept handler (real `actor_user_uuid` required, always
  `match_state='user_matched'`).
- **Violation 2**: `apps/backend/src/cron/bank-recon-auto-match.cron.ts` deleted outright — file, its
  `BANK_RECON_AUTO_MATCH_CRON_ENABLED` flag, its `health.routes.ts` monitoring rule, its `index.ts`
  registration, and its two now-moot guards (`verify-cron-automatch-excludes-voided.mjs`,
  `verify-bank-automatch-observable.mjs`) all removed. Not left flag-gated, per Owner Law B verbatim
  ("not in a nightly job").
- **Live remediation**: found 4 real `banking.reconciliation_matches` rows this exact bug had already
  written on production (USMCA), each carrying a real `matched_by_user_uuid` (not the system-actor
  UUID) — confirming genuine GET-triggered phantom writes, not test data. Confirmed zero GL impact
  (`storeMatch()` never touched `bank_transactions` or posted a JE), voided all 4 (void-not-delete,
  full audit trail in `void_reason`), re-queried immediately after: 0 remain live.
- Backend deployed, healthz confirms `git_sha=7cdb73331d...` live.

**Settlement-disbursement ruling — reconfirmed.** My earlier live confirmation (close-path credits
2170 Driver Net-Pay Clearing, a liability, never the bank directly) stands and matches the Lead's own
ruling in the master register: answer is (b), a relief JE is needed on match, gated
`paid_via_bank_txn_id IS NULL`. No further action needed from me here — CC-2's PR 2/3 already built on
this correctly (confirmed via code read of `link-suggestions-actions.routes.ts`).

**Repo-wide CI P0 sweep (shared blocker, not my own diff's fault) — 10 items, PR #21977, merged +
deployed:**
1-4, 6, 8-9. 9 orphaned guards (never wired into a claimed verify-step) found and wired: this session's
own `verify-no-automatch.mjs` plus `verify-load-to-cash-chain.mjs`, `verify-money-module-design.mjs`,
`verify-page-autofit.mjs`, `verify-settlement-ref-beside-load.mjs`, `verify-truck-line-units-only.mjs`,
`verify-money-in-excluded-from-auto-categorization.mjs` (#21976), and 2 from #21979
(`verify-customer-relationship-score-partial-honesty.mjs`, `verify-customer-tab-bar-position-and-data-dot.mjs`).
5. `verify-bank-record-transfer-trigger-wired.mjs` (BANK-F02) — stale after ROUND-20.8 B1/B2's
   legitimate dropdown consolidation; updated to accept the current architecture (verified the
   `testId` prop genuinely forwards to a real DOM attribute, not a dead field).
6. `verify-qbo-parity-banking-home.mjs` — stale after B11's shared `describeQboSyncStatus()`
   contradiction-fix; updated to accept delegation to the shared helper.
7. `verify-banking-qbo-chrome-surfaces.mjs`'s plaid check — stale after B9 retired
   `PlaidSyncStatusPanel` (its data now lives in the "Bank feed" KPI tile via `bankFeedLastSync`);
   updated + 2 newly-orphaned components (`PlaidSyncStatusPanel.tsx`, `KpiStatCard.tsx`) allowlisted
   with full provenance.
10. **`verify-matched-state-requires-matched-id.mjs`** (BANK-MATCHED-STATE-GAP, filed by CC-3) —
    **correcting CC-3's diagnosis**: the route (`link-suggestions-actions.routes.ts`) was never buggy;
    all 5 of its switch-case UPDATEs already set the right `matched_*_id` alongside
    `review_state='matched'`. The bug was in the guard's own `MATCHED_ID_COLUMNS` list, missing
    `matched_invoice_id` (immediate false positive) plus, on a full live-schema check
    (`information_schema.columns`, `banking.bank_transactions`), 3 more real columns it never listed
    (`matched_bill_payment_id`, `matched_advance_id`, `matched_payment_id`). Fixed the guard to name
    all 10 real columns. **No app code touched** — `banking.bank_transactions` was never written,
    consistent with the "do not touch" instruction. Closed out in `docs/audit/GUARD-WORKORDERS.md`.
11. (Fleet/telematics, explicitly out of my lane, fixed only because it was the last blocker on the
    shared gate): `verify-samsara-stats-reversegeo-ingest.mjs` — stale after a legitimate
    fallback-array refactor in `samsara-client.ts` (multi-account-compatible retry on 400); broadened
    the guard's literal-string check to a multi-literal scan. Flagging for the fleet seat's awareness,
    not claiming ownership of that module.

All 10 items independently reproduced on a clean `origin/main` worktree before any fix (none caused
by this session's own diffs) — each guard's own `--selftest` extended with the new correct shape
(must pass) plus the original regression shape (must still fail), so none of them can go vacuous.
CC-3 found and fixed a disjoint set of 5 pre-existing guard-staleness issues in parallel (#21985/
#21986) — no overlap, no conflict.

**ROUND 21.1 item 1 — DONE.** PR #21968, merged, deployed. Accounting top nav (`AccountingSubNavWrapper.tsx`,
module header for all ~49 `/accounting/*` pages) now shows `Bills (N) $X.XX` / `Invoices (N) $X.XX`
when N > 0, computed via a new hook that re-imports the SAME canonical open-balance helpers
`BillsPage`/`InvoicesListPage` already use — the nav can never disagree with the page it links to.
Text-only, no restyle, per the owner's scope fence. Live prod frontend deploy confirmed
(`srv-d7s46dbrjlhs7383i150`, commit `142d7c6`, status `live`); visual confirm in Chrome not yet done
this cycle — flagging as the one still-open verification step, not asserting it.

**Queued next**: ROUND 21.1 CC-1 items 2 (validation-errors counted column), 3 (Paid vs Deposited
split), 4 (aging-bucket clickable filter tiles), 5 (reconciliation pinned Difference figure); A4
(settlement-ref-beside-load sweep for my 6 remaining Accounting/Cash-Flow surfaces — CC-2's
`<SettlementRefCell>` is now shipped, no longer blocked).

