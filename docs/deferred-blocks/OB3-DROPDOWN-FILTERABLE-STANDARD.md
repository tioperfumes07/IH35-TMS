═══════════════════════════════════════════════════════════════
BLOCK OB3 — DROPDOWN-FILTERABLE-STANDARD  (type-to-filter everywhere)
Option B. EXISTING PAGES → visual preview (the control look changes slightly).
═══════════════════════════════════════════════════════════════

DEFECT (reproduced live)
  Within a single form (e.g. /accounting/invoices filters), some list controls are
  proper filterable comboboxes (role=combobox / aria-autocomplete — you can type to
  narrow), but others are plain inputs or native <select> that open a list yet do NOT
  filter as you type. Jorge: "many text input boxes where you click and the list is a
  dropdown, but not filter, we can type etc." → inconsistent, and the non-filtering
  ones are slow with long lists (customers, vendors, drivers, accounts, units).

GOAL
  ONE standard, app-wide: every list-selection control is a type-to-filter combobox
  (matches QuickBooks). Click → list opens; type → list narrows; Enter/click → select.
  Applies to: customer pickers, vendor pickers, driver pickers, unit/truck pickers,
  account pickers, category pickers, status filters, "From load" pickers, etc.

TO THE CODER
  git checkout main && git pull origin main && npm install
  git checkout -b feat/ob3-dropdown-filterable
  1. Create/confirm ONE shared <FilterableCombobox> component (accessible:
     role=combobox, aria-autocomplete=list, keyboard nav, type-to-filter, clear button).
     If a shared one already exists, use it as the single source of truth.
  2. Write scripts/audit-nonfilter-dropdowns.mjs: scan the codebase/DOM for list
     controls that are native <select> with >8 options OR text inputs paired with a
     dropdown/listbox but missing role=combobox/aria-autocomplete. Output the list.
  3. Replace each flagged control with <FilterableCombobox>. Preserve the bound
     value/onChange — behavior identical, just now filterable.
  4. Do NOT convert genuinely tiny fixed lists (<=8 stable options, e.g. yes/no,
     a 2-option language switch) — those can stay native. The audit's threshold guards this.
  guard: scripts/verify-ob3-dropdown-filterable.mjs — assert no list control with >8
    options lacks type-to-filter; assert the shared combobox is used.
  NO migration. Component swap only. PREVIEW the new combobox look for approval first.
  Push BLOCK_ID=OB3-DROPDOWN-FILTERABLE, ls-remote, PR. Report PR# + SHA + the audit list.
