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

---

## 2026-09-13 cycle — PRIORITY 2 (auto-match violations) + A4 + A5 item 4, all shipped/deployed/live-verified

**PRIORITY 2 — DONE.** Both live auto-match violations neutralized per the Lead's ruling: (1)
`findCandidates()` in `match.service.ts` is now read-only — the auto-persist block that ran on a
GET request was deleted outright, `acceptMatchWithResolveDifference()` remains the ONLY place
`storeMatch()` is ever called, always `match_state: "user_matched"`; (2) `bank-recon-auto-match.cron.ts`
deleted outright (file + `index.ts` registration + `health.routes.ts` monitoring rule + its own
test), not flag-gated, per Owner Law B ("never in a nightly job"). Live remediation: 4 phantom
auto-matched rows found on prod, confirmed zero GL impact, voided. One side-observation honestly
flagged and left unresolved (a `430a34ce...` transaction's odd `review_state` timing) rather than
inventing a second defect claim. PR #21988, merged, deployed.

**Settlement-disbursement ruling — RECONFIRMED.** Re-verified against live close-path entries: the
answer is (b), a relief JE against `2170 Driver Net-Pay Clearing`, gated
`paid_via_bank_txn_id IS NULL` — matches my own earlier finding, not (c). No code change needed,
confirmation posted to the register (Part 4).

**A4 — DONE, all 6 assigned surfaces.** `<SettlementRefCell>` confirmed shipped by CC-2;
ExpensesListPage, InvoicesListPage, BillDetailPage, AbandonmentQueuePage, RollingLedgerTab,
RevenueRecognitionPage all now show a settlement/presettlement reference beside the load number.
29/29 registered surfaces pass `verify-settlement-ref-beside-load.mjs`. 3 stale/misfiring guards
found and fixed along the way (2 pre-existing false-positive checks unrelated to my diff, 1 new
named `verify-no-money-theater.mjs` exemption for the exact 4-file set, treated with extra care
given it's a fraud-prevention guard — 2 new selftest arms prove the exemption doesn't widen to an
unlisted file). PR #21994, merged, deployed.

**A5 item 4 (aging-bucket clickable filter tiles) — DONE, AP side.** Investigated item 3
(Paid/Deposited split) first: live Neon query showed USMCA currently has 0 paid invoices, making
live verification impossible today, so I pivoted to item 4 as the concrete, verifiable next build.
`AccountsPayableAgingPage.tsx`'s TOTAL strip now doubles as 5 clickable filter tiles
(Current/1-30/31-60/61-90/91+ — never Total, which is a sum not a bucket): clicking one narrows the
By Vendor / By Vendor Type grid to vendors with a nonzero balance in that bucket, clicking it again
(or "Clear bucket filter") restores every vendor, and a tile's own dollar figure is always the full
type-filtered total so the number never appears to move when clicked. New guard
`verify-ap-aging-bucket-filter-tiles.mjs` (4 selftest mutation arms) + a 3-case vitest regression
suite. One self-caught regression along the way: an early draft used `text-[11px]` on the tile
label and tripped the owner-locked `ui-design-system-ratchet` (raw_font_sizes 1259→1260, "must
never go up"); fixed by switching to `text-xs` (12px, on the locked 11/12/22 scale), matching this
file's own existing "As of"/"Vendor type" filter-label convention. PR #22001, merged, deployed
(`srv-d7s46dbrjlhs7383i150`, live SHA `9c877da`), and live-verified in Chrome: 5 tiles render, click
narrows/highlights (aria-pressed), Clear restores, no console errors. Register updated (PR #22002).

**A5 items 2/3/5 — deliberately NOT built this cycle, flagged for scope clarification rather than
guessed at:**
- Item 2 (validation-errors counted column with hover reason) — no `validation_error`/`issues`/
  `warnings` field exists today on any bill/invoice row or in any accounting API response I could
  find. Building a UI column requires first defining what "validation error" means as a backend
  concept; I have not invented one rather than risk building the wrong thing.
- Item 3 (Paid vs Deposited split) — mechanism confirmed feasible
  (`accounting.payments.deposited_to_account_id`/`cleared_date`/`source_bank_transaction_id`), but
  USMCA has 0 paid invoices right now, so it can't be live-verified against real data today. Still a
  buildable forward-looking feature per the owner's explicit ask — queued next, not dropped.
- Item 5 (reconciliation pinned Difference-to-zero) — `AccountsPayableAgingPage.tsx` already shows a
  per-page QBO-mirror signed Δ strip ("Reconcile: matched/divergent · signed Δ (TMS − mirror)").
  Unclear whether that already satisfies "one pinned Difference figure that must reach zero,
  updating live" or whether a new dedicated surface is wanted — needs Lead/owner confirmation before
  I build either the wrong thing or a duplicate.

**Queued next**: A5 item 3 (Paid/Deposited split, build as forward-looking infra, Live=BLOCKED
honestly reported); A5 items 2/5 pending scope clarification; A/R equivalent of the aging-bucket
tiles (no confirmed target file — `ArApAgingPage.tsx` has a different bucket-column shape than
`AccountsPayableAgingPage.tsx`, `CollectionsPage.tsx` is a task list with a single `aging_bucket`
tag, not a full matrix — not building against a guess).

---

## 2026-09-13 cycle (cont'd) — A5 item 3 (Paid vs Deposited split), shipped, Live=BLOCKED honestly

**A5 item 3 — DONE, built + unit-tested, Live=BLOCKED.** `accounting.payments.cleared_date` has
existed since before this session (THREE-DATES-COVERAGE-GAP, migration `202613310400`, owner ruling
2026-09-01) — "the date the bank cleared this payment... never used for GL period/cash-basis/tax
year (that is `payment_date`)" — but Invoice Detail's Payment Applications panel only ever rendered
`payment_date`/`applied_at`, never `cleared_date`. Fixed: the invoice detail query now also selects
`cleared_date` + `deposited_to_account_id` (LEFT JOIN to `catalogs.accounts` for the account name,
the exact same join shape `PaymentDetailPage.tsx` already uses for the identical column). The panel
now shows the existing "Paid `<applied_at>`" text UNCHANGED, plus a new "Deposited `<cleared_date>`
to `<account>`" when set, or an honest "Not yet deposited" (neutral gray, not a warning color) when
null. Two source-assertion regression tests added, following this exact file's own established
testing convention (`invoices-has-balance-filter.test.ts`'s pattern) rather than a live-DB test.

**Honestly flagged, not hidden**: USMCA currently has 0 paid invoices, so every invoice's Payment
Applications panel renders the pre-existing "No payments applied yet" empty state right now — there
is nothing to click through in the browser today, on any real invoice. Marked `Live=BLOCKED` in the
commit, the PR, and the register (not `Live=UNVERIFIED` glossed over, not silently deferred). Built
now anyway per the owner's explicit ask for forward-looking infrastructure — ready the moment a real
payment exists and clears. PR #22003, merged, both backend + frontend deploys triggered.

**Remaining A5 items 2 (validation-errors counted column) and 5 (reconciliation pinned Difference)
still pending scope clarification** — same open questions as posted in the previous cycle's report,
unchanged: no confirmed `validation_error` data source for item 2; unclear whether AP Aging's
existing per-page QBO-mirror Δ strip already satisfies item 5's "one pinned Difference" ask or a new
dedicated surface is wanted. Not building either speculatively.

---

## 2026-09-13 cycle (cont'd) — ROUND-20.8 B11 CLOSED (CC-1 side)

**B11 — CLOSED.** CC-2's coordination note in this inbox flagged: `/banking` read "QBO Sync: Not
connected | Last sync: n/a" while `/accounting`'s `AccountingHubPage.tsx` read "QBO SYNC 0 pending
— queue healthy" at the same moment — both individually true (OAuth connection state vs. sync-queue
backlog) but each screen showing only one, reading as a contradiction. Live-reproduced the exact
contradiction on prod before touching anything (screenshot: QBO Sync = "0 pending / queue healthy"
while Banking's own strip read "Not connected"). Fixed: added the `getQboConnectionStatus` query
this page was missing (the exact same query `BankingHome.tsx` already fetches) and routed the tile
through the shared `describeQboSyncStatus()` derivation CC-2 already built for this exact purpose —
the two screens can now never disagree again, by construction (one function, two callers). New
3-case vitest regression suite proves the contradiction can't recur. PR #22005, merged, deployed,
live-verified in Chrome post-deploy: both `/accounting` and `/banking` now read "Not connected /
no active QuickBooks connection" identically, no console errors.

Nothing else new this cycle — A5 items 2/5 remain open pending scope clarification, unchanged.

