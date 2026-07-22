# WIZARD-DEPTH AUDIT — Create Cash Advance (2026-07-22)

**Owner bar:** same depth for every wizard/creator/module/tab — chrome, fields, bank/load linkage, settlement recovery modes — not EntityLink-only.

**Surface:** `apps/frontend/src/pages/cash-advances/components/CreateAdvanceModal.tsx`  
**API:** `POST /api/v1/cash-advances` (`cash-advances.routes.ts` create body)  
**Related (already richer):** cash-advance **requests** + Book Load advance (`load_id`, recovery modes) — Create Advance modal is the **weaker** path.

## Owner findings → verified in code

| # | Owner said | Code truth | Verdict |
|---|------------|------------|---------|
| 1 | Boxes within boxes | Nested `rounded-sm border` panels: Bill Payment Linkage (slate box) + Repayment Schedule (gray box) inside modal chrome | **WRONG chrome** — CHROME-10 class |
| 2 | Disbursement method not correctly designed | Hardcoded labels: `"Direct bank transfer (BOA / IBC checking)"` — bank names in the option string | **WRONG** |
| 3 | No bank accounts to select from | No `listBankAccounts` / ReferenceSelect; payload has no `from_bank_account_id` | **MISSING** |
| 4 | No load linkage | Create payload schema has **no** `load_id`; requests/Book Load path **does** stamp `driver_advances.load_id` | **MISSING** on this wizard (gap vs request/book path) |
| 5 | Repayment periods/cadence only — no single deduct from next settlement | Schema requires `repayment_schedule` with periods + cadence only; Book Load has `cash_advance_recovery_mode: full \| amortize` | **MISSING** recovery mode on Create Advance |

## Target design (McLeod / Alvys / QBO seriousness + IH35 settlements)

1. **Chrome:** flat ParityDrawer (or single panel) — one section stack, no nested bordered “boxes in boxes.”
2. **Disbursement:**
   - Method: Transfer / Wire / Comdata / Check (no bank names in labels)
   - When Transfer: **Bank account** picker from `banking` / company accounts (canonical list)
   - When Wire/Check: recipient + refs; Comdata: card/load ref
3. **Ops links:** `load_id` + `unit_id` (truck) + `trailer_id` when trip/ops-related — same seriousness as Book Load / #1440
4. **Purpose → economics (owner 2026-07-22):**
   - **Personal** → driver-owed → **deduct from settlements** (next settlement full **or** amortize)
   - **Lumper** → **expense** (or bill) on the **load** (+ truck/trailer as on load) — not periods-only personal debt by default
   - Fuel / vendor / border / other → explicit routing per policy (document in UI)
5. **Recovery (when driver-owed):**
   - **Next settlement (full / single deduction)**
   - **Amortize** — periods + per-period amount + cadence
   - Periods-only UI is incomplete

Canonical master plan: `docs/trackers/FULL-SYSTEM-AUDIT-AND-WIRING-MASTER-PLAN-2026-07-22.md` §2.

## API gaps (honest)

| Field | Create Advance POST today | Needed |
|-------|---------------------------|--------|
| `load_id` | absent | add (nullable UUID) → stamp `driver_advances.load_id` |
| `from_bank_account_id` / disbursement account | absent | add for transfer method |
| `recovery_mode` `full` \| `amortize` | absent (schedule always required) | add; when `full`, schedule optional / single period |

Financial cluster: schema/API changes → **build-and-HOLD** if migration; prefer additive columns already on `driver_advances` if present.

## Fix block

**WIZARD-CASH-ADVANCE-CREATE-DEPTH** — redesign CreateAdvanceModal + extend create API to parity with requests/Book Load recovery+load; bank account select; flatten chrome; guard.

Guard: `verify-wizard-cash-advance-create-depth.mjs` (must assert bank picker + load field + recovery_mode full/amortize + no nested double-border anti-pattern / no "BOA / IBC" hardcode).

## Rollout to all wizards

Same checklist template applies next to: Book Load, Settlement close, Create Liability/Fine, Bill/Expense drawers, Claim create, Pay-rate template, Deduction policy — one deep audit file per creator, then CODE.
