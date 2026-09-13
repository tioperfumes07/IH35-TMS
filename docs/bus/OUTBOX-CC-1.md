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

---

## 2026-09-13 — ROUND 23.2 B4 (settlement net-pay), major finding + PR #22028 shipped

**Assigned:** B4 (net-pay to signed TOTAL DUE, fix 5801/5802/5803 net=$0.00) + B5 (re-post via
canonical Bill+BillPayment, not closeSettlementPayRun; Pedro/5772 full $997.08). Plus two
mid-session supplements: invoice/line-haul creation to $238,810.00 (5 wrong-leg loads), and the
pre-08/28 AllwaysTrack ingest window + missing Faro advances (13584/13585/load-039).

**B4 — ROOT CAUSE FOUND, FIXED, SHIPPED (PR #22028, merged, deployed).** The "net_pay=0.00 with a
gross present" symptom is NOT a broken deduction computation. Both settlement GL posters
(`closeSettlementPayRun` AND `postSettlementBillPayment`) compute gross/deductions/reimbursements/
net correctly and post a fully-balanced JE reflecting them — but NEITHER ever wrote those numbers
back onto `driver_finance.driver_settlements`' own header columns. Live-measured: **34 of 36 posted
USMCA settlements** (not just the 3 reported) carried a stale header net_pay disagreeing with their
own already-correct JE. Cross-checked all 36 JEs' own net_cents against the ground-truth signed
documents independently in Python: **35 of 36 match to the cent** — the money was never wrong, only
the display field was stale. The one exception (S-2026-0011) is the already-known duplicate
mega-row for tour 5782, CC-2's B5 1:1-re-cut territory, excluded by name.

**Fixed:** both posters now write the header in the same transaction they post in (going forward).
Built a one-time, JE-derived backfill script (writes NO new financial fact — reads what each
settlement's own already-posted JE already says and copies it onto the header) for settlements
posted before the fix. Rehearsed + proven end-to-end on a Neon branch
(`br-summer-grass-akgqhc0i`): all 35 non-duplicate documents now read net_pay = signed TOTAL DUE
exactly. New guard `scripts/verify-settlement-net-matches-signed-doc.mjs` (verify-step 11457).

**Also fixed in passing:** 2 orphaned guards from CC-2's #22020/#22021 that were blocking
`verify:guard-wired` on my branch (PRs #22026/#22027, wired as verify-steps 11461/11465 — not my
code, just wiring so they actually run in CI).

**NOT done, correctly scoped as separate:**
- **The prod backfill itself is UNVERIFIED on prod** — proven only on the rehearse branch. Running
  it changes what 33 real, already-correctly-paid settlements' net_pay reads for real people; asked
  for explicit confirmation before executing even though it creates no new financial fact (see PR
  REMAINING).
- **B5 (canonical-path-only)** — all 36 posted USMCA settlements went through `closeSettlementPayRun`,
  not the canonical Bill+BillPayment engine. Reversing 33+ ALREADY-CORRECT postings and reposting via
  the other mechanism is a real, high-blast-radius architecture migration with zero economic benefit
  (the money is already right) — explicitly owner-gated per MEMORY_BANK ("prod money re-post stays
  owner-gated" / "no prod post without Claude's GO + owner's explicit yes," both reaffirmed
  2026-09-13). Not started.
- The canonical Bill+BillPayment poster (`postSettlementBillPayment`) has **no representation for a
  settlement reimbursement at all** (grep-confirmed) — a real posting-path gap discovered while
  rehearsing B5, flagged rather than worked around, per this round's own "say so and stop, do not
  invent one" instruction.
- `driver_finance.driver_bills` for the 10 loads across 5772/5801/5802/5803 carry stale/wrong
  `driver_id` (4 of 10, pre-dating a tour driver-correction) and wrong/zero `gross_amount_cents`
  (8 of 10) — B3/B6 ingestion territory (CC-2/CC-3's rows), diagnosed exactly (loads/amounts
  available) but not touched.
- The two mid-session supplements (invoice/line-haul creation; pre-08/28 ingest + Faro advances) are
  **not started** — received partway through this cycle's investigation, not yet live-investigated.
  One item already resolved by someone else: load "039" (Big G Logistics, $3,500.00) is linked in
  `verify-faro-invoice-lines-load-linkage.mjs`'s own header comment to real load 13554 via
  `accounting.invoices.display_id='039'.source_load_id` — no new load needs creating for that one.

**Queued next**: get explicit confirmation to run the prod backfill (safe, no new GL fact); then the
invoice/line-haul creation supplement; then the pre-08/28 ingest + Faro-advances delta; B5's
reverse+repost campaign stays parked pending an owner decision on whether it's worth the risk given
the money is already correct.


## 2026-09-13 — P0 (unassigned, blocked every deploy) — duplicate route boot-crash found + fixed

**Not part of ROUND 23.2 — discovered as a side effect of shipping PR #22028.** That PR's own
deploy (`dep-dajfbtnqj5pc73ddni6g`) built successfully and its pre-deploy migration succeeded, then
the new instance crash-looped 36+ times over ~15 minutes before Render marked it `update_failed`.
Root-caused to a DIFFERENT, unrelated commit that landed on `origin/main` between my last fetch and
my deploy: `apps/backend/src/index.ts` explicitly called `registerInvoiceDisputeRoutes(app)` on top
of that same route file's own pre-existing `default fp(...)` autoload mount (the exact "SET-30" /
"DUPLICATE-ROUTE-BOOT-CRASH" class this codebase has hit before for other files) — Fastify throws at
boot on the first duplicate route it registers, deterministically, every time.

**Not caused by me** (confirmed via `git show origin/main:apps/backend/src/index.ts` the bug
predates my branch). **Prod itself never went down** — Render correctly kept the previous build
`live` the whole time (confirmed via healthz polling, zero downtime) — but every backend deploy from
any seat was blocked from that point on, including my own B4 fix above.

**FIXED, PR #22037**: removed the duplicate explicit call + import; the route's own autoload mount
is the sole, correct registration, all 5 dispute endpoints stay reachable. `verify-no-duplicate-
routes.mjs` (pre-existing) reproduces FAIL→PASS around the fix; also proved by actually booting the
built server against a live Neon branch (was throwing `FastifyError` at boot every time without the
fix, reaches `"Server listening"`/`"Server started"` with it). FINDING: ACCT-F26308. Merging on
green (fast-merge law); will confirm the live deploy reaches this SHA next (which also finally
unblocks PR #22028 / B4 from going live).
