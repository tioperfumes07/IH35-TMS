# TAB COMPLETION STANDARD — owner order, 2026-09-03

**Applies to the Load Costs tab and EVERY tab, board, list, register and drill-through built from
now on. Governed by §0 THE FINISH LAW: a seat that starts one of these finishes all eleven points
before it takes another task.**

A tab that renders is not done. A tab that queries is not done. A tab is done when all eleven hold
and a person has seen it in Chrome.

---

## A. LINKAGE 1–12 — complete, both ways

Every record the surface creates or displays links to all twelve hubs, or declares an explicit N/A
with a stated reason. **Silence is a defect.**

| # | Hub | # | Hub |
|---|---|---|---|
| 1 | `org.companies` | 7 | `mdata.customers` |
| 2 | `identity.users` | 8 | `maintenance.work_orders` |
| 3 | `mdata.drivers` | 9 | `mdata.vendors` |
| 4 | `mdata.units` | 10 | `accounting.journal_entries` |
| 5 | `mdata.loads` | 11 | `docs.files` |
| 6 | `catalogs.accounts` | 12 | `mdata.equipment` |

Both ways means: the record points at the hub, **and** the hub's surface can find the record.
A one-way link is half a link. Never FK into a retired table (`payroll.*`, `settlement.*`, `bank.*`,
`maint.*`, `accounting.qbo_*`).

## B. Adjustable columns — ParityTable only

Drag-resize, drag-reorder, auto-fit, the gear, the standard header. **Never hand-roll a `<table>`.**

## C. Sorting — ascending and descending on every column

`sortable: true` per column (ParityTable default is true unless `sortable: false`) with a `sortValue`
extractor where the key is not a plain lookup. Header sort must **re-query server-side** on paged
lists. Persist sort in the URL via `useUrlSort` where the page supports it.

## D. Dropdown filter — a Combobox, filtered from live data

Never free text, never a native `<select>`, never a hardcoded option list. Must dismiss on outside click.

## E. A dates column, always

Visible by default, without opening the gear. Incurred/earned default; due for cash flow/A/P; paid for recon.

## F. QuickBooks money format

Right-aligned, tabular numerals, two decimals, thousands separated. Negatives explicit. Cents stored, dollars rendered.

## G. QuickBooks calendar

Shared DatePicker. **Zero `<input type="date">`.**

## H. Header row — the locked colour pair

Background `#14314F`, text `#FFFFFF`, 11px / weight 700 / UPPERCASE. Set the token; all ParityTable call sites inherit.

## I. Plain English

No underscores, no machine names, no all-capitals data on operator surfaces.

## J. Empty state names the filter

Empty is a question. Name the entity, filter, and range.

## K. Live proof

Chrome screenshot, not assertion.

---

## Scorecard (paste filled in)

```
A  linkage 1-12 ......... __/12 declared, N/A reasons stated
B  adjustable columns ... ParityTable, no hand-rolled <table>
C  sort asc/desc ........ every column, server-side re-query on paged lists
D  filter combobox ...... live values, dismisses on outside click
E  dates column ......... visible by default, which date + why
F  money format ......... right-aligned, tabular, 2dp, negatives explicit
G  calendar ............. shared DatePicker, zero type="date"
H  header colour ........ #14314F / #FFFFFF, 11px/700/UPPERCASE
I  plain English ........ no underscores, machine names, ALLCAPS data
J  empty state .......... names the filter
K  Chrome proof ......... screenshot attached
```
