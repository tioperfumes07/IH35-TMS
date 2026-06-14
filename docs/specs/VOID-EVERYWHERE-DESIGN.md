# VOID EVERYWHERE — Design Spec (gated build)

**Status:** Design / Docs only (no code, no DDL, no posting). **FINANCE/cross-cutting block — BUILD FIRST.** Every finance build relies on it. Designed live with Jorge, built **gated**, **GUARD verifies the reversing-entry diff vs QuickBooks before merge**, never auto-fired, never self-merged.
**Audience:** Jorge + GUARD + accountant.
**Date:** 2026-06-14
**Part of:** the Finance build package (construction block #1). Prerequisite for B9 escrow, FH-2/FH-3 loan postings, FH-6 tax accruals, and every existing accounting screen (bills, expenses, invoices, JEs, settlements).
**Grounds:** the accounting standard (financial transactions are **voided, never deleted** — mirrors QuickBooks) + the locked cross-cutting rule **VOID ≠ DELETE** + the existing closed-period write-lock (AI-1b #816) + `docs/specs/PERMISSIONS-DESIGN.md` (the Void column). All amounts integer cents.

---

## 0. Executive summary

Financial transactions are **VOIDED, never deleted.** A void **reverses the GL effect via an equal-and-opposite reversing entry**, marks the record `VOIDED`, and **keeps it visible** with a stamp + reason + actor + timestamp. Net GL effect = zero. **Delete** remains a separate, Owner-only action for records that should never have existed. This is a **cross-cutting mechanic** applied to every GL-posting entity, and it must exist **before/alongside** the finance builds because they all rely on it.

---

## 1. Scope — every GL-posting entity

Void applies to every accounting entity that posts to the GL:
- **Bills, Expenses, Invoices, Journal Entries, Settlements** (the existing accounting screens).
- As they ship: **escrow draws/refunds** (B9), **loan entries** (FH-2/FH-3 amortization postings), **tax accruals + penalties** (FH-6), **depreciation postings** (FH-1), **bankruptcy adjustments** (FH-5).

One shared void mechanic + one shared reversing-entry helper — **not** a per-module reimplementation.

---

## 2. Behavior

### 2.1 Void
- Sets the record `status = VOIDED`.
- Posts a **reversing GL entry** — equal & opposite to the original, dated per accounting rules (§4 closed-period handling), referencing the original.
- Keeps the original record **visible** with a **VOID stamp + reason + actor + timestamp**. Never hard-deletes.
- **Net GL effect after void = zero** (original + reversal cancel). GUARD verifies this invariant on the diff.
- **Idempotent:** a record already `VOIDED` cannot be voided again; the reversing entry is posted exactly once.

### 2.2 Delete (separate, restricted)
- A genuinely different action: **destroys** a record that never should have existed (a true data-entry error with no legitimate GL history). **Owner only**, and **still audited**.
- Not offered in the same place/way as Void (§5) to prevent confusion.

### 2.3 Audit
- Every void writes to the **audit spine** (`audit.audit_events`): who, what entity/id, when, **reason** (required), the original JE id + the reversing JE id.
- Every delete likewise audited (actor, record snapshot, reason).

---

## 3. Permissions (LOCKED)

Per the construction-block lock + `PERMISSIONS-DESIGN.md`:
- **VOID:** **Owner + Accountant only.**
- **DELETE:** **Owner only.**
- **Bookkeeper:** create/edit only — **no void, no delete.**
- Until the **Roles & Permissions** block ships, **hard-code** these checks with a **clean swap-in seam** (a single `canVoid(user)` / `canDelete(user)` resolver that the Permissions block later backs with the real grid). Default-deny.

---

## 4. Closed-period handling

- A void of an item in an **open** period posts the reversing entry **in that period** (or the void date) per normal rules.
- A void of an **already-paid / closed-period** item: **block, or require Owner override**, per the existing **closed-period write-lock (AI-1b #816)**. The reversing entry must respect the period lock — never silently write into a closed period.
- **Open item (a):** confirm with Jorge/accountant — when voiding a closed-period transaction, post the reversal into the **current open period** (the usual QBO behavior) vs requiring an Owner override to reopen. Recommend: reversal into the current open period with an explicit note linking back to the original period.

---

## 5. UI

- A **"Void"** action on each accounting record — **visually distinct from Delete** (not the same menu position), opening a **confirmation modal with a REQUIRED reason field**.
- Voided records show a clear **VOID badge** + reason (on hover/detail) and remain in lists (filterable).
- **Delete** is a separate, less-prominent, Owner-only action with its own confirm.
- **GUARD mocks the void confirmation modal** (reason required) before build; Jorge approves the visual.

---

## 6. Data model (additions — minimal, audited)

- A **`status`** column (e.g. `active | voided`) + **void metadata** (`voided_at`, `voided_by`, `void_reason`, `reversing_journal_entry_id`) on each GL-posting entity that lacks it. (Several may already carry a status — extend, don't duplicate; confirm per table in session.)
- A shared **reversing-entry helper** over `createJournalEntry` (balance-or-fail; the reversal is itself a balanced JE).
- No new schema where a status already exists; where added, `is_active` + audit cols per standing rule. Migrations need **accept-edits + show-the-migration-first**.
- Flag `VOID_ENFORCEMENT_ENABLED` (default OFF) **if** enabling void changes posting behavior on existing screens — GUARD verifies the reversing-entry diff before the flag flips.

---

## 7. What already exists (build on this — do NOT duplicate)

| Asset | Use |
|---|---|
| `createJournalEntry` + double-entry guard | the reversing JE (balance-or-fail) |
| Closed-period write-lock (AI-1b #816) | block/override on closed-period voids |
| `audit.audit_events` spine | void/delete audit rows |
| `PERMISSIONS-DESIGN.md` Void column | the eventual real permission backing the `canVoid` seam |

---

## 8. Open questions for Jorge

- **(a)** Closed-period void → reversal into **current open period** (recommended), or require Owner reopen?
- **(b)** Which existing entities already carry a usable `status` column vs need one added? (per-table audit in session.)
- **(c)** Should some entities be **void-only** (never deletable even by Owner — e.g. anything that ever posted)? Recommend: once a record has posted to the GL, **Delete is disallowed; only Void** — Delete reserved for never-posted error rows.

---

## 9. Gated build sequence (BUILD FIRST; migrations need accept-edits + show-the-migration-first)

1. Shared **`canVoid` / `canDelete`** resolver (hard-coded Owner+Accountant / Owner; clean Permissions seam).
2. Shared **reversing-entry helper** (over `createJournalEntry`, balance-or-fail, closed-period aware).
3. **Void metadata** columns + status where missing (per-table migration).
4. **Void action + required-reason modal** UI (GUARD-mocked) across bills/expenses/invoices/JEs/settlements.
5. Wire new finance entities (escrow/loan/tax/depreciation/bankruptcy) to the **same** void mechanic as they ship.

All money-path; GUARD verifies the reversing-entry diff vs QuickBooks; design session with Jorge before code.
