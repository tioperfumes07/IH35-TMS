# DESIGN — Expense duplicate-detection + expense-policy enforcement (HOLD)

> **STATUS: DESIGN ONLY · BUILD-AND-HOLD · DO NOT MERGE.**
> Doc-only. **NO migration, NO money code, NO flag flip.** Planning artifact for a future
> financial-cluster PR (Rule 13; separate Builder / Financial-Accounting / GUARD agents).
> Doc-only exception: Rule 02 §Exception.
>
> - Block: `audit9-expense-validation-duplicate-detection` (accounting drain)
> - Branch: `design/audit9-expense-duplicate-detection-hold` (fresh from `origin/main` @ `e2db37a74`)
> - Spec sources: Rule 01 blueprint set; Law of the Land linkage; CPA locks; Rule 07 never-delete.

---

## 0. Problem statement (the trust defect)

Any expense can be recorded twice — same vendor, same amount, same date, same (or blank) reference — and the
system accepts both with **no warning and no block**. There is also **no expense-policy layer** (per-category
limits, receipt-required thresholds, owner-approval-required amounts). Duplicate/over-policy spend is a
first-order financial-controls gap that QuickBooks (duplicate-check on bill/expense) and NetSuite (expense
policy engine) both enforce and an auditor/CPA expects.

**Fix-not-patch** (Rule 16): the root is a missing **validation/control layer** on the expense write path,
not a display issue. It must **surface** (warn + require confirm) or **block** (policy violation) at create
time, append an audit trail, and never silently accept.

---

## 1. Verified facts (evidence, not memory) — `origin/main` @ `e2db37a74`

### 1.1 Expense create has no duplicate check
- `apps/backend/src/accounting/expenses.routes.ts:271` `POST /api/v1/expenses` builds an
  `INSERT INTO accounting.expenses (…)` (`:365`) directly from the request body. There is **no**
  pre-insert query for a matching (vendor, amount, date) expense, and **no** policy gate. Grep for
  `duplicate` / `dedup` in `expenses.routes.ts` / `expenses.service.ts` returns nothing.
- Idempotency that *does* exist elsewhere is unrelated: `payments/apply.service.ts` upserts on
  `(payment_id, target_kind, target_id)` — that is payment-application idempotency, not expense de-dup.

### 1.2 The fields needed for a duplicate signature already exist
- `accounting.expenses` carries `operating_company_id`, a vendor reference, `total_amount_cents`,
  `transaction_date`, and status columns (the create path writes these). A duplicate **signature** can be
  computed from existing columns — **no new required column** is strictly needed for detection (an optional
  `dedupe_hash` / `duplicate_of_expense_id` may be added for surfacing/linkage; see §2.3).

### 1.3 Void-not-delete is the correction path
- Expenses are voided, not deleted (`POST /api/v1/expenses/:expenseId/void` `:793`) — so a "duplicate" that
  is confirmed intentional stays as a real row; the control is **detect + confirm/override**, never auto-delete.

---

## 2. Design — layered expense validation (additive; surfaces, never silently blocks money)

### 2.1 Duplicate detection (soft warn + explicit override)
On `POST /api/v1/expenses`, before insert, run a tenant-scoped probe:

```
SELECT id, display_id, total_amount_cents, transaction_date, status
FROM accounting.expenses
WHERE operating_company_id = $oc
  AND vendor_ref = $vendor            -- same vendor/payee
  AND total_amount_cents = $amount
  AND transaction_date = $date
  AND voided_at IS NULL
  AND (reference_number IS NULL OR reference_number = $ref)
LIMIT 5
```

- **Match found** → return `409`-style structured warning `{ code: "possible_duplicate_expense", matches:[…] }`.
  The client must re-submit with an explicit `confirm_not_duplicate: true` (or `duplicate_of_expense_id` to
  link intentionally, e.g. a legitimate second identical fee). This mirrors QuickBooks' duplicate-bill prompt.
- **Configurable window:** the exact-date match can widen to a ±N-day window per owner setting (§5).
- Detection is **advisory** (never auto-blocks a real expense) — the human explicitly confirms; the confirm
  is audited.

### 2.2 Expense-policy enforcement (per-category controls)
A tenant-scoped policy table drives hard/soft controls at create time:
- per-`expense_category`: max amount (soft warn / hard block), receipt-required threshold,
  owner-approval-required threshold.
- **Hard block** → structured error, no insert, audit row (`accounting.expense.policy_blocked`).
- **Soft warn / requires-approval** → insert allowed but flagged (status `pending_approval`) + audit.
- All amounts owner-set; the system never invents a limit. Default = **no policy rows = today's behavior**
  (fully backward-compatible; policy is opt-in per entity/category).

### 2.3 Optional additive columns (surfacing + linkage only)
- `accounting.expenses.duplicate_of_expense_id uuid NULL REFERENCES accounting.expenses(id)` — records an
  owner-confirmed intentional-duplicate link (forward/reverse drill).
- `accounting.expenses.dedupe_hash text NULL` — deterministic hash of (vendor, amount, date, ref) for a fast
  partial index-backed probe. Both **nullable, additive** — existing rows 0-impact.

### 2.4 Feature flag — OFF by default
- `EXPENSE_DUPLICATE_DETECTION_ENABLED` and `EXPENSE_POLICY_ENFORCEMENT_ENABLED` (per-entity, default OFF).
  OFF = exactly today's behavior. Flag flip = HOLD event.

## 2.5 Linkage matrix (forward + reverse — Law of the Land §9)

| From | To | Mechanism |
|---|---|---|
| `accounting.expenses` (dup) | `accounting.expenses` (original) | **NEW** `duplicate_of_expense_id` FK |
| `accounting.expenses` | `mdata.vendors` | existing vendor ref |
| policy block/warn | `audit.audit_events` | append-only audit on every decision |
| expense | `catalogs.accounts` | existing category→GL resolution (`expense_category_account_map`) |

---

## 3. Acceptance[] (future PR — evidence before done)

1. **Default unchanged:** with both flags OFF (or no policy rows), `POST /api/v1/expenses` behaves
   byte-for-byte as today; test proves a would-be duplicate still inserts silently when detection is OFF.
2. **Duplicate warn:** with detection ON, a (vendor, amount, date) match returns `possible_duplicate_expense`
   with the matched rows; insert only proceeds with explicit `confirm_not_duplicate`/`duplicate_of_expense_id`;
   the confirm is audited.
3. **Policy block:** with a hard category limit set, an over-limit expense is blocked (no insert) + audit row.
4. **Policy soft/approval:** an over-soft-limit expense inserts as `pending_approval` + audit row.
5. **No money math changed:** the GL posting path for a confirmed expense is unchanged (financial-agent
   confirms no new journal math; detection/policy are pre-insert controls only).
6. **Linkage:** §2.5 resolves both directions on live data; a confirmed duplicate links to its original.
7. **Guards wired (Rule 17)** via verify-steps; each fails on a planted regression.
8. **Deploy proof:** `/api/v1/healthz/shallow` `version` == merge SHA.

---

## 4. Guard plan — Rule 17 (no hot-file thrash)

Add `scripts/verify-<name>.mjs` + `scripts/verify-steps/<NNN>-verify-<name>.mjs` (next free ≥ `1210`; do
**not** touch `package.json` / locked-guards / ci.yml). `ctx.run` throws on failure (Rule 18).

| Guard | Asserts |
|---|---|
| `verify-expense-dup-detection-default-off.mjs` | detection/policy gated by per-entity flags default OFF; OFF = no probe (today's behavior). |
| `verify-expense-dup-probe-tenant-scoped.mjs` | the duplicate probe filters by `operating_company_id` and excludes `voided_at` rows (no cross-tenant leak). |
| `verify-expense-policy-block-audited.mjs` | a hard-block/soft-warn/approval decision always writes an append-only audit row (never a silent accept/reject). |
| `verify-expense-dup-no-autodelete.mjs` | detection never DELETEs/auto-voids an expense (void-not-delete; human confirm only). |

`scripts/verify-hold-merge-gate.mjs` already blocks merge without `JORGE-APPROVED`.

---

## 5. Explicit owner decisions required (system will NOT guess)

1. **Duplicate match window:** exact `transaction_date` vs ±N days; include/exclude reference number in the key.
2. **Policy limits per category:** which categories get hard vs soft limits, receipt-required threshold,
   owner-approval-required amount (owner-set — no default guessed).
3. **Approval routing:** who approves a `pending_approval` expense (owner vs manager) and via which surface.
4. **Enablement scope:** which entities turn detection/policy ON first.

## 6. Non-goals

- No auto-delete/auto-void of expenses (void-not-delete, Rule 04). No TMS→QBO write-back. No new GL math
  (controls are pre-insert; posting unchanged, Rule 13). No deletion/rename of any surface (Rule 07).

## 7. Handoff

Owner rules §5 → Financial/Accounting agent reviews policy semantics → Builder ships one HOLD PR
(optional additive columns + detection probe + policy table + flags + guards + acceptance evidence); owner
Neon-applies; GUARD re-proves. HOLD / do-not-merge until owner directs.
