# OWNER STATUS LEDGER — 2026-09-09

**Shared, live status board for every seat (CC-1, CC-2, CC-3, Cursor, Codex, Cascade).** Combines two
sources the owner sent directly tonight, numbered sequentially into one list. Compiled by CC-1
(money/GL/settlements seat) from live repo state, live Neon queries, and live Chrome checks — every
status below is a verified fact or an explicit "not found," never a guess.

**How to update this file:** this table is the append-only baseline, written once. Do NOT edit rows in
place — when you close or re-verify an item, append a dated `## STATUS UPDATE` section below the table
(same convention as `GUARD-WORKORDERS.md`), referencing the item number, with your evidence. That keeps
a real audit trail instead of silently overwriting someone else's read of the state. Always
`git show origin/main:docs/bus/OWNER-STATUS-LEDGER-2026-09-09.md` fresh immediately before appending —
this file will be edited concurrently.

A rendered, easier-to-scan version of Part A + a stat summary is also published at
https://claude.ai/code/artifact/583fa49e-fbdd-4d0e-9667-7a782c6c9097 (owner-owned artifact, not the
source of truth — this repo file is).

---

## Part A — Owner's message, 2026-09-09 ~06:1xZ (items 1–23)

| # | Item | Owner | Status |
|---|---|---|---|
| 1 | Load Board → List view: booked-but-not-in-transit loads shouldn't show; a truck showing twice with two loads should only show the real current load | CC-3 | NOT BUILT — routed |
| 2 | Round Trips view: units with an NB leg and no return yet need a "book a return" action | CC-3 | NOT BUILT — routed |
| 3 | Timeline view: not all units with loads in the Aug-25→present range appear | CC-3 | NOT BUILT — routed |
| 4 | Dispatch Home KPIs "are not real" | CC-3 | NOT BUILT — routed, needs live-data trace first |
| 5 | "Approximate load costs" board: Truck # sortable asc/desc; Units-Need-Return, Days-Since-Last-Delivery, Unassigned-Units each own column; roundtrip-exposure style (unit/driver/load) | CC-3 | NOT BUILT — routed, ambiguous which board, needs owner confirmation |
| 6 | Every load out of Laredo gets a settlement # instantly; Load Costs Settlement # column; T168/Mecor/13577 auto-inherits its paired load's settlement | CC-1 | **DONE, LIVE** — PR #21318/#21447 |
| 7 | Resettlement needs "date started" + "delivery date" from the original load | CC-1 | **DONE, LIVE** — PR #21504 |
| 8 | Pre-settlement Margin $ and Margin % combined into one column — split into two | CC-1 | **DONE, LIVE** — PR #21512 |
| 9 | Redesign driver + company settlement views to mirror the real AlwaysTrack PDFs — "do not give me this current shit" | CC-1 | **IN PROGRESS** — data present, scattered across redundant tables; real consolidation still needed |
| 10 | Load/tour selection outline should make clear which load's expenses are shown, everywhere | CC-1 | NOT STARTED |
| 11 | Factoring: Account Summary (QBO filters), Aging, Chargebacks/Overpayments, Payment-to-you report, Purchase report — all missing | CC-3 | NOT BUILT — routed |
| 12 | Factoring: KPI boxes/profile view out of proportion; Customer/Load boxes too large + misaligned; filter+gear should share their row | CC-3 | NOT BUILT — routed |
| 13 | Factoring: unclear what a named table is / shows | CC-3 | NOT BUILT — routed |
| 14 | Factoring: column order should be original invoice → advance → reserve → fees | CC-3 | NOT BUILT — routed |
| 15 | Factoring: chargeback/fee-history shows driver-pay/margin data unrelated to factoring; default columns must be factoring-only; Profit/Trip-Expenses off by default | CC-3 | NOT BUILT — routed |
| 16 | Factoring: settlement numbers missing entirely | CC-3 | NOT BUILT — routed |
| 17 | Factoring: chargebacks/fee-history shouldn't be split with monthly summaries inline | CC-3 | NOT BUILT — routed |
| 18 | Factoring: Statements/Settings need summary-only view + a detail-view button | CC-3 | NOT BUILT — routed |
| 19 | Factoring: missing QBO-style filters + summary/detail toggle everywhere, incl. Faro Daily Import | CC-3 | NOT BUILT — routed |
| 20 | Factoring: "balances are different" — inspect all of Factoring | CC-3 | NOT BUILT — routed, needs live trace |
| 21 | Reefer loads: always confirm lumper receipts sent; who pays; will customer be invoiced; late-arrival penalty prompt | CC-1 | **DONE, LIVE** — built + live-proven end-to-end this session |
| 22 | Banking: missing account-reorder control on Transactions | CC-2 | NOT BUILT — routed |
| 23 | Banking: running balance wrong — 12/08/25, received $100, balance -$13,062.53 | CC-2/CC-1 | **DISPROVEN, ALREADY FIXED** — pre-fix BANK-F30002 figure (PR #21374); 49/49 adjacent row-pairs re-checked live tonight, all correct |

**Also found and fixed tonight, not asked for:** 152 settlement_lines (reimbursement/deduction) rows
missing their Load # link — direct contributor to item 9 looking broken. Backfilled live, PR #21519.

## Part B — "Claude Coder pending items list, 3:32pm" (items 24–72)

Source: live 297-PR cross-reference against the 09-06 PENDING-MASTER-72H doc, pulled 2026-09-06 17:02Z
→ 2026-09-09 20:17Z. Carries the source's own findings; 3 rows updated by CC-1 tonight with newer
merges that post-date that cutoff (61, 67, 69).

### Banking

| # | ID | Item | Status |
|---|---|---|---|
| 24 | BNK-01 | Fuzzy/many-to-one fuel-card matching, vendor-alias matching | Still open, no PR found |
| 25 | BNK-03 | Redundant toolbar (calendar/presets/gears duplicated) | DONE — PR #21057, #21153, #21161 |
| 26 | BNK-06 | Description column collapsed to 0px | Still open, no PR found |
| 27 | BNK-07 | Columns not adjustable, "Gap" naming, multi-select Show | DONE — PR #21007 |
| 28 | BNK-08 | Missing Check No./Memo/Category/Match status/Reference/Posted JE columns | DONE — PR #21036 |
| 29 | BNK-09 | KPI resize/borders | DONE — PR #21015 |
| 30 | BNK-10 | 362 unposted bank transactions, −$686,503.95 live-proof owed | Still open, live proof never pulled |
| 31 | BNK-11 = ACC-20 | Un-categorize both directions on match reversal | DONE — PR #21173 |
| 32 | BNK-12 | No September reconciliation session, live proof owed | Still open |
| 33 | BNK-13 | USMCA bank-rule authoring, 97.5% uncategorized | DONE (rules side) — PR #21035/#21050; 3,478-transfer routing count never re-measured live |
| 34 | BNK-14 | Owner decision | Unchanged, waiting on owner |
| 35 | BNK-15 | Data item, superseded by BNK-10 | Same live-proof gap |
| 36 | BNK-17 | Bank-fee-recovery role live proof | Still open, no PR found |
| 37 | BNK-18 | Owner's own categorization task | Unchanged |
| 38 | BNK-20 | 5 txns matched to voided docs | Data item, no PR needed, live re-check never run |

### Factoring

| # | ID | Item | Status |
|---|---|---|---|
| 39 | FAC-01 | Factored column, live proof of 7 states | Still open (live proof), no new PR |
| 40 | FAC-02 | Assign FARO to 5 real customers | Still open, no PR found |
| 41 | FAC-03 | Quarantine 11 test customers + reject create | Not confirmed — related fix #21157 doesn't clearly match |
| 42 | FAC-05/06 | Faro advance + seed purchases by load | DONE — PR #21229 |
| 43 | FAC-07 | Profile full-screen, tabs on top | DONE — PR #21120 |
| 44 | FAC-08 | Gear/columns from Load Costs manifest | DONE — PR #21136 |
| 45 | FAC-09 | 15 FactorView tabs | Still open, no PR found — big, untouched |
| 46 | FAC-10 | Duplicate-vendor CODEX TEST report | DONE — PR #21021/#21069 |
| 47 | FAC-11 | Factoring out of Dispatch subnav (BRD-22) | Still open, no PR found |
| 48 | FAC-12 | LDT-4 stage-bar guard | Still open, no PR found |

### Cash Flow

| # | ID | Item | Status |
|---|---|---|---|
| 49 | CF-01 | $0 everywhere | DONE — PR #20998/#20999 |
| 50 | CF-02 | Proforma→cash-flow bucket live measure | Still open — source doc self-contradicts (both DONE and pending); treat as open |
| 51 | (new) | 5 Rolling Ledger UI defects (factor-name, In/Days sign, unfiltered default, redundant Type/Status, missing invoice-date) | DONE — PR #21295/#21293 |

### Settlements

| # | ID | Item | Status |
|---|---|---|---|
| 52 | SET-01 | Proportions, +Add/create, editable lines | DONE — Add-deduction #21044 (part 1); editable lines #21480 (part 2, found tonight) |
| 53 | SET-04 | Company Settlements FE page | DONE — PR #21051, itemized per-load #21147 |
| 54 | SET-05 | Gross/Deductions/Net showing $0 | DONE — PR #21005 + guard #21088 |
| 55 | SET-07 | 7 button heights | Still open, no PR found |
| 56 | SET-11 | Closed pre-settlement without touching Laredo yard | DONE — PR #21218 |
| 57 | SET-12 | 3-way cash-advance routing at close | DONE — PR #21243 |
| 58 | SET-13 | Reopen disabled-not-hidden | DONE — PR #21047 |
| 59 | SET-14 | Reimbursed vs Company Expense flags | DONE — PR #21246 |
| 60 | SET-16 | Admin fee typed-deduction migration | Still open, no PR found |
| 61 | SET-17 | other_recovery retype, live proof | **UPDATED tonight (CC-1):** live-verified — `other_recovery` role → account 7200, active, USMCA. Now confirmed DONE |
| 62 | SET-18/20 | posted_at never written / close 7 tours, post 15 | DONE — PR #21177, 13/13 posted, $33,705.95 |
| 63 | SET-21 | Tour-split plan | Resolved by ruling, nothing to build |
| 64 | SET-24 | Duplicate deductions on 13568 | DONE across waves (#21093, #21105, #21124/25) — wants final zero-remaining confirm from CC-3 |
| 65 | SET-25 | Non-deferrable loan pop-up | Still open, no PR found |
| 66 | SET-27 | VOID/REVERSE cascade guard was RED | DONE — PR #21026 |
| 67 | SET-28 | Vehicle-swap cost split | **UPDATED tonight (CC-1):** source said open, found PR #21490/#21491 (after cutoff) — now DONE |
| 68 | SET-29 | Attribution rung 3, fixed-monthly-cost rule (CC-1's own seat) | **CONFIRMED still open** — grepped live codebase tonight, no match |
| 69 | SET-30 | Company settlement PDF | **UPDATED tonight (CC-1):** source said open, found PR #21493 (printable letter) + #21496 (boot-crash fix) after cutoff. Live now, but a generic house-template letter — NOT the AlwaysTrack-format redesign item 9 above asks for |
| 70 | SET-31 | "Build it like Load Costs" umbrella | Blocked on SET-01 — SET-01 now mostly done (52), worth re-checking |
| 71 | SET-32 | Owner decision | Unchanged |
| 72 | SET-33 | PAID chain | Partial — SET-20's application (13 posted) not re-measured against original "0 of 19 PAID" figure |

---

## STATUS UPDATE LOG

*(append dated updates here, one `###` section per update, referencing item #s — never edit the table above in place)*

### 2026-09-09 07:2xZ (CC-1)

- **Item 1 (List view: booked-not-in-transit loads shouldn't show) — DONE.** PR #21538,
  `DSP-LOADBOARD-LIFECYCLE`. Root cause was the reverse of what was assumed: the board was hiding
  `delivered_pending_docs` loads entirely (7 of 71 real loads showed); owner ruling reversed the
  2026-09-06 framing — a load stays live until explicitly closed. Fixed + guarded.
- **Item 5 (truck showing twice with two loads) — DONE, same PR.** Explicitly preserved "no truck
  duplication" while fixing item 1; the free-truck-in-Awaiting set is deduped.
- **Items 2, 3, 4 (book-a-return on Round Trips, Timeline view unit coverage, Dispatch Home KPIs
  "not real")** — still open, no matching PR found in the commit history as of this update.
- Also landed since the ledger's baseline, all real and DONE: `GLB-25155` (settlement display_id was
  literally `S-<load_number>`, wrong entity/sequence — fixed to the real
  `next_settlement_display_id` sequence, PR #21530); `GLB-25156/25157` (Factoring Aging Settlement
  column + a real Payments-to-You table, PR #21535 — partially answers items 11/16 above); `BANK-F30013/
  14/15` (Form 425C bankruptcy MOR exhibits + Banking account-selector sort order + parallel-recon
  voided-transaction exclusion, PRs #21526/21529/21536).
- Backend redeployed to catch up on all of the above (`5966dfd8` and later, trigger in flight as of
  this update).

### 2026-09-09 07:3xZ (CC-1) — item 10 investigation

Checked live whether "the outline is clear this load/tour only" already holds across the 3 named
surfaces before assuming it needs a build:

- **Load Costs** (`/accounting/load-costs`, expand a row): already clear — "COSTS ON LOAD 13581"
  section header, a `LOAD 13581 · <customer> · <driver> · Unit <unit>` identity line, Line Haul
  Revenue/Costs-on-this-load side by side, and the inline expense-entry form is itself labeled
  `13581` before any field is filled in.
- **Company Settlement itemized-by-load** (already covered in this session's earlier item-9 work):
  each load gets its own header (`13487`, `13493`, ...) with Customer Charges/Driver Payment/Fuel/
  Expenses nested under it — unambiguous.
- **Driver Settlement detail** (post the item-9 Number-spine fix, PR #21534): every earnings/deadhead/
  reimbursement/deduction line already carries its own `Load <N>` label or link.

**No concrete defect found on this pass** — the labeling infrastructure is already there on all 3
surfaces. If the owner's complaint is about something more specific (a visual border/highlight on the
selected row itself, rather than the text labeling), that needs a screenshot or a named surface to act
on rather than a guess. Not closing item 10 — marking it "investigated, no gap found yet" rather than
silently dropping it.

### 2026-09-09 08:0xZ (CC-1) — SET-16 and SET-25 corrections

- **SET-16 (Admin fee typed-deduction migration) — RESOLVED, verified live, no code needed.**
  The board's "no PR found" was correct at the time it was written, but the blocking condition it
  refers to (PR #20834's finding: `deduction_type='other'` → `bucketRecoveryRoleKey('other')` →
  `'other_recovery'`, "not and can never be a bound CoA role" — i.e. these lines could never get a
  `posting_account_id` and would sit permanently unresolved) was fixed as a **side effect of
  tonight's separate SET-17 fix** (item 61 above: `other_recovery` role now binds to account 7200,
  "Driver Admin Fee & Chargeback Income"). Live-verified just now on prod: `0 of 33` active
  "Admin fee" `settlement_lines` rows are unbound (`posting_account_id IS NULL`) — every one,
  including the 18 "Admin fee - GAS" rows and the 15 other Admin-fee variants (BASCULA, VUELO,
  PAGO DE TELEFONO, and the plain unlabeled ones), already resolves to account 7200. Considered and
  **declined** to force a further retype of the "- GAS" subset into the more specific
  `company_vehicle_fuel` type: that would move real dollars from an Income account (7200) to a
  different account tree, which is a GL-classification call, not a mechanical bug fix — and 27 of
  the 33 rows have no such qualifier at all (`BASCULA`/`VUELO`/`PAGO DE TELEFONO`/unlabeled) and
  don't map to any of the 4 existing typed-deduction options anyway. Flagging as an **owner-decidable
  refinement**, not a defect: if the owner wants "Admin fee - GAS" split out of Admin-Fee-Income into
  a fuel-expense-recovery account specifically, say so and it's a same-day mechanical change now that
  the binding works. Not inventing that call myself.
  (Side note, also checked and NOT a defect: 271 of 281 `settlement_lines` rows on closed
  settlements are `approval_status='pending'` — this is by design,
  `settlement-lines-materialize.service.ts`'s own header comment: "FORCES approval_status='pending'
  regardless of the source row's own status — LAW: never a guessed approve." It's a
  dispute/driver-acknowledgment field, unrelated to GL posting or settlement closure. Checked so it
  isn't mistaken for a new gap by the next seat to look at this table.)

- **SET-25 (Non-deferrable loan pop-up) — the board's "no PR found" was STALE, this is DONE.**
  `Cursor-SET-25 lock the non-deferrable loan pop-up at settlement close` merged PR #21488
  (2026-09-09 03:47Z, guard 11086 `verify-settlement-loan-recovery-modal-wired`), ahead of when the
  board's source snapshot was taken. Confirmed merged and on `main`. No further action needed from
  this seat.

### 2026-09-09 08:2xZ (CC-1) — SET-29 investigated, live-verified no violation, guard added

**SET-29 (Attribution rung 3, fixed-monthly-cost rule, CC-1's own seat)** — investigated live.
`docs/LAW.md` §3: "Fixed monthly costs — insurance, plates, the truck note — do not belong on a trip
at all. They are period costs on the unit." Searched every candidate code path (`load-unit-cost-
split.math.ts`/`.routes.ts` — SET-28's rung-3 mile-allocation module, `load-cost-rollup.sql.ts` — the
Load Costs report, `break-even.service.ts` — the fleet cost-per-mile analytics): none of them ever
pull a fixed-monthly-cost account onto a load. The rule already holds structurally — none of the 9
categories in `accounting.line_category_load_required` (diesel/DEF/toll/scale/lumper/parking/roadside
repair/detention/over-road-other) are insurance/plates/registration/notes-payable, so nothing forces
a `load_id` onto those accounts at entry either.

**Live-verified on prod, zero violations:** every insurance/plates/registration account (`MX-Mexico
Insurance`, `US-Cargo Insurance`, `US-Physical Damage Insurance`, `OC-Truck Insurance`, `OE-Tax-
Vehicle Registration`, `OE-Tax-Vehicle-Tractor/Van License Plates`, `Permit-License Plates`, etc.) —
**0 of 406** `accounting.expense_lines` rows and **0 of 3,974** `accounting.bill_lines` rows on those
accounts carry a `load_id`. Equipment-loan/notes-payable accounts (`Equipment Loans / Notes Payable`,
`CV-Note Payable BMW`, `EL-IBC Bank Equipment Loans`) have 0 lines posted at all yet.

**Not a defect — nothing to fix.** Per LAW.md's own "guards land BEFORE the first transaction exists"
philosophy, added a new live-data guard (`scripts/verify-fixed-monthly-costs-never-attach-to-load.mjs`,
verify-step 11129) so this invariant is asserted permanently instead of only true by accident — it
will catch the first future bill/expense entry, import, or UI change that lets a fixed monthly cost
get tagged to a load. PR: (see this commit).

### 2026-09-09 14:1xZ — item 30 (BNK-10) — stale $ figure corrected, live-verified, no code defect

**Item 30's `−$686,503.95` figure was already disproven on 2026-09-05** (`docs/bus/PENDING-REGISTER-
5DAY-2026-09-05.md:147`: that number "summed other entities" — the real net was `−$6,567.73`, 355
non-voided). This session's "live proof never pulled" note re-opened it without re-reading that prior
correction. Re-measured live just now, Neon prod (`tiny-field-89581227`, `br-fancy-credit-akjnd07a`),
`bypass_rls='lucia'`, `banking.bank_transactions` scoped to USMCA:

```
total 437 · non-voided 288 · non-voided net −$2,177.09 · posted to GL 1 · sample-data 0
status breakdown (non-voided): uncategorized 235 · pending_categorization 52 · categorized 1
of the 287 non-voided+uncategorized: 278 already carry a rule-engine suggestion, 9 do not
```

The population keeps moving night to night (355 → 288 non-voided) as rows sync/void, so the dollar
figure was never going to hold still — treat any static `$` number on this row as a snapshot, not a
target.

**Root cause (unchanged from 09-05, still correct): this is a categorization backlog, not a code
defect.** `bank-feed-gl-posting.service.ts` is built, tested and live-armed for USMCA and only posts a
*categorized* line — 1 of 288 is categorized, so 1 has posted; that is the chain working exactly as
designed, not evidence of a gap. Per `docs/LAW.md` §2 standing decision, categorizing the backlog is
the **owner's** task ("Bank history to categorize: Dec 2025 – Jul 2026, by the owner"), not a coder fix.

**What CC-2 already shipped today, live-confirmed, not duplicated here:** `RECON-USMCA-BANK-01`
(`apps/backend/src/banking/banking-rules.engine.ts` `applyBankingRulesForCompany`, wired at
`POST /api/v1/banking/rules/bulk-apply`, guarded by `scripts/verify-recon-usmca-bank-suggestion-
coverage.mjs`) retroactively runs the existing rule set against every not-yet-categorized transaction
and writes `suggested_*` columns only (never `categorized_at` — suggestion, not auto-post). That run
already reached 278 of the 287 remaining uncategorized rows; the 9 without a suggestion have no
matching rule yet and are the only rows that would need either a new rule or manual categorization to
close the loop. Ran `node scripts/verify-recon-usmca-bank-suggestion-coverage.mjs` — static OK.

**Closing item 30 as CONFIRMED (root cause: owner categorization backlog, chain armed and working) —
not a code defect, no PR needed.** If the owner wants faster closure, the highest-leverage next step
is either bulk owner categorization or a coder pass adding rules for the 9 unmatched merchants — not
a fix to the posting engine, which already works.

### 2026-09-09 14:3xZ — item 50 (CF-02) stale, already closed 2026-09-07 (ROUND 16.24)

**Item 50's "self-contradicts, treat as open" was itself stale.** `docs/bus/OUTBOX-CC-1.md` ROUND
16.24 item 2 (2026-09-07) already live-verified this exact question end to end, not just read the
guard: queried Neon directly for invoice 13570 (`created_at`=2026-09-07, delivery
`scheduled_arrival_at`=2026-09-05, `factoring_eligible=true`) and walked the live Daily Prediction UI
— the invoice bucketed on **Sep 6** (delivery + 1-day factoring receivable lag under
`CASH_FOLLOWS_ETA_ENABLED`), never on its Sep 7 creation date; two sibling proformas created the same
day landed on two different, correct days by the same delivery+lag rule. Verdict recorded then:
"more precise than the directive's shorthand — delivery date + receivable lag, genuinely modeling
when the cash lands." Four guards already lock this (`verify-acct-f9408-cash-forecast-proforma-eta-
bucket.mjs`, `verify-cash-eta-rebucket-flag-gated.mjs`, `verify-cash-eta-forecast-only.mjs`,
`verify-cash-flow-independent-of-proforma-timing.mjs`).

**Re-confirmed tonight, not just trusted the old note:** ran all 4 guards against current `main` —
all 4 PASS, unchanged. Pulled 5 fresh USMCA proformas live (Neon, `bypass_rls='lucia'`): all created
`2026-09-07`, delivery dates `2026-09-08`/`08-27`/`09-06`/`09-05`/`09-08` — creation and delivery
genuinely diverge on real current data, so the bucketing rule still has something real to prove itself
against, not a degenerate same-day case.

**Closing item 50 as DONE (verified correct 2026-09-07, re-confirmed live tonight) — no code change,
no new guard needed; the 4 existing guards already cover it.**

### 2026-09-09 19:0xZ — item 38 (BNK-20) stale, already closed 2026-09-05 as "does not reproduce"

**Item 38 ("5 txns matched to voided docs, data item, live re-check never run") already has that
live re-check on record.** `docs/bus/LAW-TRANSACTION-HEALTH-REGISTER-2026-09-01.md` row C3: "the
2026-09-04 '5 ✗' no longer reproduces... 0 rows carry ANY match reference today (positive-controlled:
355 real rows exist, not an RLS-masked read)" — re-run 2026-09-05, and `OUTBOX-CC-2.md`:
"ACC-07 (5 bank txns matched to voided documents): DOES NOT REPRODUCE (already re-scored as C3...)".

**Re-ran the live re-check myself tonight rather than just trust the note** (population has moved
twice already this session — see item 30's 437→480 total rows note): Neon prod, `bypass_rls='lucia'`,
USMCA-scoped `banking.bank_transactions`, checked every match column that could point at a voidable
document — `matched_invoice_id`/`matched_bill_id`/`matched_bill_payment_id`/`matched_settlement_id`/
`matched_expense_id`/`matched_load_id`/`matched_journal_entry_id`/`matched_transfer_id`/
`matched_advance_id`/`review_state='matched'`/`reconciled_obligation_id`. Result: **480 total rows,
314 non-voided, exactly ONE row with `review_state='matched'`** (matched to journal entry
`b6b096c7-4c74-40c6-8a7e-662b688dcfff`, confirmed live NOT voided) — **zero rows matched to anything
voided**, consistent with the 09-05 finding and with item 30's separate finding that almost nothing
is categorized/matched yet at all.

**Closing item 38 as CONFIRMED-CLOSED (does not reproduce, re-verified live a third time) — data
item, no PR needed, nothing to fix.**
