# FH-1 — Fixed Assets + Depreciation — Design Spec (gated build)

**Status:** Design / Docs only (no code, no DDL, no posting, no cron). FINANCE block — designed live with Jorge, built **gated behind a flag default OFF**, **GUARD verifies the diff vs QuickBooks before merge**, never auto-fired, never self-merged.
**Audience:** Jorge + GUARD + accountant.
**Date:** 2026-06-14
**Part of:** the **Finance Hub** (FH-1…FH-6), delivered as **one hub with 6 tabs** (Fixed Assets · Loans · Amortization · Calculator · Taxes · Bankruptcy) — Jorge-approved interactive preview. FH-1 is the **foundation** — the asset register + depreciation engine that FH-2 (Loan Wizard) and FH-3 (Amortization) build on. **Supersedes** the earlier standalone DEPRECIATION design note.

**Jorge's locked answers (2026-06-14):** methods = **straight-line + accelerated (declining-balance) + Section 179 / bonus** (occasional full-first-year) — build these, assume no others. Asset classes = **vehicles only: trucks · trailers · cars** (no buildings; land kept as a non-depreciating guard if ever added). Useful life = **default 5 years, editable per asset, overridable to 1 year** (for §179/bonus full-year write-off).
**Grounds:** QBO behavior research (below) + the locked accounting principles (double-entry must balance or fail; VOID ≠ DELETE; every table `is_active` + soft-delete + audit columns; money-adjacent ships flag-OFF). All amounts integer cents; rates stored as exact decimals.

---

## 0. Executive summary — and the QBO gap we close

QuickBooks Online does **not** auto-post depreciation. Findings:
- QBO has **no built-in amortization/depreciation posting engine**. Even the **Fixed Asset module (Advanced tier only)** computes a schedule but does **NOT auto-create the monthly depreciation journal entries** — the user posts them manually (or via accountant tools).
- There is **no native bonus/Section 179 automation** and no recurring auto-post on the 1st.

**FH-1 closes that gap:** an asset register with full per-asset depreciation schedules **and a gated cron that auto-posts** the monthly entry (Dr Depreciation Expense / Cr Accumulated Depreciation) on the 1st. Everything is preview-able, audited, gated default OFF, and double-entry-balanced.

---

## 1. Asset register

### 1.1 Entry modes
- **Add one** asset (form).
- **Add multiple** (bulk grid — same columns, many rows).
- **Import existing** assets (CSV) — for assets already in service (see **§4 back-dating**).

### 1.2 Per-asset fields
| Field | Notes |
|---|---|
| Name | e.g. "2022 Freightliner Cascadia #1487" |
| VIN / serial | links to `mdata.units` where the asset is a truck/trailer (reuse, don't duplicate) |
| Asset **class** | **vehicles only (locked): trucks · trailers · cars** — editable catalog; land kept as a non-depreciating guard if ever added |
| Purchase price | original cost basis (integer cents) |
| Purchase date | acquisition date |
| **Depreciation method** | straight-line / accelerated (150DB or DDB) / bonus-or-§179 (§3) |
| **Useful life** | **default 5 years, editable per asset, overridable to 1 year** (§179/bonus); stored as months |
| **Salvage value** | residual at end of life (cents) |
| **Depreciation start date** | placed-in-service date (drives the half-month convention, §4) |
| **GL accounts** (3) | **Asset** account · **Accumulated-Depreciation** (contra-asset) · **Depreciation-Expense** — resolved from the class default, overridable per asset |
| Prior accumulated depreciation | for back-dated assets (§4); 0 for new |
| `is_active`, soft-delete, audit columns | per standing rule |

### 1.3 Land exception
**Land does NOT depreciate** (locked, per research). Class `land` → no schedule, no posting; register still tracks cost/basis for the balance sheet.

### 1.4 Inter-company leasing — owner entity vs operating entity (locked decision #5)

The asset module is **multi-entity** and must model that **TRK (IH 35 Trucking LLC) OWNS the assets and LEASES them to TRANSP (and later USMCA).** This splits where things book:

- Each asset carries an **`owner_operating_company_id`** (the **lessor — TRK**, which holds title). The asset register + **depreciation book at the OWNER (TRK)** — TRK depreciates what it owns.
- The **operating/lessee entity (TRANSP)** does **not** depreciate the asset; it books a **lease expense** (the monthly inter-company bill — see **FH-8 Lease Contract**, which generates that bill TRANSP→TRK and allocates per unit via FH-7).
- The **lessor (TRK)** books **lease income**. **Entity independence (LOCKED):** TRK and TRANSP are **completely independent — separate databases** interacting **only as vendor/customer** (TRK invoices TRANSP; TRANSP books a bill). There is **NO consolidation and NO elimination** (Jorge files taxes per company, never consolidated) — the former CONSOLIDATION block is **dropped**.
- **Build sequencing (locked):** build the asset/leasing capability **now** (multi-entity, present in code), but it is **activated for TRK/USMCA once the software is built out** — TRK is largely static (little day-to-day movement) so there is no live data to test against yet; verify against TRK's QBO when activated. Operational finance (void, escrow, settlements, expenses) is built+tested on **TRANSP first** (where the live data is). Both TRK and TRANSP are QBO-connected; QBO stays in **parallel use** until the software surpasses it — nothing is exposed.

---

## 2. Asset lifecycle

```
acquisition  →  depreciation (monthly, gated auto-post)  →  disposal / sale
```
- **Acquisition:** asset created (directly, or by FH-2 Loan Wizard / a bill / an expense). Opening entry **Dr Asset / Cr (cash|note payable|AP)** — when created via FH-2 the wizard owns this JE (see FH-2).
- **Depreciation:** the monthly schedule runs over useful life (§3, §5).
- **Disposal / sale:** remove the asset, reverse remaining book value, and post **gain/loss on disposal**:
  - Dr Cash (proceeds) · Dr Accumulated Depreciation (all to date) · Cr Asset (original cost) · Dr/Cr **Gain or Loss on Disposal** (the plug).
  - Stops the schedule; partial-month handling per the convention.

---

## 3. Depreciation methods (match QBO + auto-post)

**Locked set (Jorge):** straight-line + accelerated (declining-balance) + §179/bonus — the four formulas below cover these (150DB and DDB are the two accelerated variants). All documented with exact math; **book-basis** in v1 (tax-basis is an open question — §8). Monthly granularity (annual ÷ 12, convention-adjusted). Default useful life **5 years** unless overridden (1 year for §179/bonus).

**Depreciable base** = `purchase_price − salvage_value` (except declining-balance, which ignores salvage until it would dip below it).

### 3.1 Straight-line (SL)
`annual = (cost − salvage) / useful_life_years` → `monthly = annual / 12`. Equal each period until book value = salvage.

### 3.2 150% declining balance (150DB)
`rate = 1.5 / useful_life_years`. `period_depr = book_value_begin × rate / 12`. Ignores salvage in the formula; **stop** when book value would drop below salvage (clamp the final entries). Common to **switch to SL** when SL on remaining life yields a larger deduction — document the switch-to-SL toggle (QBO/IRS MACRS convention).

### 3.3 Double-declining balance (DDB / 200DB)
Same as 150DB with `rate = 2.0 / useful_life_years`. Same salvage clamp + optional switch-to-SL.

### 3.4 Bonus / Section 179 (full first-year)
First-year **full expense** (up to the asset's depreciable basis): the whole basis posts in the placed-in-service period (or per the elected amount); remaining periods = 0. Document the §179 dollar cap / income limitation as **inputs Jorge supplies** (we don't hardcode IRS limits — they change yearly; configurable + a "consult accountant" note).

> Each method's formula is stored with the schedule so a regenerated schedule is reproducible and auditable.

---

## 4. Back-dating + half-month convention (Jorge requirement)

Assets already in service must continue correctly — mirror QBO's **prior depreciation** handling.

- **Prior accumulated depreciation** input: enter the accumulated amount already taken before the system's start. The schedule resumes from `book_value = cost − prior_accumulated`, with remaining life = `useful_life − months_already_elapsed`.
- **No back-posting of history** by default: prior depreciation is an **opening balance** (ties to FH/OPENING-BALANCE work), NOT re-posted month by month — avoids double-counting what's already in QBO/the books. (Optional: a one-time catch-up JE if a gap exists — gated, preview-first.)
- **Half-month convention** (locked): placed in service in the **first half** of a month → depreciate from the **1st of that month**; **second half** → from the **1st of the next month**. (Document mid-month / mid-quarter / half-year convention options as a per-asset setting; default half-month.)

---

## 5. Auto-post engine (the QBO gap — gated cron, default OFF)

- A **scheduled job runs on the 1st** of each month. For every active, non-land asset with a current schedule period due:
  - Post **Dr Depreciation Expense / Cr Accumulated Depreciation** for that period's amount.
  - Write the schedule row's `posted_journal_entry_id` + audit-spine row.
  - **Idempotent:** a period already posted is never double-posted (unique on asset+period).
- **Double-entry must balance or fail hard** (locked) — the pair posts atomically or not at all.
- **Gated:** the whole engine sits behind `FIXED_ASSET_AUTOPOST_ENABLED` default OFF. With the flag OFF the schedule is computed/visible but **nothing posts** — Jorge can post manually from the preview. Jorge flips the flag when ready (Jorge + GUARD; never auto-flipped).
- **Preview-first:** before any period posts (manual or first cron run), the exact JE is shown.
- Reuse the existing cron/outbox + `createJournalEntry` + period-close guards (a closed period blocks posting into it).

---

## 6. Data model (additions — each `is_active` + soft-delete + audit cols; finalize in session)

- **`fixed_assets.assets`** — the register (all §1.2 fields + status acquisition/active/disposed). FK VIN→`mdata.units` where applicable; GL account FKs → `catalogs.accounts`. **`owner_operating_company_id`** = the lessor/title-holder (TRK) — depreciation books here (§1.4); distinct from the operating/lessee entity (TRANSP) that books the lease expense via FH-8.
- **`fixed_assets.asset_classes`** — editable class catalog (default method, default useful life, default GL accounts per class).
- **`fixed_assets.depreciation_schedules`** — one row per asset per period: period #, period date, depreciation amount, accumulated-to-date, book-value-end, method snapshot, `posted_journal_entry_id`, `posted_at`. Regeneratable; old rows retained on change (audited).
- **`fixed_assets.disposals`** — disposal date, proceeds, gain/loss, JE link.
- Flag `FIXED_ASSET_AUTOPOST_ENABLED` in `lib.feature_flags` default OFF.

All tenant-scoped (`operating_company_id`), RLS-enforced; new schema → grants per CLAUDE.md §15.

---

## 7. Screen (GUARD mocks before build)

- **Asset register table:** name · class · cost · in-service date · method · **remaining (book) value** · **% depreciated** · status · actions (View · Dispose).
- **Per-asset schedule view:** the full period table (date, depreciation, accumulated, book value, posted? + JE link).
- **Posted-transactions view:** every depreciation/disposal JE this asset generated (with VOID stamps where applicable — VOID ≠ DELETE).
- Add-one / add-multiple / import controls. "Flag OFF — not yet auto-posting" badge while gated.

---

## 8. Open questions for Jorge

**Answered + locked (2026-06-14):** methods = SL + accelerated + §179/bonus · classes = vehicles only (trucks/trailers/cars) · useful life = default 5y, override 1y, editable per asset. Still open:

- **(b)** **Book-basis only**, or **book AND tax-basis** depreciation (two parallel schedules)? (Big scope fork; most small carriers = book only, accountant handles tax basis.)
- **(d)** Convention — confirm **half-month** default (vs mid-month / half-year).
- **(e)** Which **entity first** — TRANSP (QBO-connected) then TRK?
- **(f)** For disposals, a single **Gain/Loss on Disposal** account or split gain vs loss accounts?

---

## 9. Gated build sequence (migrations need accept-edits + show-the-migration-first)

1. Asset register tables + class catalog + CRUD (add-one / bulk / import).
2. Depreciation **schedule engine** (the 4 methods + back-dating + convention) — compute + store, **no posting**.
3. Register + schedule **screens** (GUARD-mocked, Jorge-approved).
4. **Auto-post cron** behind `FIXED_ASSET_AUTOPOST_ENABLED` (default OFF) + preview + idempotency + period-close guard.
5. **Disposal/sale** flow + gain/loss posting.
6. Reports (depreciation expense by period/class; book value roll-forward).

All money-path; GUARD verifies vs QuickBooks; design session with Jorge before code.
