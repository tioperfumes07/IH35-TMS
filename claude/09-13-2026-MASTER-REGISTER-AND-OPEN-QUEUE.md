# MASTER REGISTER — WHAT IS DONE, WHAT IS OPEN, AND THE STANDING LAWS
Issued 2026-09-13 by Claude Lead · USMCA ONLY (5c854333-6ea5-4faa-af31-67cb272fef80)
Measured against `origin/main` at `0f9acdbe`. Every status below is a merged PR number or an
explicit OPEN. Nothing here is "probably done."

**Owner's instruction that created this file:** *"i do not want anything lost, post to repo, so they
all have it and nothing gets lost. make sure all previous jobs have been completed by them or are in
queue."*

This file is the single index. If a job is not in this file it does not exist. If a seat finishes a
job, it updates its own row here in the same PR.

---

## PART 1 — SHIPPED AND VERIFIED

| Round | Work | PR | Verified how |
|---|---|---|---|
| 20.1 | Tour linkage + `trip_type` projection; 9 orphaned legs backfilled | #21921 | Lead, live Chrome |
| 20.2 | Round Trips renders the whole tour | #21922 · #21926 · #21929 | Lead: T148 `NB-TR-SB`, 13563/13553/13595, green `Invoiced 13563` chip |
| 20.3 | Kanban drag + swim-lane bloat | #21918 | Lead, live: `touchAction:"none"` on all 3 card variants (was `auto`), empty lanes **128 → 0**, Dispatched column **~1100px → 562px** |
| 20.4 | Truck Line units-only + visible row rules | #21939 | Lead, live: 23 rows, border `rgb(199,210,220)`, 2.5px trip-colour spine, zero driver names in labels |
| 20.5 | Zone 1 reverse transitions (draggable columns send back) | #21942 | Cursor |
| 20.6 | Planners, all four tabs | #21936 · #21954 | CC-3, live-Chrome verified all 4 tabs |
| 20.7 | App-wide autofit law + guard in the money gate | #21933 · #21935 | CC-2, live at 2368/1440/1024px; sweep complete, zero page-shell caps remain |
| 20.8 A | The Money Design System (define-once tokens + components) | #21941 | CC-2 |
| 20.8 B | Banking header/KPI/design rebuild (B1/B2/B4–B11) | #21946 | CC-2 |
| 20.9 #1 | **P&L root cause**: insurance policy CREATE route never generated a bill schedule — had never succeeded for any policy, ever | #21940 | CC-1 |
| 20.9 a/b/c/e | Period-mismatch root cause named: revenue posts dated to **processing time** via `companyBusinessDate()`, never the load's real delivery/invoice date — all 5 call sites of `latchOnDeliveryEvidence` | #21945 | CC-1 |
| 20.9 d | Insurance treatment: **NO CHANGE** — each installment already posts on its own future `bill_date`, which is correct matching | #21951 | CC-1 |
| 20.9 g | `verify-pl-cost-of-revenue.mjs` revised to catch date-range non-overlap, not merely zero postings | #21947 | CC-1 |
| 21.0 | Factoring: 16 tabs → 6, 22 bare em-dashes, 2 developer schema notes removed | #21952 | CC-3 |
| Chain | Posting contract for a human-confirmed bank match — 5 of 6 match types cited to existing functions | #21948 | CC-1 |
| Chain L4 | **PR 1 of 3**: read-only bank suggestion engine, zero writes, + `verify-no-automatch.mjs` and `verify-load-to-cash-chain.mjs` both wired into the money gate | #21955 | CC-2 |

### Two corrections the Lead owes the record
1. **The "27 open bills / $271,280.41 vs $0.00" I reported as a cross-screen contradiction was not a
   defect.** It was CC-1's dry-run leak in flight (~35 minutes). The Accounting home reading $0.00
   was *correct*. Verified clean: `accounting.bills` USMCA = **28 total, 0 live, 28 voided,
   $0.00 live**. CC-1 caught it himself, voided all 27, restored the GL and disclosed it (#21944)
   before doing anything else.
2. **My Prepaid-Insurance recommendation was wrong.** I told the owner account 5600 was booked
   incorrectly and needed capitalising and amortising. CC-1 checked live: each installment already
   posts on its own future `bill_date`. His verdict — no change — is right. Facts win.

---

## PART 2 — OPEN QUEUE, BY SEAT

### CURSOR — loads, tours, trip linkage, load status (absolute fence, no other seat touches it)
| # | Job | Status |
|---|---|---|
| C1 | **Chain Link 1** — driver bills | **DONE (Cursor, this PR).** 13554/13573/13579/13580 minted via the real hook `ensureDriverBillArtifactsForLoad` (they predate the 2026-09-11 mint convergence). Guard LINK 1 = **0 driver-having loads unbilled**. `13502/13505/13507` are DRIVERLESS `delivered_pending_docs` (no driver ever seated) — `driver_bills.driver_id` is NOT NULL, so no bill is possible; that is a DATA anomaly surfaced as a guard REPORT for the owner to seat the real driver, not a hook miss. |
| C2 | **Chain Link 2** — tour links | **DONE-SAFE + OWNER FLAG (Cursor, this PR).** Root cause was NOT a hook miss: two UNATTRIBUTED script batches CANCELLED these loads' pre-settlements on 2026-09-12 (01:21Z/01:46Z, blank role) and cleared `presettlement_link_id`. **C2a restored** the 4 owner-CLOSED ones (S-2026-0018/0020/0028/0030) + re-pointed `13564/13570/13580/13589/13586`. **C2b owner decision** (`13526 13527 13561 13567 13571 13574`): the 2 settlements were `open`, drivers moved to newer tours S-2026-5806/5807 → re-open violates one-open-per-driver, `closed` is an owner close; 13526 never had one. Baselined in the guard. Full forensic: `docs/reconcile/CHAIN-C1-C2-BACKFILL-2026-09-13.md`. |
| C3 | **The auto-create HOOK** named + guard hardened | **DONE (Cursor, this PR).** Bill: `book-load.service.ts:1091` (`ensureDriverBillArtifactsForLoad`) → `:682`. Link: `presettlement-link.service.ts:624` (booking) / `:695` (REG-008 post-assignment). Guard corrected: USMCA-scoped (was counting frozen Transportation `L-2026…`), LINK 1 hard-fails only on driver-having loads, `set_config(bypass_rls,false)` (the `true`/tx-local form RLS-filtered every read to 0). Guard **LIVE PASS at 88 USMCA loads**. |
| C4 | Load **13595** revert | **DONE (verified).** `audit.row_changes`: the Lead's test drag `dispatched→in_transit` (21:40:48Z) was already reverted `in_transit→dispatched` at 23:52:05Z. Reads `dispatched` live. |
| C5 | Load **13593** check | **DONE (verified).** Reads `dispatched` live (matches the 16:30 CT read; the 18:15 planner `in_transit` was a render, not persisted). No anomaly — its NB/SB pair 13588/13593 is driver 4ff53886's current open tour S-2026-5807. |

### CC-1 — money / GL / migrations / posting
| # | Job | Status |
|---|---|---|
| A1 | ROUND 20.9 item (f) — reconcile the 3 AlwaysTrack accessorial files against posted: Report (57) driver Enlonada/Desenlonada/Layover **$950.00** / 35 rows · Report (59) admin fees + escrow claims **$1,753.99** / 44 rows · Report (58) vendor fuel/DEF/reimbursement (LOVES, real invoice numbers) **$3,218.70** / 57 rows | OPEN, next cycle |
| A2 | ROUND 21.1 — Accounting tabs: counts + dollar totals in tab labels, validation errors as a counted column with hover reason, **split `Paid` from `Deposited`**, aging buckets as clickable filter tiles, live reconciling Difference that must reach zero | OPEN |
| A3 | ROUND 21.1 item 1 (the open-bills contradiction) — **CLOSED AS MOOT**, it was the 27-bill leak | CLOSED |
| A4 | Settlement-number-beside-load sweep — the 5 Accounting surfaces + Cash Flow rolling ledger | OPEN |
| A5 | Behaviour-only research items: Paid/Deposited split, aging-bucket filter tiles, reconciliation Difference | OPEN |

### CC-2 — banking / frontend / design system
| # | Job | Status |
|---|---|---|
| B1 | Chain Link 4 **PR 2** — accept/reject/change. A human decision writes `matched_*` AND `categorized_by_user_id` AND `categorized_at` in one transaction. **Modify-selected-then-accept.** Shift+click ranges. | OPEN |
| B2 | Chain Link 4 **PR 3** — rules with QuickBooks' precedence: money-in excluded from any automation, user rules first, suggestions second, remainder uncategorized. Drag-reorderable, order = priority. Plus an **`Auto-suggested` filter** isolating what the machine decided. | OPEN |
| B3 | Banking "Factoring (Faro)" tab deletion → read-only summary card. CC-3 acked via #21952. | IN FLIGHT |
| B4 | ROUND 21.2 — Customers & Vendors: the 13-tab bar at `top: 2273px`, seven empty panels, the health score built on missing inputs, four LOVES records, Type=Other/Category=null audit | OPEN |
| B5 | `<SettlementRefCell>` shared component + `verify-settlement-ref-beside-load.mjs` guard, then the 11 Driver/Finance + 2 Fuel surfaces | OPEN |
| B6 | NetSuite tab pattern: fixed tab vocabulary, conditional rendering, **the data-present dot**, expand-all/rollup | OPEN |

### CC-3 — dispatch / planners / factoring / safety
| # | Job | Status |
|---|---|---|
| D1 | Saved queries as chips with **live counts** — `Unmatched fuel (307)` · `Insurance schedule (27)` · `Loads without a driver bill (7)` · `Loads without a tour (14)` · `Duplicate expenses (5)` | OPEN |
| D2 | One saved query published three ways (list view · sublist view · dashboard/reminder count) | OPEN |
| D3 | Settlement-number-beside-load sweep — 6 Dispatch + 5 Safety/Insurance + 5 Fleet/Reports/Docs surfaces | BLOCKED on B5 (`<SettlementRefCell>` not yet shipped) — 1 narrow bug fixed meanwhile (#21965: `SettlementReferenceCell`'s no-link case rendered a bare "—", now "Not on a tour"); full audit done, see correction below |

**CC-3 correction to the D3 audit (16 surfaces, full inventory done 2026-09-13, no code written pending B5):**
1. **3 of the 6 Dispatch surfaces already carry the column today** — `DetentionBoardPage.tsx`, `InTransitIssuesPage.tsx`, `PodReviewPage.tsx` all already render a "Settlement / Presettlement" column via the pre-existing `SettlementReferenceCell` + `useSettlementReferences` pattern, itself already covered by a pre-existing systemwide guard (`scripts/verify-settlement-presettlement-column-systemwide.mjs`, 12 surfaces, still green). They weren't in the "15 files import settlementNumber.ts" count only because they use this sibling component, not the helper directly — functionally compliant, not missing. Only genuinely missing in Dispatch: `LateArrivalsPage.tsx` (confirmed, zero backend change needed) and `DispatchKanban.tsx` (confirmed, zero backend change needed — the row already carries `presettlement_link_id`/`tour_id`).
2. **`TourLegsCell.tsx` is not a target at all.** It renders the LOAD side of an already-fully-compliant pairing — its own two real consumer pages (`SettlementsToursRegister.tsx`, `LoadCostsBoardPage.tsx`) already render a `settlementNumber()`-driven "Settlement/Tour" column immediately before it, per an explicit COLUMN-ORDERING LAW comment already in that file. Recommend dropping it from the list.
3. **`documents/UploadModal.tsx` is not applicable.** It's a pure upload form with no row/list data and no load-number display at all — there is nothing for a settlement cell to sit beside. Recommend dropping it from the list, or treating any future "show the tour while picking a load to upload against" idea as a separate, new-feature ask.
4. **`Documents.tsx` needs a conditional approach, not a blanket column** — it's a generic multi-entity surface (driver/customer/vendor/unit/load/settlement/invoice/standalone); the settlement cell should render only inside the existing entity-label cell when a row's link is load-typed, never as its own always-present column.
5. All 5 Safety/Insurance surfaces and all 3 remaining genuinely-missing Fleet/Reports surfaces (`UnitMaintenanceHistorySection`, `UnitDriverHistoryStrip`, `LaneDetailModal`) are confirmed real gaps, one-line-per-file once `<SettlementRefCell>` (or the existing `SettlementReferenceCell`, if that becomes canonical instead) exists — every row already carries the load's UUID, zero backend projection changes needed anywhere in the 16.
Net: of 16, 2 are non-issues (drop), 3 already done, 1 needs a conditional not a column, 10 are real one-line-per-file adds — all ready to go the moment B5 ships.

---

## PART 3 — TWO LIVE AUTO-MATCH VIOLATIONS. LEAD RULING.
CC-2 found these while authoring `verify-no-automatch.mjs` (#21955) and correctly did **not** rush a
fix into a ~1300-line surface shared with the money lane. Requested Lead direction. Here it is.

**Violation 1 — `apps/backend/src/accounting/bank-recon/match.service.ts` → `findCandidates()`
auto-persists a `banking.reconciliation_matches` row with `match_state='auto_matched'` on a bare
GET.** Opening the Match drawer writes an auto-match.
**RULING: neutralize. CC-1 and CC-2 together, one reviewed PR, CC-1 leads because it is the money
lane.** This is wrong on two counts, and the second one stands even without Owner Law B: a GET must
never write. Split it — `findCandidates()` returns candidates and persists nothing; persistence
moves to the explicit accept handler that already records `categorized_by_user_id`.

**Violation 2 — `apps/backend/src/cron/bank-recon-auto-match.cron.ts`**, a nightly cron literally
named "auto-match", calling the same path for every company, gated off by
`BANK_RECON_AUTO_MATCH_CRON_ENABLED` (default false).
**RULING: DELETE THE CRON. Do not leave it flag-gated.** Owner Law B says "not in a nightly job"
verbatim. A default-false flag is one environment variable from violating the law, and nobody will
remember why the flag exists in six months. Remove the file, remove the flag, remove the schedule
entry. If a suggestion *refresh* job is ever wanted it is a new, differently-named job that writes
only to a suggestions table and never to `matched_*`.

Both are tracked as ratchet debt in the new guard so no third site can appear silently. Good catch
and the right call to escalate rather than edit.

## PART 4 — THE SETTLEMENT-DISBURSEMENT GAP. LEAD RULING.
CC-1's posting contract covers 5 of 6 match types and flagged the sixth — a bank line matching a
**settlement disbursement** — rather than inventing a JE. Correct.
**RULING: it posts nothing new.** A driver settlement already produced its own entries when it
closed; the bank line landing later is the *cash* side clearing an existing liability, not a new
expense. The match therefore: (a) links the bank transaction to the settlement, (b) relieves
`2170 Driver Net-Pay Clearing` against the bank account **only if that clearing entry has not
already been relieved**, (c) posts nothing at all if it has. Idempotency key on the settlement id +
bank transaction id. **CC-1 confirms this against the existing close-path entries before CC-2
builds against it** — if the close path already credits the bank directly, the answer is (c) always,
and the match is link-only.

---

## PART 5 — STANDING LAWS (every seat, every PR)
1. **OWNER LAW B — bank matching is SUGGEST-ONLY.** *"it should never automatch, it suggests and we
   accept it or change the transactions."* Nothing auto-writes a `matched_*` or `categorization_*`
   column — not at high confidence, not on an exact hit, not in a job, hook, importer, migration or
   cron. Every write records **who** and **when**. **There is no future auto-confirm phase.**
   Guard: `scripts/verify-no-automatch.mjs`.
2. **THE LOAD-TO-CASH CHAIN.** Load booked → driver bill auto-created → load assigned to a
   pre-settlement/tour → expenses carry the load's number → it all renders in bills, expenses, P&L,
   cash flow, bank matching and projections. Guard: `scripts/verify-load-to-cash-chain.mjs`.
   Link 3 is at **385/385** today — every expense carries a `load_id` and a load-derived
   `expense_number`. Protect it.
3. **A SETTLEMENT/TOUR NUMBER BESIDE EVERY LOAD NUMBER.** ~30 surfaces are missing it today. One
   shared `<SettlementRefCell>` through `settlementNumber.ts`. Only `source_document_ref` is ever
   human-visible; `display_id` is never rendered. Open tour reads "Open"; no link reads
   "Not on a tour" — never an empty cell. Guard: `verify-settlement-ref-beside-load.mjs`.
4. **AUTOFIT.** No page-level fixed pixel cap on a data board. Nothing clips silently — truncate
   with an ellipsis *and* a `title`. Guard: `verify-page-autofit.mjs`.
5. **NO RESTYLE RIGHT NOW.** Owner, 2026-09-13: *"on the screens lets not change yet."* Build
   behaviour with the components that exist. Adding a field or a column is allowed; changing a hex,
   a type scale, a spacing value or a page layout is not.
6. **NO CHARTS ON TRANSACTIONAL ACCOUNTING SCREENS.** Alvys, McLeod and QuickBooks all agree —
   charts live on a dashboard or in a separate analytics surface, never on Bills/Expenses/Invoices.
   Research: `claude/09-13-2026-COMPETITOR-UI-RESEARCH-ALVYS-MCLEOD-QBO-NETSUITE.md`.
7. **Every screen showing money answers, per row: which load, driver, unit, tour, bill, expense,
   bank line.** Where a link is genuinely absent the screen says so — never a blank, never a zero
   standing in for unknown.

## PART 6 — OPEN QUESTION BACK TO THE SEATS
CC-2 could not reproduce Link 1 (driver bills, 81/88) because `accounting.bills` has no `load_id`.
**That is the wrong table.** The Lead's figure came from `driver_finance.driver_bills.load_id`.
CC-2: re-run against `driver_finance.driver_bills` and make the guard's LINK-1 check hard-fail like
LINK-2 and LINK-3. If it still will not reproduce, say so here rather than leaving it non-gating.

---

## HOW THIS FILE STAYS TRUE
Any seat that finishes a job in Part 2 moves its own row to Part 1 **in the same PR**, with the PR
number and how it was verified. A job that is not in this file does not exist. A job in Part 2 with
no movement for two cycles gets escalated to the owner by the Lead, by name.

---

## CORRECTION — 2026-09-13, LEAD ERROR. READ BEFORE JUDGING CURSOR'S QUEUE.

The Lead reported to the owner that Cursor was "stuck in a void/recreate loop" and drafted a stop
order. **That was wrong and the stop order was withdrawn before it was sent.** Recorded here because
the register is the record.

**What Cursor is actually doing:** the owner assigned him directly — *"i asked cursor to create
daily purchases and match them exactly to faro factoring."* The activity the Lead read as churn is
`Factoring funding FAC-2026-00052` through `FAC-2026-00072+`, entry dates spanning **2026-08-10 to
2026-09-08**, created roughly one every 20 seconds. That is a month of real factoring history being
posted, one dated funding at a time. It is the assigned work, done correctly.

**The Lead's three errors, in order of seriousness:**
1. **Assumed Cursor's only assignment was the Lead's.** The owner gives work directly. Any seat may
   be carrying an owner-assigned task the Lead does not know about. Ask before escalating.
2. **Read row volume as churn without reading what the rows were.** 101 JE inserts looked like a
   loop; they were 20+ distinct, differently-dated funding events. Count is not evidence — content is.
3. **Ran `audit.row_changes` with no entity filter**, so the first figures quoted were not even
   USMCA-only.

The only genuine create-then-void in that window was the 28 insurance "Bill posting" entries at
00:05–00:09Z — CC-1's, already self-disclosed and voided (#21944).

### CURSOR'S QUEUE IS RE-ORDERED ACCORDINGLY
| # | Job | Status |
|---|---|---|
| **C0** | **Daily purchases matched exactly to Faro factoring** — assigned by the owner directly. **This outranks C1–C5.** | IN PROGRESS |
| C1–C5 | The chain links, the hook, 13595, 13593 | QUEUED BEHIND C0 |

No seat is escalated for not doing Lead work while carrying owner work.

### USMCA IS NOT A GREENFIELD ENTITY — THE STANDARD IS STALE
`anthropic-skills:ih35-tms-standards` §D still reads *"USMCA (future carrier, 0 balances)."* That is
a month out of date and any seat reading it will reason wrongly. Measured live 2026-09-13 under
`bypass_rls`:

| | |
|---|---|
| First load | 2026-09-02 |
| Loads | **113** |
| Settlements | **74** |
| Live invoices | **73** |
| Journal entries | **1,064** |
| Factoring advances | **114** |
| Trial balance | debits $1,797,503.75 = credits $1,797,503.75, **out of balance $0.00** |

**USMCA is a live operating carrier with a month of real history.** Treat every record as real
unless it carries `is_sample_data = true`. The Lead is updating the standards skill; until that
lands, this table is the current state and it overrides §D.
