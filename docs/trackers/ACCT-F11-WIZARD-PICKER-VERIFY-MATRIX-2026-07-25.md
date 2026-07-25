# ACCT-F11 — Wizard depth (VERIFY-1) + universal picker (VERIFY-2) matrix

**FINDING:** F11 · **Lane:** FINANCIAL-HOLD · **Block:** ACCT-F11  
**Module:** accounting · **Deployed SHA at sweep open:** _pending merge_  
**Law:** `EVERY-PR-AUDIT-CHECKLIST.md` VERIFY-1 (chrome + field depth) · VERIFY-2 (7-clause picker law)

## Scope

Re-run click-through verification for the four core money wizards on **TRANSP** and **USMCA**:

| Wizard | Active route / surface | Source | Canonical write |
|---|---|---|---|
| **Bill** | `/accounting/bills/create` · `VendorBillCreatePage` | `VendorBillForm.tsx` | `accounting.bills` + `accounting.bill_lines` |
| **Expense** | `/accounting/expenses/create` · `ExpenseCreatePage` | `RecordExpenseForm.tsx` | `accounting.expenses` |
| **Pay Bill** | Bills list → Pay Bill drawer | `PayBillModal.tsx` | `accounting.bill_payments` |
| **Journal Entry** | Accounting → Manual JE drawer | `ManualJEModal.tsx` | `accounting.journal_entries` + postings |

**Status legend:** `UNVERIFIED` = click-through not yet captured (honest default) · `PASS` = live browser evidence attached · `FAIL` = defect found → opens additive fix block (M grows).

> **No FAIL→PASS theater:** this sweep opens with every live cell **UNVERIFIED**. Repo/backbone hints are noted separately; they do **not** upgrade a cell to PASS.

## Machine manifest (guard reads this block)

```json
{
  "block_id": "ACCT-F11",
  "wizards": ["bill", "expense", "pay_bill", "journal_entry"],
  "entities": ["TRANSP", "USMCA"],
  "verify_layers": ["VERIFY-1", "VERIFY-2"],
  "surfaces": {
    "bill": {
      "source": "apps/frontend/src/components/accounting/VendorBillForm.tsx",
      "submit": "apps/frontend/src/components/accounting/vendorBillLines.ts",
      "route": "apps/frontend/src/pages/accounting/VendorBillCreatePage.tsx"
    },
    "expense": {
      "source": "apps/frontend/src/components/expenses/RecordExpenseForm.tsx",
      "submit": "apps/frontend/src/components/expenses/recordExpenseSubmit.ts",
      "route": "apps/frontend/src/pages/accounting/ExpenseCreatePage.tsx"
    },
    "pay_bill": {
      "source": "apps/frontend/src/pages/accounting/PayBillModal.tsx",
      "route": "apps/frontend/src/pages/accounting/BillsPage.tsx"
    },
    "journal_entry": {
      "source": "apps/frontend/src/components/accounting/ManualJEModal.tsx",
      "route": "apps/frontend/src/pages/accounting/ManualJEListPage.tsx"
    }
  }
}
```

---

## VERIFY-2 — seven clauses (reference)

1. **Scoped catalog** — picker lists entity-scoped canonical rows (`operating_company_id`).
2. **Inline + Add new first row** — inside dropdown, not an external button.
3. **Opens QBO wizard** — inline create uses full create chrome (ReferenceSelect / QuickCreate).
4. **Same chrome** — matches QBO-parity drawer/modal pattern.
5. **Write = read table** — create writes the same canonical table the picker reads.
6. **Selected after save** — new row appears and is selected; survives reload.
7. **Current company** — no cross-entity leak; TRANSP pickers never show USMCA rows (and vice versa).

---

## Bill (`VendorBillForm`)

### VERIFY-1 — rendered field → submit contract

| Field / control | Submit key / destination | TRANSP | USMCA | Backbone hint |
|---|---|---|---|---|
| Bill type tab | memo `bill_type:` | UNVERIFIED | UNVERIFIED | controlled → memo |
| Bill date | `bill_date` | UNVERIFIED | UNVERIFIED | controlled → payload |
| Terms | memo `terms:` + due auto | UNVERIFIED | UNVERIFIED | controlled → memo + due helper |
| Due date | `due_date` | UNVERIFIED | UNVERIFIED | controlled → payload |
| Bill number | `bill_number` | UNVERIFIED | UNVERIFIED | controlled → payload |
| A/P account | `coa_account_id` | UNVERIFIED | UNVERIFIED | ReferenceSelect → payload |
| Vendor | `vendor_id` | UNVERIFIED | UNVERIFIED | ReferenceSelect → payload |
| Load number | memo `load:` | UNVERIFIED | UNVERIFIED | controlled → memo |
| Driver | memo `driver:` | UNVERIFIED | UNVERIFIED | Combobox → memo only |
| Unit | `unit_id` / memo `unit:` | UNVERIFIED | UNVERIFIED | Combobox → FK or memo |
| Class | memo `class:` | UNVERIFIED | UNVERIFIED | ReferenceSelect → memo |
| Line editor (Section A/B) | `lines[]` | UNVERIFIED | UNVERIFIED | TwoSectionLineEditor → bill_lines |
| Tax rate (display) | memo `tax_rate:` / `tax_amount_display_only:` | UNVERIFIED | UNVERIFIED | display-only per owner law |
| Attachments | `attachment_draft_id` | UNVERIFIED | UNVERIFIED | UploadZone draft id |
| WO / claim linkage | `work_order_id` / `insurance_claim_id` | UNVERIFIED | UNVERIFIED | optional props |

### VERIFY-2 — pickers (7 clauses each)

| Picker | Canonical table | TRANSP | USMCA | Notes |
|---|---|---|---|---|
| Vendor | `mdata.vendors` | UNVERIFIED | UNVERIFIED | ReferenceSelect `createKind=vendor` |
| A/P account | `catalogs.accounts` | UNVERIFIED | UNVERIFIED | postable Liability/AP filter; Rule 19 reserve not auto-default |
| Class | `catalogs.classes` | UNVERIFIED | UNVERIFIED | ReferenceSelect `createKind=class` |
| Driver | `mdata.drivers` | UNVERIFIED | UNVERIFIED | Combobox + CreateDriverModal (inline first row) |
| Unit | `mdata.units` | UNVERIFIED | UNVERIFIED | Combobox + CreateUnitModal |
| Line category (Section A) | `catalogs.accounts` | UNVERIFIED | UNVERIFIED | via TwoSectionLineEditor / CostBreakdown |

---

## Expense (`RecordExpenseForm`)

### VERIFY-1 — rendered field → submit contract

| Field / control | Submit key / destination | TRANSP | USMCA | Backbone hint |
|---|---|---|---|---|
| Vendor | `vendor_uuid` | UNVERIFIED | UNVERIFIED | ReferenceSelect |
| Category | `category_account_id` / `category_qbo_id` | UNVERIFIED | UNVERIFIED | ReferenceSelect |
| Payment date | `expense_date` | UNVERIFIED | UNVERIFIED | DatePicker |
| Amount | `amount_cents` | UNVERIFIED | UNVERIFIED | MoneyInput |
| Unit | `unit_id` (optional) | UNVERIFIED | UNVERIFIED | Combobox |
| Description | memo (via `buildRecordExpenseMemo`) | UNVERIFIED | UNVERIFIED | folded into memo |
| Payment method | required gate + memo | UNVERIFIED | UNVERIFIED | SelectCombobox |
| Payment account | `payment_account_uuid` | UNVERIFIED | UNVERIFIED | ReferenceSelect Asset postable |
| Attachments | `attachment_draft_id` | UNVERIFIED | UNVERIFIED | UploadZone |
| WO linkage | `work_order_id` | UNVERIFIED | UNVERIFIED | optional prop |

### VERIFY-2 — pickers

| Picker | Canonical table | TRANSP | USMCA | Notes |
|---|---|---|---|---|
| Vendor | `mdata.vendors` | UNVERIFIED | UNVERIFIED | ReferenceSelect + ensureDriverVendors |
| Category | `catalogs.accounts` | UNVERIFIED | UNVERIFIED | TMS-native accounts allowed (no qbo-only filter) |
| Unit | `mdata.units` | UNVERIFIED | UNVERIFIED | Combobox + CreateUnitModal |
| Payment account | `catalogs.accounts` | UNVERIFIED | UNVERIFIED | Asset postable only |

---

## Pay Bill (`PayBillModal`)

### VERIFY-1 — rendered field → submit contract

| Field / control | Submit key / destination | TRANSP | USMCA | Backbone hint |
|---|---|---|---|---|
| Payment date | `payment_date` | UNVERIFIED | UNVERIFIED | DatePicker |
| Payment method | `payment_method` | UNVERIFIED | UNVERIFIED | native select |
| Payment amount | `amount_cents` | UNVERIFIED | UNVERIFIED | MoneyInput |
| From bank account | `from_bank_account_id` | UNVERIFIED | UNVERIFIED | when check/ach/wire/cc |
| Check number | `check_number` | UNVERIFIED | UNVERIFIED | required when check |
| Reference number | `reference_number` | UNVERIFIED | UNVERIFIED | optional |
| Memo | `memo` | UNVERIFIED | UNVERIFIED | textarea |
| Apply-to-bill row | implicit bill id | UNVERIFIED | UNVERIFIED | read-only context |

### VERIFY-2 — pickers

| Picker | Canonical table | TRANSP | USMCA | Notes |
|---|---|---|---|---|
| From bank account | `banking.bank_accounts` (via `getAllAccounts`) | UNVERIFIED | UNVERIFIED | Combobox first-row Plaid connect |

---

## Journal Entry (`ManualJEModal`)

### VERIFY-1 — rendered field → submit contract

| Field / control | Submit key / destination | TRANSP | USMCA | Backbone hint |
|---|---|---|---|---|
| Journal date | `entry_date` | UNVERIFIED | UNVERIFIED | step 1 |
| Reference number | `reference_number` | UNVERIFIED | UNVERIFIED | step 1 |
| Memo | `memo` | UNVERIFIED | UNVERIFIED | step 1 |
| Line account | `postings[].account_id` | UNVERIFIED | UNVERIFIED | step 2 |
| Line class | `postings[].class_id` | UNVERIFIED | UNVERIFIED | step 2 optional |
| Line debit | `postings[] debit amount_cents` | UNVERIFIED | UNVERIFIED | balanced gate |
| Line credit | `postings[] credit amount_cents` | UNVERIFIED | UNVERIFIED | balanced gate |
| Line description | `postings[].description` | UNVERIFIED | UNVERIFIED | per line |

### VERIFY-2 — pickers

| Picker | Canonical table | TRANSP | USMCA | Notes |
|---|---|---|---|---|
| Account (per line) | `catalogs.accounts` | UNVERIFIED | UNVERIFIED | ReferenceSelect `createKind=account` |
| Class (per line) | `catalogs.classes` | UNVERIFIED | UNVERIFIED | ReferenceSelect `createKind=class` |

---

## Sweep summary (honest)

| Wizard | VERIFY-1 TRANSP | VERIFY-1 USMCA | VERIFY-2 TRANSP | VERIFY-2 USMCA |
|---|---|---|---|---|
| Bill | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| Expense | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| Pay Bill | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| Journal Entry | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |

**Next step:** browser click-through per cell on live app (`app.ih35dispatch.com`) for TRANSP then USMCA; attach evidence (screenshot path / health SHA / Neon row) or mark FAIL with fix-block id.

## Fix blocks opened from failing cells

_None yet — sweep not executed._

---

## GIT-GATE (FINANCIAL-HOLD — build only)

```
FINDING: F11
LANE: FINANCIAL-HOLD
DOD-A: UNVERIFIED — active routes exist in repo; live ComingSoon not re-checked this PR
DOD-B: UNVERIFIED — VERIFY-1 matrix scaffolded; click-through pending
DOD-C: UNVERIFIED — linkage F+R not re-proven live
DOD-D: UNVERIFIED — economics / reserve-default not click-through proven
DOD-E: UNVERIFIED — browser evidence required per cell
VERIFY-1: UNVERIFIED — matrix rows listed; live depth not captured
VERIFY-2: UNVERIFIED — picker clauses listed; live 7-clause not captured
VERIFY-3: UNVERIFIED
VERIFY-4: UNVERIFIED
VERIFY-5: UNVERIFIED — TRANSP+USMCA sweep pending
VERIFY-6: UNVERIFIED — build-and-HOLD; flags not exercised
VERIFY-7: PASS — no tab/leaf change in this block
VERIFY-8: UNVERIFIED — RLS re-proof deferred to click-through
MODULE_PROGRESS: accounting — see docs/module-completion/accounting.json (no item closed this PR)
ITEMS_TOUCHED: bill-wizard-verify, expense-wizard-verify, paybill-wizard-verify, je-wizard-verify
MIGRATE: N/A
ROOT CAUSE: VERIFY-1/2 matrix stale for Bill/Expense/Pay Bill/JE — never re-run after last wizard changes
FIX: publish 4×2 matrix + guard; execute click-through in follow-up (or owner session)
GUARD: scripts/verify-acct-wizard-picker-matrix.mjs + verify-step 1472
LIVE PROOF: UNVERIFIED — click-through not yet completed for any cell
REMAINING: all matrix cells UNVERIFIED until browser sweep; failing cells → additive fix blocks
```
