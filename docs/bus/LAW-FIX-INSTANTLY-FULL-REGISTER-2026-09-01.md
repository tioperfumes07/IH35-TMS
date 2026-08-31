# LAW: FIX INSTANTLY, SYSTEMWIDE, VERTICALLY — FULL REGISTER, ALL ASSIGNED

Owner ruling, 2026-09-01. BINDING.

> "WE ARE DEFERRING BY NOT FIXING THE INSTANT WE FOUND OUT. AND THE LAW IS WE FIX
> INSTANTLY, AND SYSTEM WIDE, VERTICALLY."

## Lead failure being corrected

I filed 40 defects into a register over ~8 hours and dispatched a fraction of them. A defect
with an ID, a severity, and no owner actively working it **is a deferred defect**. Filing is
not fixing. Every item below now has a named owner and is worked top-down without waiting on
a lead, a review, or a sequencing decision from me.

**Rules that apply to every item:**
1. Fix the CENTER once (shared component / shared service / schema), then sweep modules.
   Never module-by-module reinvention.
2. Every fix ships with a guard **named in a workflow**. 4,490 of 4,680 guard scripts are
   named in no workflow — an unnamed guard is decoration.
3. No seat waits for another seat unless the dependency is stated in its own list.
4. Evidence before "done": record ID, URL, query. Never a seat's word.

---

## CC-1 — VOID LAW + the two P0s

| # | Defect | Evidence |
|---|---|---|
| 1 | `SETL-SELECTION-BINDING` **P0** | Picker S-20260830-0014 $144 → detail S-20260831-0006 $264. Pays the wrong driver. |
| 2 | `SETL-NO-VOID-PATH-01` **P0** | No route, no control. 6 schema columns dead. 17 settlements stuck. |
| 3 | `BANK-ORPHAN-01` | 4 bank txns still `categorized` against voided payments. |
| 4 | `VOID-BTN-01` | Void in list, absent from detail view. |
| 5 | `VOID-PERM-01` | Owner+Accountant only; greyed + "request from Owner" otherwise. Reuse `identity.workflow_requests` + OwnerApprovalPortalPage. |
| 6 | `INV-UI-VOID-01` | Void banner on detail; void as first-class status w/ filter + gear. |
| 7 | `RECON-NO-OPEN-SESSION` | 0 open sessions. Walk cannot reach PAID. |
| 8 | Bills never auto-created | 39 delivered loads, no bill. **16 real, $14,789.50.** Shared mint on every booking path + remint screen. |
| 9 | `SETL-DUAL-APPROVAL` | 4 settlements `approved` AND `needs_review`. |
| 10 | `SETL-NEGATIVE-NET-01` | 7 settlements closed with negative net pay, no carry-forward or debt record. |

## CURSOR — SEARCH LAW + BULK VOID + units

| # | Defect | Evidence |
|---|---|---|
| 11 | `INV-SEARCH-01` | `invoices.routes.ts:261-271` — display_id + customer_name only. Shared search builder; amount parsed dollars→cents. |
| 12 | Bulk void missing | Multiselect exists, no void action. Must call `void.service.ts`, never `set_status`. |
| 13 | Unit deactivation | Leave only insured units. T144 not yet (carrier hasn't removed). T163 keep + flag gap. |
| 14 | `SORT` root cause | Diagnose, hand to CC-3. Do not fix blind — 351 files. |
| 15 | Permission model | Apply after ordering fix + escalation guard + 2 primary owners. |
| 16 | `NAV-RECEIVE-PAYMENT-01` | Receive Payments dropped from accounting nav row. |
| 17 | `SETL-UX-01` | OpenDriverBillsPanel renders above SettlementsTable. |

## CC-3 — SORT LAW

| # | Defect | Evidence |
|---|---|---|
| 18 | `SORT-01` | Headers do not sort. ParityTable (351 files) implements it; wiring is broken. |
| 19 | `SORT-02` | Server-paginated + internal sort = orders only visible page. **Correctness bug.** |
| 20 | Sweep | Every column, every module, sortable unless written reason. |
| 21 | Insurance documents | 8 tables exist, **zero documents attached to any unit.** COI + ID card per unit, live Chrome. |

## DEVIN-A — MONEY COLUMN LAW

| # | Defect | Evidence |
|---|---|---|
| 22 | `INV-OPEN-VOID-01` | `amount_open_cents` generated col ignores `voided_at`. **33 voided invoices carry $45,837.34 phantom open.** |
| 23 | `INV-OPEN-VOID-02` | 5 consumers unverified. `collections.service.ts:134` **reaches a customer**. |
| 24 | `INV-UI-MONEY-01` | Total / Open / Variance everywhere money is listed. |
| 25 | Other generated cols | Same blind spot audit across every generated money column. |

## CC-2 — GUARDS (one per law) + infra

| # | Defect | Evidence |
|---|---|---|
| 26 | `GUARD-SELFTEST-MUTATES-SOURCE` | 611 selftests write into tracked source, 210 no `finally`. Reproduced live. |
| 27 | `GUARD-HOOKS-01` | Fresh worktree runs no hooks, exits 0 silently. `.husky/_` not tracked. |
| 28 | 4,490 unnamed guards | Of 4,680. Unnamed = decoration. |
| 29 | 844 guards with no selftest | |
| 30 | 4 new law guards | sort · search · void · money. All named in a workflow. |

## CASCADE — enumeration feeding all four laws

| # | Task |
|---|---|
| 31 | Per list/detail, per module: sort · search · void · money coverage. X of Y **declared** vs X of Y **actually working**. |
| 32 | Selection-binding sweep: every row→detail surface; does the detail assert it rendered the record requested? |
| 33 | Navy: PRs stay red until green. Parked. |

## CODEX — parity layer

| # | Task |
|---|---|
| 34 | Grade all four laws vs QuickBooks / NetSuite / McLeod with sources. |
| 35 | Driver accounts: of the 15-driver 2026 roster, who has advance / escrow / neither. Match BY PERSON — 3 split-name variants, 2 duplicate Active rows. Fail loud on ambiguity. |
| 36 | Frozen on money-out until CC-1 lands recon path. Bar stands. |

## NUMBERING — CURSOR, after search

| # | Defect | Evidence |
|---|---|---|
| 37 | `INV-NUMBERING-01` | Load numbers used as invoice numbers. Real series is `INV-2026-000xx`. |
| 38 | `SETL-NUMBERING-01` | Same: `S-2026-0003` alongside `S-20260830-0020`. |
| 39 | `EXP-NUMBERING-01` | **129 of 132 expenses have NULL expense_number.** Cannot be referenced or audited. |

## OWNER DECISIONS OUTSTANDING

| | |
|---|---|
| A | Martin Castillo holds `role='Owner'` but is the accountant — the SoD structure is inert for him. |
| B | Administrator holds **both** `settlement.approve` and `settlement.pay`. Textbook SoD gap. |
| C | 10 locked settlements, identical 08/01–08/31 period — duplicate generation, or legitimate? |
| D | `reverse` vs `void` on settlements — schema has both, they are not the same thing. |
| E | EDSA: $58,000 down payment agreed, $48,000 scheduled — **$10,000 unaccounted.** |
| F | Pre-2026 driver backfill (deferred by owner ruling — confirm still deferred). |

## DATA FACTS (verified, for reference)

- 0 of 19 real settlements have ever reached PAID.
- 202 sample documents still to void; ~$190,000 of sample money.
- `mdata.assets`: 90 rows, all `tractor`, **zero trailers**, `insured_value_cents` empty on all 90.
- Driver identity: 175 rows / 106 real people. `samsara_driver_id` is a scalar column — that is the root cause of the duplicates.
- Future-dated transactions sitting in the August book: 3 payments and 1 expense dated 09/15/2026.
