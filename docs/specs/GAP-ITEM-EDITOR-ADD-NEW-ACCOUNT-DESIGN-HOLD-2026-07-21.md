# DESIGN-HOLD — ItemEditorModal "+ Add new account" opens the WRONG create kind

**Block:** `ps-a-item-editor-account-pickers-no-addnew` (accounting · Products & Services item editor).
**Status:** HOLD-FOR-JORGE (financial — touches `catalogs.accounts` creation). **Docs-only PR, no code.**
**Base:** `origin/main` @ `e2db37a74`. **Author:** Cursor BUILDER (never merges).

## ROOT CAUSE

`apps/frontend/src/pages/lists/accounting/ItemEditorModal.tsx` gives the **Income account** and **Expense
account** `Combobox` pickers an inline `allowAddNew`:

```tsx
// income picker
allowAddNew={{ label: "+ Add new account", onAdd: () => setAccountCreateSide("income") }}
// expense picker
allowAddNew={{ label: "+ Add new account", onAdd: () => setAccountCreateSide("expense") }}
```

Both set `accountCreateSide` ∈ `"income" | "expense"`, which opens **one** create chrome:

```tsx
<QuickCreateEntityModal
  open={accountCreateSide !== null}
  kind="category"          // ← WRONG: creates a Category, not a GL account
  operatingCompanyId={operatingCompanyId}
  onClose={() => setAccountCreateSide(null)}
  onCreated={handleAccountCreated}
/>
```

`QuickCreateEntityModal`'s `QuickCreateKind` union is
`"vendor" | "customer" | "item" | "category" | "part" | "class"` — **there is no `"account"` kind.**
So "+ Add new account" actually creates a **qbo_categories** row, and `handleAccountCreated` then assigns
that **category id** to `incomeAccountId` / `expenseAccountId` (the `default_income_account_id` /
`default_expense_account_id` FK to `catalogs.accounts`).

**Why the audit row read as "prop present but unverified":** the `allowAddNew` prop is literally there
(so a title/grep match passes), but the wiring is a cross-referential defect.

## IMPACT (bounded, likely fail-safe today)

- On save, the item's `default_income_account_id` would carry a **category** id. The item editor header
  states "Same-entity + account-type are enforced server-side", so the backend most likely **rejects** the
  category id as an income/expense account (not-found / wrong-type) → save fails with a confusing error.
- No confirmed silent bad-data write, but the surface is broken UX and a latent integrity hazard if any
  code path skips the server-side account-type check.

## WHY THIS IS FINANCIAL → HOLD (not a self-merge UI fix)

Creating a **GL account** is a `catalogs.accounts` INSERT. Per `.cursor/rules/13` + skill §1.4, any touch to
`catalogs.accounts` (schema **or data**) is the **financial cluster** → build-and-HOLD, owner-approved only.
The owner directive for this lane also says **"Reserve accounts owner-manual only"** and **"do not invent GL
accounts."** So the "correct" fix (an inline account creator) is exactly the thing that is owner-gated —
it cannot be shipped by a builder unilaterally, and no GL account/type may be invented here.

## OPTIONS (owner picks — do NOT implement until Jorge rules)

1. **Owner-manual accounts (most conservative, matches the standing directive).**
   Remove the inline `allowAddNew` from the two **account** pickers and instead route the user to the
   canonical Chart-of-Accounts creator (open CoA create, or a "manage accounts" link). Keep the Category
   `allowAddNew` as-is (categories are catalog data, non-financial). *Trade-off:* one fewer inline shortcut,
   but honest — account creation stays in the owner-controlled CoA surface. (Note: this narrows a surface,
   so it needs the owner's explicit OK per never-delete/only-add.)

2. **Add a real `"account"` QuickCreateKind (financial build, owner-gated).**
   Extend `QuickCreateEntityModal` with `kind="account"` that INSERTs into `catalogs.accounts` via the
   existing CoA create endpoint, constrained to the correct account **types** per picker
   (income: `Income`/`OtherIncome`; expense: `Expense`/`CostOfGoodsSold`/`OtherExpense`), same-entity +
   audit. Reuse the existing CoA create service — **write no new account-numbering / GL logic.** Requires
   Jorge approval + the CoA create endpoint confirmed to exist and be entity-scoped.

3. **Disable + label as coming-soon.** Grey the inline "+ Add new account" with a tooltip pointing to CoA.
   Least churn, but leaves the shortcut non-functional.

## OWNER QUESTIONS

1. Should product-service items be able to **create a GL account inline at all**, or must account creation
   stay **owner-manual in Chart of Accounts** (per "reserve accounts owner-manual only")? → picks Option 1
   vs 2/3.
2. If inline account creation is allowed (Option 2): which account **types/subtypes** may be created from
   the income picker vs the expense picker, and is there a required default (e.g. carrier default
   "Sales of Service Income" for income)?
3. Which entity's `catalogs.accounts` receives the new row — always the current `operatingCompanyId`, with
   FORCED RLS + audit? (Confirm no cross-entity account creation.)

## GUARD (to add WITH the eventual fix, not now)

- On fix: a `scripts/verify-*.mjs` asserting the account pickers' create chrome resolves to an **account**
  creator (never `kind="category"`), and that no account-FK is ever assigned a category id. Not added in
  this HOLD PR because a red guard on `origin/main` would break CI before the fix lands.

## LIVE PROOF

UNVERIFIED against live app (would require creating an account = financial write; owner-gated, not done).
Defect confirmed by static read of `origin/main` `ItemEditorModal.tsx` + `QuickCreateEntityModal.tsx`
(`QuickCreateKind` has no `"account"` member).

## REMAINING

Blocked on owner ruling (Question 1). No code/schema/flag changed by this PR.
