# MASTER OPEN-ITEMS INVENTORY · 2026-09-01 03:20Z
**Nothing on this list may be dropped, forgotten, or silently closed.** Every item has an owner.
Closing one requires evidence in an OUTBOX. Cursor re-publishes this every lead turn.

## ⚡ P0 — THE BOARD'S TOP ITEM
| # | item | owner | state |
|---|---|---|---|
| 1 | **VOID 10 LOADS + RECREATE LIVE IN CHROME**, every hop clicked and verified. All preconditions dropped. | DEVIN-A + CC-3 walk · CC-1 fixes live · CC-2 grades live | **OPEN — NOW** |

## SETTLEMENTS — GLOBAL COLUMN STANDARD (owner-stated, systemwide)
| # | item | owner | state |
|---|---|---|---|
| 2 | ~~Settlements page has NO settlement grid~~ — **WITHDRAWN 2026-09-01, I WAS WRONG.** `SettlementsTable.tsx` exists, is imported at `SettlementsPage.tsx:11` and rendered at `:363`, and HAS Settlement # + Period. Cursor was right. See `CORRECTION-SETL-GRID-AND-BILL-LINKAGE-2026-09-01.md`. | — | **CLOSED — FALSE** |
| 3 | **Mandatory columns on EVERY settlement surface:** Settlement # · Period Begin · Period End · Driver · Status · Gross · Deductions · Net · Paid date. **On the main settlements grid these already render.** Remaining scope = every OTHER surface (driver detail, payroll, reports, exports) — unverified. | CASCADE | **OPEN — RESCOPED** |
| 4 | **A settlement is the PARENT of its loads — one-to-many.** Drill-down or expandable row. A load number must NEVER stand in place of a settlement number. | CASCADE | **OPEN** |
| 5 | **Sweep every surface**: driver detail, payroll, reports, exports. (Settlements page itself now verified compliant.) | CASCADE | **OPEN** |
| 5b | `SETL-UX-01` — on the page titled Settlements, `OpenDriverBillsPanel` (DRIVER · LOAD NUMBER · BILL NUMBER · AMOUNT) renders **above** `SettlementsTable`, so the first grid the owner sees is a bills table keyed on load number. Reorder or tab it. **LOW, not a blocker.** | CURSOR | **OPEN** |
| 6 | Guard + selftest **named in a workflow**: a settlement grid cannot ship without `display_id`, `period_start`, `period_end`. | CC-2 | **OPEN** |

## MONEY CHAIN
| # | item | detail | owner | state |
|---|---|---|---|---|
| 7 | Driver bill auto-create on **EVERY path** | hand, Chrome, import, API — one shared minting function, **fails loud**, never silent-skips | CC-1 | OPEN |
| 8 | **Repair path a human can reach** for a missing bill | owner/accountant mint from the load, confirmed + logged | CC-1 | OPEN |
| 9 | Repair the **39 loads with no driver bill** | **16 are REAL — $14,789.50 of revenue with no driver pay recorded.** Figure **RE-VERIFIED 2026-09-01** against `pg_constraint`: `driver_bills.load_id` is `NOT NULL` with FK → `mdata.loads(id) ON DELETE RESTRICT`, so `load_id` IS the true linkage and the count stands. Devin-A's contrary claim is withdrawn. | CC-1 | OPEN |
| 10 | Pay-rate **resolution** onto loads | 94 rates exist; not resolving. 19 loads had a rate and still got no bill | CC-1 | OPEN |
| 11 | Factoring constants | 0.95/0.025 → **97.00 / 1.50 / 1.50 / $10 flat**, proving **92,102.74** | CC-1 | OPEN |
| 12 | Settle gaps | L-0017 (bill, no line) · L-0002 (no bill) · L-0003 (settled while ineligible) | CC-1 | OPEN |
| 13 | `SETL-DUAL-APPROVAL-STATE-CONTRADICTION` | 4 settlements: `status='approved'` **and** `approval_status='needs_review'` | CC-2 filed | OPEN |
| 14 | Bank: money-OUT record | no money-out bank txn exists for any posted bill payment; **the walk will produce one** | CODEX | BLOCKED-BY-WALK |
| 15 | `RECON-CLOSED-SESSION-NO-AUTHORIZED-PATH` | owner/accountant reopen-or-adjust path, logged | CC-1 | OPEN |

## DRIVERS
| # | item | detail | owner | state |
|---|---|---|---|---|
| 16 | Account **PAIR** for the **2026 roster — 15 drivers only** | 13 missing escrow, 6 missing advance. Match by canonical person, not raw name | CC-1 | OPEN |
| 17 | Pre-2026 driver backfill | **DEFERRED BY OWNER** until escrow-owed is verified | — | DEFERRED |
| 18 | Duplicate driver identities | 175 rows / **106 real people**; 3 people hold **two Active rows each** | CC-1 | OPEN, no merges yet |
| 19 | 3 drivers **Inactive while scheduled** on the signed policy | Ruben Pedro Perez Garcia · Fernando Mecor Hernandez · Vicente Santos Contreras | CC-3 | OPEN |
| 20 | Dispatcher **WARN + CONFIRM** | policy-schedule membership, **not** `assigned_driver_id`; logged; owner override | DEVIN-A | OPEN |

## INSURANCE
| # | item | detail | owner | state |
|---|---|---|---|---|
| 21 | **Insurance request feature** — AUTHORIZED | COI for customer · driver-add to insurer. Reuse `insurance.coi_request` + existing email pipeline. **No second table, no second sender.** COI attaches at **policy level**, not ×14 units | CC-3 | OPEN |
| 22 | Insured-asset reconciliation | 20 trailers into `mdata.assets` = **$343,495 exact**; TIV **$1,077,940** | CC-1 + CC-3 | OPEN |
| 23 | 27 asset rows for 15 insured VINs | dedupe register first, **no merges without CC-2** | CC-1 | OPEN |
| 24 | **Entity assignment** — T174 and others under Transportation while insured under USMCA | **OWNER RULES THIS. Nobody reassigns.** | OWNER | **AWAITING OWNER** |
| 25 | ID-card entity-scope **404** blocking 3 of 14 | the 404 IS the defect | CC-3 | OPEN |
| 26 | Coverage-status flag per unit | on-AL / on-APD / on-MTC / NOT EVIDENCED. T163 = "claimed, not evidenced". T144 = "leased to 2EMS, pending removal" | CC-3 | OPEN |
| 27 | Monthly insurance report cron | 5th, 07:00 CT, alarms on gaps — **confirm it is NAMED in a workflow** | CASCADE | NEAR-DONE |

## GUARDS & CI INTEGRITY
| # | item | detail | owner | state |
|---|---|---|---|---|
| 28 | **4,490 guards never named in any workflow** (of 4,680) | writing a guard ≠ shipping a guard | CC-2 | OPEN |
| 29 | **844 guards with no selftest arm** | never proven able to fail | CC-2 | OPEN |
| 30 | `verify:pre-commit` reporting | 2,503 steps "run" in 0.70s; must print **RAN / SKIPPED / why** | CC-2 | OPEN |
| 31 | **611 selftests mutate tracked source; 210 with no `finally`** | fix = copy to temp and plant there, not more `finally` | CC-2 | OPEN |
| 32 | **Posting trace** — the completion map | every money type → tables → DR=CR → CoA → linkage → orphans | CC-2 | OPEN |
| 33 | **Locked-state audit** | every lock/close/post: authorized owner+accountant path? logged? | CC-2 | OPEN |

## NAVY / UI
| # | item | detail | owner | state |
|---|---|---|---|---|
| 34 | **Denominator is 381, not 178** — correct it EVERYWHERE | 315 of 381 (82.7%) converted | CASCADE | OPEN |
| 35 | Safety (`HoverDropdown`) + WorkOrders (local-state tabs) | report what each needs; **do not force the component** | CASCADE | OPEN |
| 36 | Merge PRs #18916 · #18922 · #18924 · #18942 · #18944 | cleared | CASCADE | CLEARED |

## HOUSEKEEPING
| # | item | owner | state |
|---|---|---|---|
| 37 | Duplicate FKs `mdata_assets_tenant_id_fkey` / `mdata_assets_unit_id_fkey` — **a real defect, not cosmetic** (doubled write checks, ambiguous migrations). Keep `mdata_assets_equipment_id_fkey`. | CC-1 | OPEN, low priority |
| 38 | The 421-row void list (#18932) — **published, NOT executed** | CC-1 | HELD |

## ⛔ AWAITING THE OWNER — nobody proceeds on these
| # | decision |
|---|---|
| A | **Entity assignment** of insured units sitting under Transportation while insured under USMCA |
| B | **Pre-2026 driver backfill** — deferred until escrow-owed is verified |
| C | **EDSA**: T163 liability COI · T144 removal from all three policies · the **$10,000** gap in the signed guaranty · the **$2,532.18** FIF-vs-package difference |
| D | **Which entity** the settlement CSVs belong to — **$388,976.50** and **$75,918.76** remain **WITHDRAWN** until answered |

## CLOSED TONIGHT — do not re-raise
`DISPATCH-NO-1500-MILE-MEXICO-RADIUS-BLOCK` (no mileage restriction) ·
`BANK-RECON-ACCEPT-MATCH-500` (returns canonical conflict now) ·
`ACCT-F10162` (my false "no FKs" claim — **CC-1's #18928 was COMPLETE, credit CC-1**) ·
P0 `MissingRequiredChip` 404 (booking works, `L-20260831-0031`)
