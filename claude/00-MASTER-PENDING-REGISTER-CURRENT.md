# 00-MASTER-PENDING-REGISTER — CURRENT
# Claude Lead · 09-29-2026 22:5x CT · THE ONE LIST. Supersedes every earlier register.
# Rule: nothing is removed from this file. Items close with proof or are marked RETRACTED with the reason.

## OWNER PRIORITY — 09-29-2026, SUPERSEDES ALL SEQUENCING

**THE FACTORING ENGINE IS BUILT FIRST, COMPLETELY, BEFORE ANYTHING ELSE.**
Owner: *"I NEED THE FACTORING ENGINE FULLY BUILT FIRST, COMPLETELY DONE NOW. RENDERING DATA WHERE IT SHOULD RENDER, ETC."*

- **CC-2 works on nothing else.** Items 13, 14, 15, 16 are parked until factoring is live.
- Scope = `00-CANONICAL-FACTORING-POSTING-LOCKED.md` in full, including Amendments 1 and 2: items **42, 43, 45, 46, 48, 50, 51**.
- **Cursor's only job is unblocking CC-2** (items 61, 62). Board UI waits.
- Done means: engine on one code path · reversal path · constraint · guard · every non-conforming entry reclassified · all three Faro accounts rendering real data · wired to the existing factoring module and banking views · linkage declared both ways · QBO mapping · merged · deployed · deploy id pasted · live Chrome screenshot of Faro Factoring USMCA showing real purchased invoices.
- **No partial delivery. No "phase 1 complete." It does not stop until a person can open it in Chrome and click it.**


## A. YOUR BOOKS ARE WRONG TODAY — these cost money right now

| # | Seat | Item | Money | Status |
|---|---|---|---|---|
| 42 | CC-2 | **25 duplicate funding JEs, all copies differ from each other.** 53 live JE rows, 28 excess, posted 09-23..09-28, none voided. Invisible to every balance check because each copy balances. | **$79,857.74** | FOUND — untouched |
| 43 | CC-2 | **Faro purchase engine posts 5 different shapes for one event.** Root cause of every factoring number disagreeing. Canonical posting now LOCKED in `00-CANONICAL-FACTORING-POSTING-LOCKED.md`. | all factoring reporting | SPEC LOCKED — not built |
| 44 | Devin-B | **Fuel MTD overstated:** app shows $88,759.68, real is $11,749.90 once voids are excluded. | **$77,009.78** | FOUND — not fixed |
| 45 | CC-2 | **41 funding entries never debited Undeposited Funds.** Money never entered the clearing account. NOT the same as #48. | cash clearing wrong | RULED — not fixed |
| 46 | CC-2 | **3 Faro banking accounts render nothing** — Faro Factoring USMCA, Faro Escrow Reserve, Faro Cash Reserve. None was ever defined or wired. | reserve + purchase visibility | ORDERED (Amendment 2) |
| 47 | Devin-B | **430 bank rows hidden from the match queue** by 641 voided LEAD-REVERSAL matches. Real unmatched work nobody can see. | reconciliation blind | VERIFIED — not fixed |
| 48 | CC-2 | **$39,108 never swept out of Undeposited Funds** (15 advances). NOT the same as #45. | $39,108 misplaced | BLOCKED on #42 |

## B. ENGINE AND INTEGRITY

| # | Seat | Item | Status |
|---|---|---|---|
| 5 | CC-1 | Rebuild the void **detector** — NetSuite reversing mechanics stay as they are | OPEN |
| 49 | CC-1 | **`executeVoidCancel` has no case per entity.** Voids stamp `voided_at` by raw UPDATE without flipping status or writing the reversal. Root cause of #3 and #4. | IN FLIGHT |
| 50 | CC-2 | Unique constraint on (advance, posting type) + guard: no funding may post twice | ORDERED |
| 51 | CC-2 | Guard: every factoring JE must match one of the 4 canonical shapes | ORDERED |
| 3 | CC-1 | Advanced MTD counts voided advances (106 vs 93) — same root cause as #49 | IN FLIGHT |
| 4 | CC-1 | 95 invoices flagged advanced vs 93 advance records — same 2 rows as #3 | IN FLIGHT |
| 11 | CC-1 | Kill the 7-day wall-clock gate (Seat Contract §9: no guard decides on wall-clock) | OPEN |
| 52 | CC-1 | ACC-50 removal — open-tour posting gate removed, guard rewritten to the opposite invariant (PR #23153) | IN FLIGHT |
| 53 | Devin-B | Plaid pending→posted merge does not carry matches across. Fix the merge path, not just the one row. | ORDERED |

## C. DEVIN-B ROUND 271 — audit before purge (owner-sequenced)

| # | Phase | Item | Status |
|---|---|---|---|
| 54 | 1 | Void-contamination audit, all 18 void-carrying tables, every module/window/report | IN PROGRESS |
| 55 | 2 | One shared exclusion + CI ratchet so no future query can forget it | NOT STARTED |
| 9 | 3 | Void purge — archive first, children first, balance proof | AUTHORIZED, waits on 54+55 |
| 56 | 3a | **9 duplicate bank rows: APPROVED to purge.** 10th (f5bbddce…) held — carries live match 2d1f3f73… that must be re-pointed to the surviving row first | APPROVED / 1 HELD |
| 57 | 4 | Test/sample/demo purge — 59 flagged rows, then a name-matched list for the owner | NOT STARTED |
| 38 | 5 | Full posting audit — every engine, right account, right reason | NOT STARTED |

## D. DOCUMENTS

| # | Seat | Item | Status |
|---|---|---|---|
| 31 | Devin-A | Build the 3 locked v10 documents — driver settlement, company settlement, invoice | IN PROGRESS (R272) |
| 58 | Devin-A | Company settlement must auto-print the downtime ledger + real fuel cost per load + the 3 margins | IN PROGRESS |
| 59 | Devin-A | Invoice: APPROVED BY + METHOD under each detention/layover line | IN PROGRESS |
| 60 | Devin-A | Invoice auto-generates on delivered/closed when BOL exists → auto to the Faro queue | NOT STARTED |
| 32 | Devin-A | Draft-expense unposted flag on settlements | OPEN |
| 33 | Devin-A | 26 flagged idle events needing human review | OPEN |

## E. UNBLOCKING (Cursor is the unblocker seat — ROUND 273)

| # | Seat | Item | Status |
|---|---|---|---|
| 22 | Cursor | Main CI red — migration 202614530000 edited after apply | **DONE-VERIFIED** — restored byte-for-byte, deploy `dep-dau3h9u0tbcc73fr127g` live |
| 61 | Cursor | Register void-predicate leaf mappings for WriteCheckForm.tsx + SettlementCreatorDrawer.tsx — blocks CC-3's TruckLine | ORDERED |
| 62 | Cursor | Clear NO_CLEARING_PILEUP + open-tour guards holding CC-2's 3 branches (9 commits) | ORDERED |
| 63 | Cursor | **Do NOT merge cc-3/round157d-settlement-screens as-is** — 57 files / −3,579 lines, deletes unrelated guards. Stale rebase drift. | FLAGGED |
| 23 | Cursor | Close 7 dependabot PRs + 7 preview services | OPEN |
| 24–29 | Cursor | Board UI: 11-vs-14-vs-16 · canonical active-load set · return-trip rows · transit line · row height/filters · responsive width | OPEN — needs Chrome click-proof |

## F. DISPATCH / TELEMATICS

| # | Seat | Item | Status |
|---|---|---|---|
| 18 | CC-3 | 349 ungeocoded stops | **DONE** — 382/382 coordinated, 0 fabricated |
| 19 | CC-3 | Samsara odometer past 2026-08-26 | PARTIAL — 40 loads linked from 177,906 readings |
| 20 | CC-3 | Real Samsara idle duration per event window | PARTIAL — 5 NULL rows measured; 42 existing values not re-audited |
| 17 | CC-3 | Push ROUND 234 | BLOCKED on #1 |
| 21 | CC-3 | ROUND 235 truck line — split-commit answer | OPEN |
| 34 | Devin-B | Push 7 held commits once #17 lands | BLOCKED on #17 |

## G. LINKAGE

| # | Seat | Item | Status |
|---|---|---|---|
| 35 | Devin-B | `docs.files.dispatch_load_id` NULL on all 11 rate confirmations | OPEN |
| 36 | Devin-B | 424 expense lines with no load — $23,400.01 | OPEN |
| 37 | Devin-B | 22 driver bills unlinked | OPEN |

## H. OTHER SEATS

| # | Seat | Item | Status |
|---|---|---|---|
| 39 | Codex | Publish R264 — lane-cross granted | DO NOW |
| 40 | Codex | Explain why all 48 company margins differ | OPEN |
| 41 | Codex | Driver worksheet colors | **DONE** — 47 green / 1 red, measuring net pay |
| 13 | CC-2 | Check-number reconciliation, audited reset, next is 1006 | OPEN |
| 14 | CC-2 | Bill payment engine, QBO parity, open-bills panel | OPEN — after #42/#43 |
| 15 | CC-2 | ROUND 140.3 | OPEN |
| 16 | CC-2 | Loves statement · two-surface split · materiality | OPEN |
| 12 | CC-2 | Push P0 58e5356b11 | BLOCKED on #62 |
| 1 | CC-1 | Add 6 Faro invoices to `day_control.json` | **BLOCKED** — CC-1 cannot verify the figures and will not fabricate them. Needs the source Faro export rows. |
| 6 | CC-1 | Reinstate 10 AUTH-089 rows, 77 to review queue | OPEN |
| 7 | CC-1 | Post the clean drafts, one batch, idempotency key | IN FLIGHT — AUTH-131, 143/237 posted, drafts 257 → 114 |
| 8 | CC-1 | Batch bank-match, ambiguous left for the owner | OPEN |

## I. DEFERRED BY THE OWNER — do not build, do not let a guard assume otherwise

| # | Item |
|---|---|
| 64 | **Faro holdback → LOAN TO TRANSPORTATION account via the loan creator**, so deductions match against the loan. Owner deferred 09-29. |
| 65 | Purchase ≠ payments applied ≠ net wire. The gap is reserve. No guard may assume wire = advance. |

## J. RETRACTED — do not act on these, they are wrong

| # | Item | Why |
|---|---|---|
| 2 | "factor.faro_invoice_lines = 0 — the import never ran" | **WRONG.** CC-1 proved the writer is wired and ran a 34-row backfill on 09-13. The AUTH-001 purge on 09-23 wiped the table. Re-run the working import after the purge window; build nothing. |
| 10 | "15 invoices never sent to Faro" | **WRONG.** Owner: they are IH 35 TRANSPORTATION loads, not USMCA. Nothing to send. |
| 10b | "20 unfactored invoices, $69,685, all USMCA" | **WRONG**, same reason. |
| — | "201 unguarded RLS casts" | 129 unique locations (Devin-B) |
| — | "telematics.odometer_readings is empty" | 177,906 readings in `vehicle_locations` |
| — | "130/130 bill_payments unposted" | GL-exempt; cash posted via the settlement JE |
| — | "Build the void engine to QuickBooks' standard" | NetSuite model is correct and already implemented |
| — | "5 loads (13503/13504/13509/13533/13539) should be purged" | **UNVERIFIED.** CC-1 has not checked them against the Faro files. Nobody deletes a load nobody has verified. |
