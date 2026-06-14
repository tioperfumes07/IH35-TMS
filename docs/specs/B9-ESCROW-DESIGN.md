# B9 — Driver Escrow Deduction — Design Spec (gated build)

**Status:** Design / Docs only (no code, no DDL, no posting). Build is **APPROVED + GATED** — GUARD verifies the diff vs QuickBooks before merge; design session with Jorge before code.
**Audience:** Jorge + GUARD + accountant.
**Date:** 2026-06-14
**Grounds:** `docs/specs/DRIVER-ESCROW-RESEARCH.md` (industry/accounting/legal) + the A3 capped-recovery preflight (the mirror-image mechanism). All amounts integer cents.

---

## 0. Executive summary

B9 deducts **driver escrow on the DRIVER SETTLEMENT (TMS side)** — **not** QBO payroll (QBO payroll = W-2 office staff only). It is the **mirror image of A3 advance-recovery**: A3 draws down the **QBO-149 advance ASSET**; B9 builds up the **Damage Claim Escrow LIABILITY** (the per-driver "Damage Claim Escrow- <Name>" sub-accounts already auto-provisioned on hire, #934). Escrow is the **driver's money held by the carrier** — opposite sign to an advance.

**Drivers are W-2 → interest is WAIVED** (49 CFR 376.12(k) does not apply). The escrow research doc's interest section is therefore out of scope; everything else (liability sub-ledger, control = Σ sub-ledger, separation refund) stands.

Build is **gated behind a flag default OFF** (like A3's `SETTLEMENT_CAPPED_RECOVERY_ENABLED`); Jorge flips it when ready. GUARD reviews every money-path diff.

---

## 1. What already exists (build on this — do NOT duplicate)

| Asset | Where | Use in B9 |
|---|---|---|
| Per-driver escrow sub-accounts "Damage Claim Escrow- <Name>" | `catalogs.accounts` (auto-provisioned on hire, #934) | the GL liability sub-account each deduction credits |
| `driver_finance.escrow_balances` | mig `202606120600_d1_settlement_approval` — `total_held_cents`, `total_released_cents`, `current_balance_cents`, `release_scheduled_at`, **`release_claims_window_days` (default 60)**, `status` (active/releasing/released), UNIQUE(company,driver) | the per-driver running balance + **refund clock** (rule #5 maps directly to `release_claims_window_days`) |
| `driver_finance.escrow_ledger` | same migration — `transaction_type` (hold/release/forfeit), `amount_cents`, `running_balance_cents`, settlement linkage | the per-move ledger: **hold** = deduction, **forfeit** = draw, **release** = refund |
| `driver_finance.escrow_deductions_pending` | mig `0094` — proposed escrow deductions (load_abandonment/damage_claim/manual), approve/reject + owner-notify | the existing **abandonment/damage** proposal flow → becomes one of B9's draw triggers |
| `accounting.escrow_accounts` + `escrow_postings` | mig `0234` (Block 23) | the GL posting flow for escrow |
| A3 floor: `resolveSettlementMinNet(...)` + capped-recovery skip/carry | `driver-settlement.service.ts` | **reuse verbatim** for rule #4 (never push net pay below floor → skip + carry) |
| A3 paired-JE at post (`createJournalEntry`) | `driver-settlement.service.ts` (#931) | mirror for the escrow JE (opposite direction) |
| Flag pattern `lib.feature_flags` | A3 `SETTLEMENT_CAPPED_RECOVERY_ENABLED` | new `ESCROW_DEDUCTION_ENABLED` default OFF |

**Implication:** B9 is mostly *wiring + a config layer* over existing tables, plus the per-load deduction engine. The balance, ledger, refund-clock, GL-posting, and floor primitives already exist.

---

## 2. The 9 LOCKED rules (Jorge, 2026-06-14)

1. **Amount:** **$25/load** default (2500¢), **editable per deduction** at the moment of settlement.
2. **Cap:** **$2,500** (250000¢) — stop deducting once `escrow_balances.current_balance_cents ≥ 2500_00`. Resume if a draw drops it back below.
3. **Draw triggers (editable catalog — add/remove in software):** fines; damages; insurance deductibles; repair expenses due to **driver error**; fuel for **unauthorized vehicle use**; **load abandonment** costs; anti-doping / drug-test costs.
4. **Never negative:** a settlement escrow deduction can't push net pay below the floor (**same floor logic as A3**) — if it would, **SKIP and carry to next settlement**.
5. **Refund on separation:** `termination_date` starts a refund clock; clock length is **per-driver assignable: 45 / 60 / 90 days (default 60)** = `escrow_balances.release_claims_window_days`. Remaining escrow refunds **if no open fines/damages**.
6. **Audit everything** (deduction, draw, refund): GL entry **+** audit-spine row.
7. **GL postings:** deduction → **Dr Driver Settlement / Cr Damage Claim Escrow-<driver>** (liability up). Draw → **Dr escrow / Cr expense-or-receivable**. Refund → **Dr escrow / Cr cash**.
8. **Approver for refunds AND draws:** **manager, accountant, OR owner** (any). → depends on the new **Roles & Permissions block**; until it ships, **hard-code manager/accountant/owner**.
9. **Gated:** ships behind a flag **default OFF** (like A3). Jorge flips when ready.

W-2 confirmed → **interest WAIVED**.

---

## 3. Data model (extend existing + small additions)

### 3.1 Reuse as-is
- `escrow_balances` (balance + refund clock + status). Rule #2 cap reads `current_balance_cents`; rule #5 reads `release_claims_window_days`.
- `escrow_ledger` (hold/release/forfeit + running balance + settlement linkage).

### 3.2 Small additions (each: `is_active` + audit columns per standing rule)
- **`driver_finance.escrow_config`** (per operating company): `per_load_default_cents` (2500), `cap_cents` (250000), `default_refund_window_days` (60), `is_active`. One row per company; editable.
- **`catalogs.escrow_draw_triggers`** (editable trigger catalog, rule #3): `code`, `label`, `gl_treatment` (`expense` | `receivable`), `is_active`, audit cols. Seed the 7 locked triggers. "Add/remove in software" = CRUD on this catalog (reuses the catalog pattern).
- **Per-driver refund window override:** `escrow_balances.release_claims_window_days` already exists — constrain UI to {45,60,90}, default 60; an edit writes an audit row.
- **Draw record:** extend `escrow_ledger` `transaction_type='forfeit'` rows with a `draw_trigger_code` + `approver_user_id` + `target_account_id` (expense/receivable). (Add columns or a sibling `escrow_draws` detail table — decide in session.)

### 3.3 Cap, floor, carry (rule #2 + #4)
- **Cap:** at settlement, `deduct = min(per_load_amount, cap_cents − current_balance_cents)`; if `current_balance ≥ cap`, deduct 0.
- **Floor:** reuse `resolveSettlementMinNet`; if applying the escrow deduction would push net below the floor, **skip** and leave it pending (carry to next settlement) — same shape as A3's `computeCappedAdvanceRecovery` skip/defer.

---

## 4. Settlement-time deduction engine (mirror A3)

At settlement compute/post (gated by `ESCROW_DEDUCTION_ENABLED`):
1. Resolve `per_load_amount` = editable value (default `escrow_config.per_load_default_cents`) per load on the settlement.
2. Cap-check (rule #2) and floor-check (rule #4) → final escrow hold amount.
3. Add an escrow line to the settlement (line_type `escrow_hold`, negative to net), and on POST:
   - `escrow_ledger` **hold** row (+ update `escrow_balances`).
   - **GL JE** (rule #7 deduction): `Dr Driver Settlement / Cr Damage Claim Escrow-<driver>` via `accounting.escrow_postings` + `createJournalEntry` (mirror A3's paired JE, opposite direction).
   - audit-spine row.
4. Skipped (floor) amounts stay pending and re-attempt next settlement.

**Reuses A3's POST-time ordering** (ledger + JE atomic; recovery=0 → no JE) — here hold=0 → no JE.

---

## 5. Draw engine (rule #3, #7, #8)

A **draw** spends a driver's escrow against a disclosed trigger:
- Initiated against a `catalogs.escrow_draw_triggers` entry (fine/damage/deductible/driver-error-repair/unauthorized-fuel/abandonment/drug-test). The existing `escrow_deductions_pending` flow (abandonment/damage proposals) becomes one initiation path.
- **Approver-gated (rule #8):** manager / accountant / owner (hard-coded until the Roles & Permissions block ships).
- On approve: `escrow_ledger` **forfeit** row (− balance, never below 0 — rule "never negative" applies to the driver too; an over-draw is blocked or split, per escrow-research §2.4), GL JE (rule #7 draw): `Dr Damage Claim Escrow-<driver> / Cr expense-or-receivable` (per the trigger's `gl_treatment`), audit row.

---

## 6. Refund engine (rule #5, #7, #8)

- `termination_date` set → `escrow_balances.status='releasing'`, `release_scheduled_at = termination_date + release_claims_window_days` (per-driver 45/60/90, default 60).
- When the window elapses **and no open fines/damages**: an **approver** (manager/accountant/owner) confirms the refund → `escrow_ledger` **release** row (balance → 0), GL JE (rule #7 refund): `Dr Damage Claim Escrow-<driver> / Cr Cash`, audit row, `status='released'`.
- Open fines/damages at refund time are first drawn (rule #5 "if no open fines/damages"); the remainder refunds.

---

## 7. GL postings (double-entry summary)

| Event | Debit | Credit | Ledger | Net-pay effect |
|---|---|---|---|---|
| **Deduction** (per load) | Driver Settlement / Net-pay clearing | Damage Claim Escrow-<driver> (liability ↑) | `escrow_ledger` hold | net pay − $25 |
| **Draw** (trigger) | Damage Claim Escrow-<driver> (liability ↓) | Expense **or** Receivable (per trigger) | `escrow_ledger` forfeit | none |
| **Refund** (separation) | Damage Claim Escrow-<driver> (liability ↓) | Cash | `escrow_ledger` release | none |

**Invariants** (mirror A3 + escrow research): control `Damage Claim Escrow` parent balance == Σ per-driver sub-account balances; per-driver balance ≥ 0 (never negative); every move audited; cap ≤ $2,500.

---

## 8. Gating, approver, audit

- **Flag:** `ESCROW_DEDUCTION_ENABLED` (lib.feature_flags) **default OFF**. Flag OFF = byte-identical to today (no escrow holds). Jorge flips in prod (GUARD-verified) like the capped-recovery flag.
- **Approver (rule #8):** `requireEscrowApprover(role)` = manager | accountant | owner. **Hard-coded** until the Roles & Permissions block ships, then swapped for the permission check. (Dependency called out below.)
- **Audit (rule #6):** every deduction/draw/refund → an `audit.audit_events` row (actor, action, amounts, driver, trigger) **and** the GL JE. No silent money moves.

---

## 9. Dependencies

- **Roles & Permissions block** (rule #8 approver check). Until it ships: hard-code manager/accountant/owner; leave a `// TODO: swap for permission check when RBAC block lands` seam.
- **A3** (floor + paired-JE pattern) — already merged.
- **Per-driver escrow sub-accounts (#934)** — already merged.

---

## 10. Open questions for Jorge

1. **Editable-at-the-moment amount (rule #1):** who can edit the per-load $25 at settlement — same approver set (manager/accountant/owner), or the settlement creator? Audited either way.
2. **Draw `gl_treatment` per trigger:** confirm which triggers post to **expense** (company absorbs / driver-error repair) vs **receivable** (driver owes beyond escrow). Default mapping proposed; confirm per trigger.
3. **Over-draw policy:** if a draw exceeds the driver's escrow balance, **block** the excess, or **split** the remainder to an advance/receivable (escrow never negative)? (rec: split to receivable.)
4. **Cap interplay with draws:** after a draw drops the balance below $2,500, resume per-load deductions automatically up to the cap? (rec: yes.)
5. **"Open fines/damages" at refund (rule #5):** what exactly blocks/reduces a refund — only `escrow_draw_triggers` items still open, or any open driver fine in `safety.internal_fines`? Confirm the open-items query.
6. **Refund window edit audit:** confirm changing a driver's 45/60/90 window is restricted to the approver set + audited.
7. **Pending carry visibility:** should skipped (floor) escrow holds show on the next settlement's deduction-confirm list (ties into B10)?

---

## 11. Proposed build sequence (gated; each its own PR; GUARD-reviewed; flag OFF)

1. **Config + trigger catalog** — `escrow_config`, `catalogs.escrow_draw_triggers` (seed 7), per-driver window {45,60,90}. *(migration → accept-edits, non-money DDL)*
2. **Deduction engine** — per-load $25 (editable) at settlement, cap + floor-skip-carry, `hold` ledger + GL JE, behind `ESCROW_DEDUCTION_ENABLED` OFF. *(money-path → GUARD diff review)*
3. **Draw engine** — approver-gated forfeit against a trigger, GL JE (expense/receivable). *(money-path)*
4. **Refund engine** — separation clock, open-items check, approver-confirm release, GL JE. *(money-path)*
5. **B10 hook** — escrow holds appear in the settlement confirm/skip list (separate B10 block).

Steps 2–4 are money-path → designed live with Jorge, GUARD verifies the diff, ship gated, never self-merge, never auto-flip the prod flag.

---

## 12. Sources
- `docs/specs/DRIVER-ESCROW-RESEARCH.md` (industry/accounting/49 CFR 376.12(k) — interest section N/A for W-2) + the A3 capped-recovery preflight (mirror mechanism).
- In-repo: migrations `202606120600` (escrow_balances/ledger), `0094` (escrow_deductions_pending), `0234` (escrow_accounts/postings); `driver-settlement.service.ts` (A3 floor + paired JE); `catalogs.accounts` per-driver escrow sub-accounts (#934).

---

*Design only. No schema/code/posting is created by this document; it grounds the gated B9 build under Jorge's standing rules (money path designed with Jorge + GUARD, env-flag default OFF, is_active+audit on every table, never self-merge, never auto-flip a prod flag).*
