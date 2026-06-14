# FH-6 — Tax Manager (property + all taxes) — Design Spec (gated build)

**Status:** Design / Docs only (no code, no DDL, no posting). FINANCE block — designed live with Jorge, built **gated behind a flag default OFF**, **GUARD verifies the diff vs QuickBooks before merge**, never auto-fired, never self-merged.
**Audience:** Jorge + GUARD + accountant.
**Date:** 2026-06-14
**Part of:** the **Finance Hub** (FH-1…FH-7), Taxes tab. **FH-6a** (rendition) pulls from **FH-1**; per-unit splits use **FH-7** (shared unit-allocation).
**Grounds:** Jorge's real tax list (below) + locked accounting principles (double-entry balances or fails; VOID ≠ DELETE; `is_active` + soft-delete + audit; money-adjacent ships flag-OFF). All amounts integer cents; rates exact decimals.

---

## 0. Executive summary

A **per-year tax register**: every tax Jorge pays, tracked with **amount, due date, paying account, configurable penalty-interest**, **auto-generated each year** (recurring), and **gated posting** as expense/liability when accrued. **Penalty interest auto-accrues** if a tax isn't paid by its due date. **FH-6a** adds the **property-tax rendition** — the per-asset declared-value list Jorge submits to the taxing authorities, pulled from the FH-1 register.

---

## 1. Jorge's tax list (the seed catalog — editable)

| Tax | Notes |
|---|---|
| **Personal property tax** | **split across the actual taxing entities** (see §1.1) — one obligation, multiple jurisdiction line items |
| **Texas Franchise tax** | annual; TX Comptroller |
| **Texas IRP** (apportioned registration) | per-unit apportioned plates → natural **FH-7 per-unit allocation** |
| **IFTA** | already modeled in the mileage/fuel work — **surface here** (link, don't duplicate the engine) |

### 1.1 Personal property tax — taxing entities (Laredo/Webb)
Split across: **Webb County · City of Laredo · Laredo Community College · United Independent School District (UISD)**.
- ⚠️ **Open item (a):** verify whether **Laredo ISD (LISD)** *also* applies in addition to UISD — Jorge is unsure if both. Model the entity list as an **editable catalog** so adding/removing LISD is a data change, not a code change.

---

## 2. Data model (additions — each `is_active` + soft-delete + audit cols; finalize in session)

- **`tax.tax_types`** — editable catalog: code, label, category (property/franchise/irp/ifta/other), **default due-date rule**, **penalty rule** (rate + grace period), default expense + liability GL accounts, recurrence (annual). Seed §1.
- **`tax.taxing_entities`** — for property tax, the jurisdiction list (Webb County, City of Laredo, LCC, UISD, [LISD?]) — editable.
- **`tax.tax_records`** — one per (tax_type, year[, entity]): amount, due date, paying account, status (accrued/paid/overdue/void), accrued_journal_entry_id, paid_at. The yearly auto-generation creates these.
- **`tax.penalty_accruals`** — penalty interest accrued on an overdue record (rate snapshot, days overdue, amount, JE link).
- Flag `TAX_MANAGER_AUTOPOST_ENABLED` in `lib.feature_flags`, default OFF. Tenant-scoped, RLS; new schema → grants per CLAUDE.md §15.

---

## 3. Per-year auto-generation (recurring)

- A **yearly job** generates the next year's `tax_records` from `tax_types` (amount carried/estimated from prior year, editable; due dates from the type's rule). For property tax, one record **per taxing entity**.
- Generation **creates records only** (not postings) — Jorge reviews/edits amounts before anything accrues.
- Idempotent per (tax_type, year, entity).

---

## 4. Penalty interest (auto-accrue when overdue)

- Each `tax_type` has a **configurable penalty rate + grace period**.
- If a record is **unpaid past its due date** (+ grace), a job **accrues the penalty** (rate × amount × periods overdue, per the type's convention) into `penalty_accruals`.
- **Open item (e):** the exact penalty formula per tax (flat %, monthly %, statutory Texas property-tax penalty+interest schedule) — Jorge/accountant supply each rule. Document the Texas property-tax statutory schedule as the likely default for the property entities (configurable).

---

## 5. Posting (gated)

When a tax **accrues** (or is paid), behind `TAX_MANAGER_AUTOPOST_ENABLED` (default OFF):
- **Accrue:** **Dr Tax Expense / Cr Tax Payable** (liability) — dated the accrual date; **balance-or-fail**.
- **Penalty accrue:** **Dr Penalty/Interest Expense / Cr Tax Payable**.
- **Pay:** **Dr Tax Payable / Cr Cash** (the paying account).
- Per-unit splits (IRP, property tax) route each split to the unit via **FH-7** for per-unit cost-of-ownership.
- Preview-first; idempotent; closed-period guard; audit-spine row per posting. VOID ≠ DELETE (a posted accrual is voided, not deleted).

---

## 6. FH-6a — Property-tax RENDITION section

The **rendition** = the per-asset declared-value list Jorge submits to the city/county for their tax estimate.
- **Pulls from the FH-1 Fixed Assets register** (asset → declared value).
- **Declared value is editable per asset per year** — the rendition value may differ from book value (e.g. market/depreciated-cost per the appraisal district's basis); the edit is **audited**.
- A **per-year rendition** record set: asset, book value (from FH-1), declared value (editable), year.
- **Output:** the per-asset declared-value list (printable/exportable) Jorge submits to **Webb County / City of Laredo / LCC / UISD**.
- Feeds §3: once the authorities assess, the resulting property-tax amounts populate the `tax_records`.

---

## 7. What already exists (build on this — do NOT duplicate)

| Asset | Use in FH-6 |
|---|---|
| IFTA engine (mileage/fuel work) | **surface** IFTA here; don't rebuild |
| FH-1 Fixed Assets register | FH-6a rendition declared-values source |
| FH-7 unit-allocation (`accounting.bill_unit_allocation` + `accounting/allocation.ts`) | per-unit IRP / property-tax splits |
| `createJournalEntry` + double-entry guard | accrual / penalty / payment JEs |
| Cron/outbox + period-close guard | yearly auto-generation + penalty accrual jobs |
| `catalogs.accounts` | tax expense / payable / penalty GL accounts |

---

## 8. Open questions for Jorge

- **(a)** Does **LISD** apply in addition to **UISD** for personal property tax? (the one verification.)
- **(b)** **Every tax type** you pay beyond the four listed (any local/permit/weight-distance/UCR/HVUT-2290)?
- **(c)** Each tax's **penalty rule** — rate + grace period (esp. the Texas property-tax statutory penalty+interest schedule).
- **(d)** IRP & property tax — split **per unit** (via FH-7), or tracked as one lump? (drives FH-7 coupling.)
- **(e)** Rendition declared-value basis — book value, market, or the appraisal district's prescribed method?
- **(f)** Which **entity first** — TRANSP then TRK?

---

## 9. Gated build sequence (migrations need accept-edits + show-the-migration-first)

1. `tax.tax_types` + `taxing_entities` + `tax_records` + `penalty_accruals` + seed Jorge's list.
2. Taxes **tab UI** (register by year, per-entity property-tax breakdown) — GUARD-mocked.
3. **Yearly auto-generation** (records only, no posting).
4. **FH-6a rendition** (pull FH-1 declared values, editable per year, export).
5. **Penalty accrual** job (per-type rule).
6. **Gated posting** behind `TAX_MANAGER_AUTOPOST_ENABLED` (default OFF) + preview + per-unit FH-7 splits + closed-period guard.
7. **IFTA surfacing** (link the existing engine into the tab).

All money-path; GUARD verifies vs QuickBooks; design session with Jorge before code.
