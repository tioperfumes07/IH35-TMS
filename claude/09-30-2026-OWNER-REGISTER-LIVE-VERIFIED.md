# OWNER REGISTER — everything reported 2026-09-30, verified live

**Verified against production (`br-fancy-credit-akjnd07a`) and against `origin/main` at 11:0x CT.**
Nothing in this file is from memory. Where a claim could not be verified it says so.

---

## A. WHAT IS LIVE RIGHT NOW (measured in the owner's Chrome, not from a build log)

| # | Item | State | Proof |
|---|---|---|---|
| A1 | Truck Line — CURRENT LOCATION in its own column | **LIVE** | header x=2186 w=168; all 17 body cells x=2186 w=168 — exact |
| A2 | Truck Line — station node above the truck (green circle visible) | **LIVE** | 112 node containers at z-index 6, truck layer at 5 |
| A3 | Truck Line — truck rides the rail | **LIVE** | container `top: 4px` (was 12) |
| A4 | Load Costs — 16 rows, not 14 | **LIVE** | $71,025; an invoice no longer closes a rolling load |
| A5 | Samsara odometer feed | **LIVE** | the 400 was a 4-type cap and we asked for 5; odometer flowing again |
| A6 | Driver settlement PDF = the on-screen statement | **LIVE** | 179,182 bytes, v10 skin, no Arial |
| A7 | Company settlement PDF | **LIVE** | it did not exist at all before today; 133,606 bytes |

## B. WHAT IS NOT LIVE AND WHY

| # | Item | Blocked on | Honest status |
|---|---|---|---|
| B1 | **The Truck Line node advancing** | PR #23410 merge + backend deploy | `dispatch.stop_arrivals` = **0 rows, ever**. The truck GRAPHIC moves (14 of 16 at "In transit"); the STAMPED node does not. Two different sources on one row. |
| B2 | Truck smoke clipped | PR #23423 | Cause found: the SVG's own viewBox ended at y=0, the exhaust finishes at y=−6.08 |
| B3 | PU/DEL date text size | PR #23423 | Measured: dates and UNIT/TOUR/LOAD are **all 14px**. Reduced anyway, per owner decision |
| B4 | Kanban drag Dispatched → At pickup | Cursor C-23 | Not started; C-20 driver profile is ahead of it |

## C. THE ENGINES

| # | Engine | State |
|---|---|---|
| C1 | Arrival detection on the poll path (T-01) | **BUILT, in #23410.** Root cause: `processArrivalDetectionsForGpsPoint` had ONE caller — the webhook — and no webhook has ever fired. 828,445 GPS points dropped before detection. |
| C2 | Arrival stop coordinates (T-01b) | **BUILT, in #23410.** T-01 alone would have produced zero forever: coordinates were read only from `mdata.locations` via `location_id`, which is NULL on all 35 candidate stops, while all 35 carry their own lat/lng. |
| C3 | Geofence mileage capture (T-21) | **NOT BUILT.** CC-3, after T-02..T-05. Known trap: 604 Love's geofences active, clean enter/exit pairs, **odometer NULL on every one** — the 2026-08-26 blackout. Real miles accrue forward only. |
| C4 | Manual fuel entry + geofence recommendation (B-25) | **NOT BUILT.** CC-2 started. Must be a SUGGESTION a human accepts, never an auto-created transaction. |
| C5 | MPG | **COMPUTABLE TODAY** — it never needed the odometer. 148 of 151 loads carry `miles_practical` with a stated source. |
| C6 | Company settlement MPG | **FIXED, in #23410.** It divided by `miles_shortest`, populated on 29 of 138 loads — it printed ~1.2 MPG for a fleet running near 7. |
| C7 | Bank-match candidates = ALL documents | **RULED + GUARD SHIPPED.** The old settlement-born-only guard was stale and is deleted, not exempted. |

## D. MONEY FINDINGS — measured, NOT changed (the freeze holds)

| # | Finding | Live number |
|---|---|---|
| D1 | SENT invoices with a real total and **zero lines** | **5** — 13616, 13618, 13620, 13621, 13622 = **$20,800.00**. This is EXACTLY Codex's unexplained "A/R exceeds GL by $20,800." Mystery closed. |
| D2 | A sent invoice for **$0.00** | 13525, Refrigerx, 08/10 |
| D3 | Invoices flagged `not_factored` whose customer **IS** assigned to a factor | **15**, **$47,995.00** — Refrigerx ×4, Semares ×2, EGRO ×3, PAYPA, Steam, IM Specialized, FLS, Supply Chain Mgmt, A1 Value |
| D4 | Invoices `not_factored` whose customer is genuinely not assigned | 2, $7,980 — 13593 Aligator, 13555 2EMS |
| D5 | **The factoring ledger tables are EMPTY** | `factoring.batch` 0 rows · `factor.faro_invoice_lines` 0 rows · `letter_of_release` 0 rows. The only record of factoring is a status column + advance id on the invoice row — for all 93 advanced invoices too. |
| D6 | Expenses "missing load attribution" (Codex's 168) | **NOT missing.** All **549** live expenses carry `load_id`. What is short is a parallel mirror table `expense_attribution.expense_load_links`, 168 rows behind — and **zero disagree** where both exist. Two places record the same fact. |
| D7 | A/P GL exceeds unpaid bills | $2,976.63 — CC-1, identify the documents, do not adjust |
| D8 | Escrow subledgers exceed mapped GL | $1,050.00 — CC-1, same rule |
| D9 | Expenses with contradictory posting statuses | 94 — CC-2. A row posted and not-posted at once means two writers disagree. Engine defect, not data. |

## E. DRIVER PROFILE / CUSTOMERS / VENDORS

| # | Item | State |
|---|---|---|
| E1 | Driver profile tab set | **RULED, #23421.** Settlements / Pre-settlements (a status filter, not a tab) / Cash Advances (an ASSET, never an expense) as accounting; Deductions a sub-ledger; Permits operational (`safety.permits` is keyed to `unit_id`); Disputes a cross-link. |
| E2 | Driver profile module built | **NOT BUILT.** Cursor C-20, ACKed and started, now unblocked by E1. |
| E3 | Maintenance section, tabs, KPIs | **NOT BUILT.** Cursor C-21/C-22. KPI resizing/reshaping sits in C-22 and C-01..C-08. |
| E4 | "Has transactions" | **RULED, then CORRECTED BY THE OWNER.** Real money movement only — a voided document does NOT count. Customers **65** of 1,249 (was 76). Vendors **34** of 623 (unchanged). |
| E5 | Disputes split | **THREE ways** per owner: driver / customer / vendor. Currently one screen for two of them. C-25 + A-25. |
| E6 | `accounting.bills.vendor_uuid` is TEXT, `mdata.vendors.id` is UUID | **REGISTERED A-26.** Every bill↔vendor join needs a cast today. Own job, own migration, own proof. |

## F. MAIN WAS RED — three blockers, none of them ours, all found by running the guard against `origin/main` itself

| # | Guard | Cause | State |
|---|---|---|---|
| F1 | `verify:no-duplicate-financial-ledger` | 2 new financial tables with no CANONICAL-CHECK; both already applied to production, so the migration is immutable | **FIXED, #23410** — declaration relocated, not waived, not baselined; new guard fences the relocation |
| F2 | `verify:migration-filenames` | 4 duplicate migration numbers, 8 files, all already applied | **FIXED, #23410** — accepted as history with the applied ORDER pasted; exact pairs frozen; a third file still fails |
| F3 | `verify:aggregate-schema-grants` | schema `downtime` has no GRANT USAGE in any migration | **IN PROGRESS, #23426 claims the number.** Production HAS the grant — so a fresh DB / DR restore would not. |

## G. MY OWN MISTAKES TODAY, recorded rather than buried

| # | What |
|---|---|
| G1 | Chased the Samsara odometer as if MPG were blocked on it. The miles were always in the app. Formal retraction written. |
| G2 | Told the owner every truck sat at "Dispatched". Wrong — 14 of 16 are at "In transit". |
| G3 | Called the `weekly-close` test failure "pre-existing, not mine" and moved on. It was real: the vitest setup inherited `NODE_ENV=production` from the Mac's login shell. Root-caused and fixed. |
| G4 | Accepted that a customer with only a VOIDED invoice "has transactions". The owner overruled it in one sentence and he was right. |
| G5 | Hand-picked verify-step numbers instead of running the claim helper. Two were already CC-3's. Reserved properly in #23425. |
| G6 | Wrote a comment claiming a sibling guard already froze 4 migration pairs. It did not. Checked before shipping, made it true, and said so. |

## H. OPEN PULL REQUESTS

| PR | What |
|---|---|
| #23410 | T-01, T-01b, S-01, M-01, the NODE_ENV fix, F1, F2 — **the big one** |
| #23421 | Driver profile ruling + the owner's "has transactions" correction |
| #23423 | Truck smoke viewBox + date size |
| #23425 | Verify-step number reservations (fixes my collision with CC-3) |
| #23426 | Migration number claim for the `downtime` grants |
| #23417 | Codex X-16 |
| #23367 | Aug/Sep reconciliation (older) |
| #23366 | CC-2 linkage fix (older) |
