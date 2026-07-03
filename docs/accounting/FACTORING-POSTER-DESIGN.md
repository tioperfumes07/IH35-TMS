# Factoring GL Poster — Design (R1–R4, secured-borrowing)

**Status:** DESIGN ONLY — for CPA + bookkeeper review. **No posting code is authorized by this doc.**
**Tier:** §1.4 financial cluster → NEVER self-merge the eventual poster; build-and-hold, CPA sign-off +
Neon verification, `FACTORING_GL_POSTING_ENABLED` stays OFF until flipped per entity (TRANSP only).
**Prepared:** 2026-07-02 (Claude), grounded in `FACTORING-ACCOUNTING-STRUCTURE.md`,
`202607013000_factoring_secured_borrowing_coa_roles.sql` (CODER-34), and the CPA secured-borrowing ruling.

---

## 1 — Context: what exists, what's missing
- **The CPA ruling is SECURED BORROWING (ASC 860), not a sale.** The prior live poster booked FARO's advance
  as a customer_payment that CREDITED A/R and recorded NO liability (derecognition/sale) — **that is the bug**
  this design corrects.
- **Already built (CODER-34, HOLD migration):** the COA accounts + role registry + the per-entity kill-switch
  flag `FACTORING_GL_POSTING_ENABLED` (default OFF). Roles available:
  `factoring_advance_liability`, `ar_assigned_to_factor`, `factoring_recoursed_ar`, `factor_reserve_held`
  (asset), `factor_fee_expense`, `default_interest_expense`; plus existing `ar_clearing`, `cash_dip` (WF 6103),
  and the revenue role.
- **Missing = the poster** (the code that emits the balanced JEs at each factoring event). This design defines
  those rules. **No new GL math** — the poster reuses `posting-engine.service.ts` (balanced-JE poster) + the
  role resolver, exactly like the bill/invoice posters.

## 2 — Ledger-correctness invariants (the "fixes")
Every rule below MUST satisfy all of these (a CI guard asserts them):
1. **The receivable STAYS on the books** until the customer actually pays the factor — it is *reclassified*
   (A/R → `ar_assigned_to_factor`), never credited away at funding. (This is the core sale-vs-borrowing fix.)
2. **The advance is a LIABILITY** (`factoring_advance_liability`), settled when the customer pays the factor —
   never revenue, never a reduction of A/R.
3. **Balanced JE:** `sum(debits) == sum(credits)` in integer cents, per event. No float.
4. **Cash → DIP only** (`cash_dip`, WF 6103) — never legacy BOA (closed Dec 2025).
5. **Idempotent per event:** one JE per (factoring_event_id, rule) — a re-run posts nothing new (reuse the
   existing `source_transaction_type` / dedupe key pattern).
6. **Flag-gated OFF** per entity; the poster is a strict no-op (zero JEs) while `FACTORING_GL_POSTING_ENABLED`
   is off. TRANSP only — never USMCA/TRK.
7. **Fail-closed on unmapped roles:** if a required role isn't bound to an account, raise `CoaRoleResolutionError`
   (do not post a half entry).

## 3 — The four rules (exact Dr/Cr)

### R1 — FUNDING (invoice factored + advance wired)
Trigger: an invoice is assigned to the factor and the advance is received in the DIP account.
Two coupled legs (posted as one balanced batch, or two balanced JEs sharing the event id):

**R1a — reclassify the receivable (stays on the books):**
| DR/CR | Role | Amount |
|---|---|---|
| DR | `ar_assigned_to_factor` | invoice face value |
| CR | `ar_clearing` | invoice face value |

**R1b — record the borrowing + reserve + fee + cash:**
| DR/CR | Role | Amount |
|---|---|---|
| DR | `cash_dip` | advance wired (face − reserve − fee) |
| DR | `factor_reserve_held` (asset) | reserve holdback (10–20%) |
| DR | `factor_fee_expense` | discount fee (2–5%) |
| CR | `factoring_advance_liability` | **face value** (the full borrowing) |

> Net check R1b: `cash + reserve + fee == advance_liability (face)`. R1a balances independently.
> Result: A/R still on the books (assigned), advance recorded as a liability, reserve as a due-from asset,
> fee expensed. No revenue touched, no derecognition.

### R2 — SETTLEMENT (customer pays the factor in full)
Trigger: the factor confirms the customer paid; the borrowing is extinguished and the assigned receivable clears.
| DR/CR | Role | Amount |
|---|---|---|
| DR | `factoring_advance_liability` | face value |
| CR | `ar_assigned_to_factor` | face value |

> Removes the receivable now that it's collected and clears the borrowing. The reserve releases separately (R3).

### R3 — RESERVE RELEASE (factor releases the holdback)
Trigger: the factor wires the held reserve to the DIP account.
| DR/CR | Role | Amount |
|---|---|---|
| DR | `cash_dip` | reserve released |
| CR | `factor_reserve_held` (asset) | reserve released |

### R4 — RECOURSE / CHARGEBACK (customer defaults)
Trigger: the customer fails to pay; the factor claws back the advance (recourse factoring).

**R4a — move the receivable to recoursed + repay the borrowing:**
| DR/CR | Role | Amount |
|---|---|---|
| DR | `factoring_recoursed_ar` | face value |
| CR | `ar_assigned_to_factor` | face value |
| DR | `factoring_advance_liability` | advance amount clawed back |
| CR | `cash_dip` | advance repaid to factor |

**R4b — default interest (if the factor charges it):**
| DR/CR | Role | Amount |
|---|---|---|
| DR | `default_interest_expense` | interest charged |
| CR | `cash_dip` | interest paid |

> The recoursed invoice is now IH35's to collect directly (`factoring_recoursed_ar`); the borrowing is repaid.

## 4 — Reuse map (NO new GL math)
- **Balanced-JE posting:** `apps/backend/src/accounting/posting-engine.service.ts` (same path the bill/invoice
  posters use). The poster builds the leg list per rule and calls the existing balanced-post function.
- **Role → account resolution:** the existing CoA role resolver (raises `CoaRoleResolutionError` when unmapped).
- **Flag:** `isEnabled(client, 'FACTORING_GL_POSTING_ENABLED', { operating_company_id })` — OFF → no-op.
- **Event source:** the factoring lifecycle tables already exist (`accounting.factoring_advances`,
  `0287_factoring_reserve_movement`, `0288_factoring_bank_match`, `0224_block_26_factor_reconciliation`) — the
  poster reads a factoring event and emits the matching rule; it writes ONLY journal entries/postings.
- **Idempotency:** reuse the `source_transaction_type='factoring_<rule>'` + `source_transaction_id=<event_id>`
  dedupe (one JE per event+rule), matching the bill/settlement posters.

## 5 — Verification & CI guard (when built)
- Unit tests per rule: each JE **balances**; uses the **borrowing roles** (assert `ar_clearing` is never
  credited at funding, `factoring_advance_liability` is credited at R1 and debited at R2/R4); flag OFF → zero JEs.
- A `.db.test.ts` proving R1→R2 leaves A/R correctly on-then-off the books and the liability nets to zero.
- Static guard `verify-factoring-poster-secured-borrowing.mjs`: the poster module must (a) resolve the 6
  borrowing roles, (b) never CREDIT `ar_clearing` in the funding rule, (c) gate on `FACTORING_GL_POSTING_ENABLED`
  before any write, (d) contain no new GL math (reuse the posting engine).
- The `$5,000 unwind` check on a Neon branch (per CODER-34) before any flag flip.

## 6 — Open items for CPA / owner
- Confirm reserve % and fee % handling (per-factor config already in `0022_customer_factoring_config` /
  `202606120400_c2_factoring_profile`).
- Confirm default-interest treatment (expense vs. add-to-recoursed-AR).
- FARO → RTS migration: the roles are factor-agnostic; per-factor account bindings switch at migration time.
- Sign-off gates: CPA approves R1–R4 → build poster (build-and-hold) → Neon $5k unwind verify → flip
  `FACTORING_GL_POSTING_ENABLED` for TRANSP only.

---
**Reminder:** this is design. The poster is §1.4 financial — never self-merged, CPA-gated, flag-OFF. See
`ih35-cpa-accounting-decisions` (factoring = secured borrowing) and `ih35-financial-migrations` (build rules).
