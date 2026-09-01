# OWNER REQUIREMENTS — MASTER MAP

> **CURSOR LEAD VERIFY 2026-09-01 live=`8112092`:** Phase-1 Cancel loads / settlements Reverse / Hide voided / Receive Payment nav = **DONE on live**. Cascade Void = **DESIGN ONLY** (`docs/bus/CASCADE-VOID-DESIGN-FOR-OWNER-2026-09-01.md`). Multi-select "Void" wording on settlements/loads = Reverse/Cancel (UX gap). Insurance + unit deact + perm wiring = **still OPEN** as Claude mapped. CC-2 A5 accepted.

---
## Every requirement stated this session. Owner, status, evidence.

Compiled 2026-09-01. **This exists because requirements stated early tonight were displaced by
firefighting and stopped being anybody's job.** That is a lead failure. This map makes dropping
one visible.

STATUS KEY: **ACTIVE** = a seat is working it now · **QUEUED** = assigned, not started ·
**DROPPED** = was assigned, no longer owned · **NEW** = assigned this hour · **DONE** = verified

---

## 1 · VOID & PURGE

| # | Requirement | Owner | Status |
|---|---|---|---|
| 1.1 | Void all test/sample transactions | OWNER (manual) | **ACTIVE** — 243 done, ~60 left |
| 1.2 | PURGE test data, not just void — it is junk, not real voided records | CC-1 | **QUEUED** — blocked on 1.3 |
| 1.3 | Reversal JEs must inherit `is_sample_data` | CC-1 | **ACTIVE** — blocks the purge |
| 1.4 | Trial balance identical before/after purge or roll back | CC-2 | **QUEUED** |
| 1.5 | CASCADE VOID — one place, shows dependency tree, voids linked records together | CURSOR + CC-1 | **NEW** — design posted to owner FIRST |
| 1.6 | Void reason = DROPDOWN CATALOG, optional memo. No free typing | CURSOR | **DONE** — `catalogs.void_cancel_reasons` + VoidReasonModal |
| 1.7 | Void restricted to Owner/Accountant; others greyed + "request from Owner" | CC-1 | **QUEUED** — reuse `identity.workflow_requests` |
| 1.8 | Multi-select void on EVERY accounting table | CURSOR | **ACTIVE** — still missing on settlements + loads |
| 1.9 | Bulk pre-validation — show unvoidable rows BEFORE running | CURSOR | **QUEUED** |
| 1.10 | Voiding un-categorizes the bank transaction, both directions | CC-1 | **QUEUED** — LINKAGE INTEGRITY LAW |
| 1.11 | Never-posted documents: delete, don't fabricate a reversal | CC-1 | **QUEUED** |

## 2 · COLUMNS, FILTERS, SEARCH — systemwide

| # | Requirement | Owner | Status |
|---|---|---|---|
| 2.1 | Every column sortable asc/desc, every module | CC-3 | **ACTIVE** |
| 2.2 | Columns MOVABLE (drag to reorder) — does not exist | CC-3 | **QUEUED** |
| 2.3 | Column AUTO-FIT — payee, vendor, state must show fully | CC-3 | **QUEUED** |
| 2.4 | Filters = COMBO BOXES, correct proportion | CC-3 | **QUEUED** |
| 2.5 | Search must cover amount, load #, PO, BOL, date, status | CURSOR | **QUEUED** — shared builder |
| 2.6 | Search must render TRUE data | CURSOR | **QUEUED** |
| 2.7 | Filter/gear must let you select what to view (incl. posted only) | CURSOR | **QUEUED** |
| 2.8 | Hide voided by default, toggle to show | CURSOR | **QUEUED** |

## 3 · UI CONTROL LAW

| # | Requirement | Owner | Status |
|---|---|---|---|
| 3.1 | All buttons same size and text scale | CC-3 | **ACTIVE** — h-9 confirmed |
| 3.2 | Checkboxes bigger (≥24×24 hit target) | CC-3 | **ACTIVE** |
| 3.3 | Gear icon bigger, real icon not glyph | CC-3 | **ACTIVE** — h-4 w-4 |
| 3.4 | Duplicate Create buttons in accounting — consolidate | CURSOR | **QUEUED** |
| 3.5 | Receive Payments missing from accounting nav | CURSOR | **QUEUED — reported 4×** |

## 4 · VOID VISIBILITY & MONEY COLUMNS

| # | Requirement | Owner | Status |
|---|---|---|---|
| 4.1 | VOID banner at top of detail view | CC-1 | **QUEUED** |
| 4.2 | Void as first-class status column + filter + gear | CURSOR | **QUEUED** |
| 4.3 | Three money columns: Total · Open · Variance (red when non-zero) | DEVIN-A → CC-1 | **QUEUED** |
| 4.4 | Void button inside the transaction, not only the list | CC-1 | **QUEUED** |

## 5 · DISPATCH BOARD

| # | Requirement | Owner | Status |
|---|---|---|---|
| 5.1 | KEEP pickup city + delivery city columns | CURSOR | **NEW** |
| 5.2 | ADD pickup DATE, pickup TIME, delivery DATE, delivery TIME | CURSOR | **NEW** — data exists in `mdata.load_stops` |
| 5.3 | Board = LIVE loads only; completed/cancelled to own History tab | CURSOR | **NEW** — 65 of 78 are finished |
| 5.4 | Each section its OWN headers, sort, filters | CURSOR | **NEW** |
| 5.5 | Dispatcher on-screen confirmation on assignment + owner override | **NOBODY** | **DROPPED** ⚠ |

## 6 · SETTLEMENTS

| # | Requirement | Owner | Status |
|---|---|---|---|
| 6.1 | Settlement # · Period Begin · Period End on every surface | CASCADE + CC-1 | **QUEUED** — main grid verified compliant |
| 6.2 | Settlement void/reverse path — none exists | CC-1 | **ACTIVE** |
| 6.3 | Approval required + owner POPUP + AUDIBLE ALARM | CC-1 | **QUEUED** |
| 6.4 | Negative net pay → asset/liability automatically, NEVER write off | CC-1 | **QUEUED** |
| 6.5 | Multi-select on settlements — none exists | CURSOR | **QUEUED** |

## 7 · DRIVERS

| # | Requirement | Owner | Status |
|---|---|---|---|
| 7.1 | Every driver who moved a 2026 load gets BOTH accounts | CC-1 | **QUEUED** — 6 of 14 missing |
| 7.2 | Accounts auto-create on driver creation | CC-1 | **QUEUED** |
| 7.3 | No load in 40 days → auto INACTIVE | CC-1 | **QUEUED** |
| 7.4 | One person = one financial identity | CODEX | **ACTIVE** — `DRIVER-PERSON-IDENTITY-01` |
| 7.5 | Pre-2026 backfill DEFERRED | — | **RULED** |

## 8 · INSURANCE ⚠ ENTIRE SECTION DROPPED

| # | Requirement | Owner | Status |
|---|---|---|---|
| 8.1 | Upload COI + ID card to EACH unit, live Chrome | **NOBODY** | **DROPPED** ⚠ — 0 documents attached |
| 8.2 | Insurance policies + truck/trailer values created | **NOBODY** | **DROPPED** ⚠ |
| 8.3 | Insurance REQUEST workflow via company email (COI for customer or driver) | **NOBODY** | **DROPPED** ⚠ |
| 8.4 | Lease contract TRK → USMCA at monthly payment × 1.16 | **NOBODY** | **DROPPED** ⚠ |
| 8.5 | T144 removal / T163 COI tracking | **NOBODY** | **DROPPED** ⚠ |
| 8.6 | $10,000 unaccounted on EDSA down payment | **NOBODY** | **DROPPED** ⚠ |
| 8.7 | `mdata.assets`: 0 trailers, `insured_value_cents` empty on all 90 | **NOBODY** | **DROPPED** ⚠ |

## 9 · UNITS

| # | Requirement | Owner | Status |
|---|---|---|---|
| 9.1 | Deactivate trucks not active; leave only insured units | CURSOR | **REPORTED BLOCKED** — `docs/bus/UNIT-DEACTIVATION-REPORT-2026-09-01.md` (policy_unit=0) |

## 10 · PERMISSIONS

| # | Requirement | Owner | Status |
|---|---|---|---|
| 10.1 | Everything editable by permission, always traceable | CURSOR | **DONE** — applied, `PERMISSION_MODEL_ENFORCED` OFF |
| 10.2 | Martin Castillo → Accountant | CC-1 | **QUEUED** |
| 10.3 | Split `settlement.approve` / `settlement.pay` | CC-1 | **QUEUED** |
| 10.4 | Wire code to `has_permission()` instead of role strings | **NOBODY** | **DROPPED** ⚠ — the wiring PR was always "separate" |

## 11 · ACCOUNTING INTEGRITY

| # | Requirement | Owner | Status |
|---|---|---|---|
| 11.1 | Transaction Health Register, full wiring | CC-2 + CURSOR | **ACTIVE** — 6 checks live, 33 to go |
| 11.2 | A/R tie-out to $0.00 | CC-1 | **ACTIVE** — out $1,215.75 |
| 11.3 | A/P tie-out to $0.00 | CC-1 | **ACTIVE** — out $268.77 |
| 11.4 | Bills auto-create on every path | CC-1 | **ACTIVE** — 31 real backlog |
| 11.5 | Expense numbering `<load#>-<seq>` | CC-1 | **QUEUED** — 129 NULL |
| 11.6 | Three dates: incurred · issued · cleared | CC-1 | **QUEUED** |
| 11.7 | 2025–Jul 2026 USMCA transactions — owner categorizes | OWNER | **PENDING** — 157 pre-operation + 28 future-dated |
| 11.8 | Proforma feeds cash flow, stays out of A/R | — | **LOCKED — DO NOT TOUCH** |

---

## THE NINE DROPPED ITEMS

**5.5** dispatcher confirmation · **8.1–8.7** the entire insurance module · **9.1** unit
deactivation · **10.4** permission wiring.

Insurance is the largest gap. The owner uploaded signed policies, premiums, and COIs hours ago;
eight insurance tables exist; **zero documents are attached to any unit**, and no seat is working
it. It was assigned to CC-3 and displaced by the UI CONTROL LAW.
