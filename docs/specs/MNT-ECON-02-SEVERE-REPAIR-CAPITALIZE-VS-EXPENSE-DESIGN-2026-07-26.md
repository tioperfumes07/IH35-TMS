# MNT-ECON-02 — Severe-repair capitalize-vs-expense (DESIGN · owner-gated)

**Status:** DESIGN ONLY — do **not** implement posting until Jorge answers the decision table below.  
**Lane:** FINANCIAL-HOLD · Maintenance money  
**Sources:** FOR-CURSOR 4 `BLOCKS-MAINTENANCE.txt` · owner money-lock §8 · `ARCHITECTURE-BLUEPRINT-2026-07-05.md` · CPA skill (capitalize vs expense)

---

## Prod truth (GUARD-verified @ 13a2ff3)

`apps/backend/src/maintenance/severe-repair-estimate.routes.ts` exposes refresh / fleet-cost / per-unit / export-pdf / mark-oos / mark-back-in-service **only**.

There is **no**:
- approve → bill / expense action
- capitalize-vs-expense prompt
- GL / A/P hop

Owner money-lock §8: **ALWAYS-ASK** capitalize-vs-expense per event — **NO dollar threshold**.

---

## Standard (Rule 15)

| System | Behavior |
|---|---|
| **US GAAP / ASC 360** | Capitalize costs that extend useful life or increase capacity; expense ordinary repairs |
| **QuickBooks Fixed Assets** | Capex → asset + depreciation schedule; opex → expense account |
| **McLeod / Alvys** | Severe / major repair often routes through a decision before settlement of unit cost |

IH35 must match: **operator chooses per event**; system posts via the **existing poster** (no new GL math); flag **OFF** until Jorge flips per entity.

---

## Proposed shape (implementation AFTER owner OK)

### 1. Approve endpoint (new)

`POST /api/v1/maintenance/severe-repair-estimates/:id/approve`

Body (locked):
```json
{
  "operating_company_id": "uuid",
  "treatment": "capitalize" | "expense",
  "vendor_id": "uuid",
  "amount_cents": 12345,
  "entry_date": "YYYY-MM-DD",
  "memo": "optional"
}
```

Hard rules:
- `treatment` **required** — no default, no threshold auto-pick
- Flag `SEVERE_REPAIR_GL_POSTING_ENABLED` default **OFF** (per-entity override)
- Reuse `createBill` + `postSourceTransaction` / `createJournalEntry` (same pattern as MNT-ECON-01 / WO-close)
- Link: estimate → WO (if any) → unit → vendor → bill/JE → audit

### 2. CoA roles (owner designates; no seed)

| treatment | Dr role | Cr role |
|---|---|---|
| `expense` | `maintenance_severe_repair_expense` (new role) | `ap_control` (or cash_clearing if paid) |
| `capitalize` | `fixed_asset_trucks` / unit asset role (owner-named) | `ap_control` |

**Owner must bind roles per entity before flag ON.** Unbound → fail closed (409), never invent accounts.

### 3. Linkage ledger

`accounting.severe_repair_postings` (or reuse a shared maintenance posting latch table) — provenance only, no balances. FORCE RLS. Void-not-delete.

### 4. Guard

`verify-mnt-econ-02-severe-repair-approve-requires-treatment.mjs` — FAILS if approve path posts without `treatment` ∈ {capitalize,expense}, or posts when flag OFF incorrectly.

### 5. UI

Severe-repair surface: Approve opens modal with **required** capitalize / expense radio (no default). Prefer wire on existing estimate detail — Claude Coder may take UI once backend lands.

---

## OWNER DECISIONS (block until written)

| # | Question | Options | Jorge |
|---|---|---|---|
| D1 | Capitalize target CoA role name? | `fixed_asset_trucks` vs new `severe_repair_capitalized` | |
| D2 | Expense role name? | `maintenance_severe_repair_expense` vs reuse `maintenance_parts_expense` / shop expense | |
| D3 | Always create A/P bill, or cash-only path when already paid? | bill+JE vs cash JE | |
| D4 | Does capitalize also create a fixed-asset register row? | yes (later block) / JE-only for MVP | |
| D5 | May estimate approve without a linked WO? | allow / require WO | |

**No code posts money until D1–D5 are answered in writing.**

---

## Out of scope (this design)

- Depreciation schedule after capitalize (separate FA block)
- Insurance recovery split (INS-01 / warranty MNT-ECON-04)
- Threshold automation (forbidden by §8)

---

## Acceptance (when built)

1. Approve with `treatment=expense` + flag ON → A/P + balanced JE to expense role  
2. Approve with `treatment=capitalize` + flag ON → A/P + balanced JE to asset role  
3. Approve without `treatment` → 400  
4. Flag OFF → no JE / no bill (idempotent no-op or 409 with clear reason)  
5. Guard green; both TRANSP + USMCA after owner role bind  

---

## Migration number (reserve when building)

Suggest `202609090000_mnt_econ_02_severe_repair_gl_hop.sql` (after BANK-DOM-03 `202609080000`). Confirm free at build time.
