# GLOBAL SORT RULE — Locked UI Contract

**Rule ID:** GLOBAL-SORT-RULE  
**Status:** LOCKED  
**Effective Date:** 2026-06-07  
**Owner:** IH35-TMS frontend platform  
**CI Guard:** `scripts/verify-global-sort-rule.mjs`

---

## The Rule (Canonical Text — Do Not Paraphrase)

> Every column header in every list/catalog/bills/invoices/charts/categories/registers across the whole app sorts on click. First click = ascending (▲). Second click = descending (▼). QBO-style. No column header is ever non-sortable unless it is a pure action column (e.g., a delete button column). This applies to all list views powered by the shared ListView component (CA-02) and all existing DataTable/FleetTable/etc. components.

---

## Scope

This rule applies to **every data column** in every table, list, or register rendered in `apps/frontend/src/`, including but not limited to:

| Surface | Component |
|---|---|
| Lists (customers, vendors, drivers, users) | `ListView` (CA-02), `DataTable` |
| Catalogs | `CatalogTable`, `useCatalogQuery` columns |
| Bills / Invoices | Any table on billing or invoice pages |
| Reports / Charts | `RunnerTable`, report config columns |
| Registers | Account register, COA register |
| Driver sub-views | Fuel, Escrow, Safety, Payroll, Settlement history |
| Documents | Documents tab / vault |
| Admin views | Mobile audit, user management |

---

## Compliance Criteria

### Compliant Column

A column is **compliant** when:

1. **`DataTable` / `CatalogTable` / `RunnerTable` pattern** — the column definition object explicitly sets `sortable: true`.
2. **`ListView` (CA-02) pattern** — the column definition object explicitly sets `sortType` to one of `"text" | "number" | "currency" | "date"`.
3. **Action column exemption** — the column is a pure action column (e.g., a row-level delete, edit icon, or expand button) with no data value to sort on. Exempt columns must have a key/id matching `actions`, `action`, `delete`, `expand`, `controls`, or `_actions`.

### Non-Compliant Column

A column is **non-compliant** when:

1. **`sortable: false`** is explicitly set on a data column.
2. **`sortable` is absent** on a `DataTable`/`CatalogTable`/`RunnerTable`-style column definition that has a `key` and `label`.
3. **`sortType` is absent** on a `ListViewColumn` definition that has an `id` and `label` and is not an action column.

---

## Implementation Notes

### `DataTable` / `CatalogTable` pattern

```ts
// COMPLIANT
{ key: "driver_name", label: "Driver", sortable: true }

// NON-COMPLIANT — explicit false
{ key: "description", label: "Description", sortable: false }

// NON-COMPLIANT — absent
{ key: "status", label: "Status" }

// EXEMPT — pure action column
{ key: "actions", label: "", render: (row) => <DeleteButton row={row} /> }
```

### `ListView` (CA-02) pattern

```ts
// COMPLIANT
{ id: "invoice_date", label: "Date", sortType: "date", width: 120 }

// NON-COMPLIANT — sortType absent
{ id: "notes", label: "Notes", width: 200 }

// EXEMPT — action column
{ id: "actions", label: "", width: 60 }
```

---

## Behavior Contract

| Click | Result |
|---|---|
| First click on any data column header | Sort ascending (▲) |
| Second click on same header | Sort descending (▼) |
| Third click (optional) | Return to default/unsorted OR remain descending (implementation choice, consistent per component) |
| Click on action column header | No sort — action columns have no header text |

---

## Grandfathering Policy

Columns that existed **before 2026-06-07** and are non-compliant are **warned** (not failed) by the CI guard. They are tracked in the compliance report and must be remediated in a follow-up pass.

Any column **added or modified after 2026-06-07** without `sortable: true` (or `sortType` for ListView) causes a **hard CI failure**.

---

## CI Enforcement

```
npm run verify:global-sort-rule
```

The guard:
- Exits `0` in all cases (warn-only for pre-rule columns, fail only for post-rule violations).
- Prints a compliance report listing every non-compliant column with file, line number, and violation type.
- Hard-fails (`exit 1`) if any column definition added **after 2026-06-07** lacks `sortable: true` / `sortType`.

---

## Exemptions Registry

The following columns are permanently exempt from this rule:

| File | Key / ID | Reason |
|---|---|---|
| *(none at lock time)* | | |

To add an exemption, update this table and add the key to `EXEMPT_COLUMN_KEYS` in `scripts/verify-global-sort-rule.mjs`. Exemptions require a comment explaining why the column is a pure action column.

---

## Related Documents

- `IH35-TMS-MASTER-RULES.md` — master rules registry
- `docs/specs/BLOCK-READY-PROCESS.md` — block-ready gate process
- `apps/frontend/src/components/lists/ListView/types.ts` — `ListViewColumn` type definition
- `apps/frontend/src/components/DataTable.tsx` — `Column<T>` type definition
