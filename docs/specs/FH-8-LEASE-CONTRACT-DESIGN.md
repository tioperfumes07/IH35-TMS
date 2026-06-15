# FH-8 — Lease Contract + Unit Picker (Legal ↔ Finance) — Design Spec (gated build)

**Status:** Design / Docs only (no code, no DDL, no posting). FINANCE/cross-cutting block — designed live with Jorge, built **gated behind a flag default OFF**, **GUARD verifies the diff vs QuickBooks before merge**, never auto-fired, never self-merged.
**Audience:** Jorge + GUARD + accountant.
**Date:** 2026-06-14
**Part of:** the Finance build package (construction block #10). **Reuses FH-7** (the shared unit-allocation control) in a **third caller** — Legal lease contracts (alongside insurance and property tax). Generates recurring monthly bills like **FH-6**'s yearly auto-generation, but monthly.
**Grounds:** Jorge's inter-company lease workflow + the locked entity structure (TRK owns/leases → TRANSP operates) + locked principles (double-entry balances or fails; VOID ≠ DELETE; `is_active` + soft-delete + audit; money-adjacent gated). All amounts integer cents.

---

## 0. Executive summary

The **lease agreement is created in the Legal module**. While filling out the contract, a **unit picker (the FH-7 shared control)** selects all units being leased so they're named **in the contract**; each unit carries a lease amount and the contract carries a **total**. On finalize, Finance **generates the recurring monthly bill** and the per-unit allocation **disburses the cost per unit**. This is the **same shared unit-allocation control as insurance and property tax** — build the picker once (FH-7), reuse here; do not reinvent.

---

## 1. Context — inter-company lease (locked entity structure)

- **TRK (IH 35 Trucking LLC)** OWNS the units (trucks/trailers/cars) and **LEASES** them to **TRANSP** (and later **USMCA**). TRK holds the assets + personal property tax but has little day-to-day movement.
- **TRANSP** is where operations live (drivers, expenses, settlements, loads) — QBO-connected.
- So the lease contract = **TRK (lessor) → TRANSP (lessee)**. The picker selects **TRK's units**; the contract specifies them + per-unit amount + total; Finance generates the **monthly bill (TRANSP pays TRK)** and allocates cost per unit.
- **Books split (ties to FH-1 §inter-company leasing):** **depreciation books at the OWNER (TRK)**; the **lease expense books at the LESSEE (TRANSP)**; the **lease income books at the lessor (TRK)**.
- **Entity independence (LOCKED, architectural):** TRK, TRANSP, USMCA are **completely independent — SEPARATE DATABASES**. They interact **only as vendor/customer**: **TRK invoices TRANSP** (TRK's AR), **TRANSP books it as a bill** (TRANSP's AP) — two separate documents in two separate databases, **not** one cross-entity record. There is **NO consolidation and NO elimination** (Jorge files taxes per company, never consolidated). The lease is just an invoice↔bill pair.

---

## 2. Flow

1. **Legal module:** create lease contract. Fill contract data — parties (**lessor TRK / lessee TRANSP**), term, dates, document reference.
2. **Unit picker (FH-7 shared control):** select all units being leased. **Amount model (LOCKED):** the contract carries a **TOTAL + a per-type rate** (e.g. a rate per truck / per trailer); **trucks absorb the remainder** so the per-unit splits always sum to the total to the cent (FH-7 penny-exact). Contract shows the **unit list + running TOTAL**.
3. **On finalize/activate:** generate the recurring **monthly BILL** (lessee → lessor). **Bill posting (LOCKED): draft + confirm** — the monthly bill generates as a **draft for review**, then is confirmed to post (not silently auto-posted). Gated.
4. Each monthly bill carries the **per-unit allocation (FH-7)** so cost disburses per unit (per-unit cost-of-ownership / profitability).
5. **Term (LOCKED): annual, auto-renew** (annual renewal) — not month-to-month.
6. All finance transactions **audited; gated; GUARD verifies vs QBO.**

---

## 3. Data model (additions — each `is_active` + soft-delete + audit cols; finalize in session)

- **`lease_contracts`** — id, **`owner_operating_company_id` (lessor = TRK)**, **`lessee_operating_company_id` (TRANSP/USMCA)**, start_date, end_date, `total_monthly_cents`, status, **`document_ref`** (link to the Legal doc), is_active, audit cols.
- **`lease_contract_units`** — id, lease_contract_id, unit_id, `monthly_amount_cents`. **This IS an FH-7 allocation** — reuse the shared allocation model (`accounting.bill_unit_allocation` / the generalized control), don't fork a parallel table.
- **Generated monthly bills** link back to `lease_contract_id`; each bill's per-unit split = the contract's unit list.
- Flag `LEASE_CONTRACT_BILLING_ENABLED` in `lib.feature_flags`, default OFF. **Separate databases (locked):** the contract + generated **bill live in the lessee DB (TRANSP)** as a normal vendor bill from TRK; the matching **invoice lives in the lessor DB (TRK)** as a normal customer invoice — generated independently in each entity, not a single cross-entity row. RLS; new schema → grants per CLAUDE.md §15.

---

## 4. Reuse / build notes

- The **unit picker = FH-7 shared control** — the same component insurance + property-tax screens use. **Do NOT build a new one.**
- The **contract document lives in Legal**; the **bill generation + allocation lives in Finance**. Link by `lease_contract_id`. (Legal module already exists — `apps/frontend/src/pages/legal`, `apps/backend/src/legal`; extend it with the lease-contract form rather than a new module.)
- **Recurring monthly bill** = same recurring/auto-generate pattern as FH-6's yearly tax generation, but **monthly** (reuse that scheduler).
- Inter-company: the monthly bill (TRANSP's AP from vendor TRK) and the matching invoice (TRK's AR to customer TRANSP) are **independent documents in separate databases** — vendor/customer only, **no consolidation/elimination**.

---

## 5. Screen (GUARD mocks before build — matches FH-7 panel styling)

- **In Legal:** the lease-contract form with the **unit-picker panel** (select units, per-unit amount, running total) — GUARD mocks before build; matches the FH-7 allocation-panel styling.
- The **generated monthly bill** shows the per-unit allocation.

---

## 6. Open questions for Jorge

**Answered + locked (2026-06-14):** amount = **total + per-type rate, trucks absorb the remainder** (§2.2) · term = **annual, auto-renew** (§2.5) · bill = **draft + confirm** (§2.3) · **no consolidation** — invoice↔bill across separate DBs (§1). Still open:

- **(d)** Lessor side: does the software generate **TRK's customer invoice** automatically in TRK's DB too, or only **TRANSP's bill**, with TRK invoiced separately? (both are independent docs either way.)
- **(e)** USMCA leases (later) — same contract shape, just a different lessee?

---

## 7. Gated build sequence (migrations need accept-edits + show-the-migration-first)

1. `lease_contracts` + `lease_contract_units` (reusing the FH-7 allocation model).
2. **Legal lease-contract form** + the FH-7 **unit-picker** panel (GUARD-mocked).
3. **Monthly bill generation** (recurring, gated, preview/draft) linked to the contract, carrying the FH-7 per-unit split.
4. **Inter-company** as **vendor/customer only**: TRANSP's bill (from vendor TRK) + TRK's invoice (to customer TRANSP) generated **independently in each DB** — **no consolidation/elimination**.

All money-path; GUARD verifies vs QuickBooks; design session with Jorge before code.
