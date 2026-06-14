# FH-3 — Amortization Schedule Engine — Design Spec (gated build)

**Status:** Design / Docs only (no code, no DDL, no posting). FINANCE block — designed live with Jorge, built **gated behind a flag default OFF**, **GUARD verifies the diff vs QuickBooks before merge**, never auto-fired, never self-merged.
**Audience:** Jorge + GUARD + accountant.
**Date:** 2026-06-14
**Part of:** the **Finance Hub** (FH-1…FH-7), Amortization tab. **Built before FH-2** (the Loan Wizard consumes this engine). Also used standalone for intangible amortization.
**Grounds:** QBO has **no built-in amortization engine** (the documented gap) + locked accounting principles (double-entry balances or fails; VOID ≠ DELETE; `is_active` + soft-delete + audit columns; money-adjacent ships flag-OFF). All amounts integer cents; rates exact decimals.

---

## 0. Executive summary

FH-3 **generates, stores, and (gated) auto-posts** amortization schedules. Two callers:
1. **FH-2 Loan Wizard** — equipment/asset loans (the main case).
2. **Standalone** — intangible amortization or any term debt entered directly.

Per period it stores payment #, due date, payment amount, **principal portion, interest portion, remaining balance**. On each scheduled payment date a **gated** job posts the split **Dr Note Payable (principal) / Dr Interest Expense / Cr Cash**. Schedules are **re-generatable** on a term change (refinance) — old schedule **retained** (VOID ≠ DELETE), new one supersedes, fully audited. All schedules are viewable in one place in the hub.

---

## 1. The amortization math (documented, exact)

Standard **fixed-payment (French) amortization**:

- Monthly rate `i = annual_rate / 12`.
- Payment `A = P · i / (1 − (1 + i)^(−n))` where `P` = principal financed, `n` = term in months.
- If `i = 0` (0% financing): `A = P / n`.
- Per period:
  - `interest_k = remaining_balance · i`
  - `principal_k = A − interest_k`
  - `remaining_balance -= principal_k`
- **Rounding (locked):** integer cents; the **final payment absorbs the rounding residual** so `remaining_balance` lands exactly at 0 (`principal_last = remaining_balance_before`, `payment_last = principal_last + interest_last`). Document this so the stored schedule always closes to zero.

Supports **balloon** (final lump) and **interest-only** periods as inputs (configurable; default fully-amortizing). Variable-rate handled by re-generation at the reset (§4).

---

## 2. Data model (additions — each `is_active` + soft-delete + audit cols; finalize in session)

- **`finance.loans`** (the liability) — lender, original principal, rate, term months, first-payment date, **liability GL account** (Note Payable / Loan Payable — short vs long term per FH-2), linked asset(s) (FH-1), status (active/paid/refinanced/void), `current_schedule_id`.
- **`finance.amortization_schedules`** — header: loan_id, generated_at, basis (the rate/term/principal snapshot it was built from), supersedes_id (the prior schedule on refinance), is_current.
- **`finance.amortization_periods`** — one row per period: schedule_id, **period #, due date, payment amount, principal portion, interest portion, remaining balance**, `posted_journal_entry_id`, `posted_at`, status (scheduled/posted/skipped/void).
- Flag `LOAN_AMORTIZATION_AUTOPOST_ENABLED` in `lib.feature_flags`, default OFF.

Tenant-scoped (`operating_company_id`), RLS-enforced; new schema → grants per CLAUDE.md §15.

---

## 3. Posting (gated, per scheduled payment)

On each period's **due date** (gated job; reuse the cron/outbox + `createJournalEntry` + period-close guards):
- Post **Dr Note Payable (principal_k) / Dr Interest Expense (interest_k) / Cr Cash (payment amount)**.
- The three legs **must balance or fail hard** (locked); written atomically; stamps `posted_journal_entry_id` + audit-spine row.
- **Idempotent:** unique on (schedule_id, period#) — a posted period never double-posts.
- **Gated:** `LOAN_AMORTIZATION_AUTOPOST_ENABLED` default OFF. Flag OFF → schedule is computed/visible, **nothing posts**; Jorge can post each period manually from the preview. Flag flipped only by Jorge + GUARD.
- **Preview-first:** the exact 3-leg JE is shown before any post.
- A closed accounting period blocks posting into it (existing guard).

---

## 4. Re-generation / refinance (terms change)

When rate / term / balance changes (refinance, rate reset, extra principal paydown):
- Generate a **new schedule** from the new basis; mark it `is_current`, set `supersedes_id` to the old one.
- **Old schedule retained** (not deleted) — historical record, audited; already-posted periods stay posted. Future unposted periods on the old schedule are **voided** (VOID ≠ DELETE), not erased.
- The remaining balance carries from the last posted period into the new schedule's opening principal.
- Every regeneration writes who/when/why to the audit spine.

---

## 5. Screen (Amortization tab — GUARD mocks before build)

- **All schedules in one place:** list of loans → each with current schedule, remaining balance, next payment due, % paid.
- **Per-loan schedule table:** period # · due date · payment · principal · interest · remaining balance · posted? (+ JE link).
- **Refinance/regenerate** action (preview the new schedule before replacing).
- "Flag OFF — not auto-posting" badge while gated. Voided/superseded schedules visible with a VOID/superseded stamp.

---

## 6. What already exists (build on this — do NOT duplicate)

| Asset | Use in FH-3 |
|---|---|
| `createJournalEntry` + double-entry guard (A3/settlement) | the 3-leg payment JE (balance-or-fail) |
| Cron/outbox + period-close guard | the gated due-date posting job |
| `lib.feature_flags` pattern | `LOAN_AMORTIZATION_AUTOPOST_ENABLED` |
| `catalogs.accounts` | the Note Payable / Interest Expense / Cash GL accounts |
| FH-1 asset register | loan ↔ asset linkage |

---

## 7. Open questions for Jorge

- **(a)** Day-count / rounding confirm — monthly fixed-payment with final-payment residual absorption (recommended) — any lender that uses a different convention (e.g. daily simple interest)?
- **(b)** Any **balloon / interest-only** loans in the fleet, or all fully-amortizing?
- **(c)** On refinance, post a **gain/loss on extinguishment**, or just carry the balance? (accountant call.)
- **(d)** Liability account split — short-term (<12mo) vs long-term Note Payable, or one account? (ties to FH-2.)

---

## 8. Gated build sequence (migrations need accept-edits + show-the-migration-first)

1. `finance.loans` + `amortization_schedules` + `amortization_periods` tables.
2. **Schedule generator** (the §1 math + balloon/interest-only + final-residual close) — compute + store, **no posting**.
3. Amortization **tab UI** (GUARD-mocked) — view all schedules.
4. **Gated posting job** behind `LOAN_AMORTIZATION_AUTOPOST_ENABLED` (default OFF) + preview + idempotency + period-close guard.
5. **Refinance/regenerate** (supersede + void-future + audit).
6. Standalone/intangible amortization caller.

All money-path; GUARD verifies vs QuickBooks; design session with Jorge before code.
