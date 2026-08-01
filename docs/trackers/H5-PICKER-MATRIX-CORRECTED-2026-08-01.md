# H5 / CLS-PICKER-WRITE≠READ — corrected picker matrix (re-derived from live state)

**Date:** 2026-08-01 · **Author:** Claude Coder · **Supersedes:** `03-PICKER-MATRIX.md` in the
2026-07-31 audit run, for the write≠read class only.

## Verdict up front

**H5 is an EMPTY WAVE. Clause 3 (picker writes the same table it reads) has ZERO violations across
all 23 catalog-backed pickers, and it is already enforced by a test.** There is nothing to build.

The original matrix's picker findings rest on two mistakes, both of which would have led to "fixing"
working pickers.

---

## Mistake 1 — the "catalogs found empty" column is mostly the RLS false-zero

Those counts were read under `SET app.bypass_rls='lucia'` against tables whose policies had no
bypass branch, so they returned 0 regardless of contents. That defect is fixed (PR #3934). Re-measured
on prod 2026-08-01:

| Catalog | Matrix said | Actually (total / TRANSP) |
|---|---|---|
| `catalogs.expense_categories` | 0 | **9 / 3** |
| `catalogs.cash_advance_types` | 0 | **18 / 6** |
| `catalogs.escrow_types` | 0 | **3 / 1** |
| `catalogs.driver_deduction_types` | 0 | **21 / 7** |
| `catalogs.vendor_types` | — | **24 / 8** |
| `catalogs.parts` | 0 | 0 — correct |
| `catalogs.fuel_stations` | "present but not linked" | **0 — actually empty** (inverted) |

Four of five "empty" catalogs are populated. One row is inverted.

## Mistake 2 — the named catalog is not the table the picker reads

Twice the matrix attributed a failure to a catalog the picker never touches.

**PICK-001 (Create Bill / WO category).** Stated cause: "`catalogs.expense_categories` = 0 so the
picker has no canonical read surface." Both halves are wrong. The picker reads **`catalogs.accounts`**
— postable expense-type leaves — and `apps/backend/src/maintenance/wo-cost-context.routes.ts:23-38`
says so in its own comment: *"(catalogs.accounts) — the same table inline '+ Add new account/category'
writes — not mdata.qbo_accounts (mirror)"*. Read surface on prod: **TRANSP 123, TRK 181, USMCA 24**
postable expense accounts. `catalogs.expense_categories` is a *separate* catalog, the FK target of
`accounting.expense_lines.expense_category_uuid`. Two different things sharing a name.

**Parts picker.** Matrix: "`catalogs.parts` = 0 → affects Maintenance, Work Orders". The parts picker
reads **`maintenance.parts_inventory`** (144 rows), not `catalogs.parts`.

---

## The actual clause-3 state, derived from the registry

`apps/frontend/src/components/parity/catalogPickerRegistry.ts` declares, per picker, the canonical
`readTable`, the canonical `writeTable`, a `readWriteParity` classification, and a `proof` field that
must carry a backend `file:line` rather than a bare assertion.

| | Count |
|---|---|
| Registry entries | 23 |
| **`readTable` ≠ `writeTable`** | **0** |
| `same-endpoint-verified` (one route factory interpolates one `tableName` into both SELECT and INSERT) | 15 |
| `legacy-bespoke-form` (hand-written create form; parity recorded, not endpoint-guaranteed) | 8 |

The 8 legacy-bespoke-form entries were the plausible risk — a hand-written form could drift from the
list query. Checked individually; every one holds:

| createKind | readTable | writeTable | |
|---|---|---|---|
| vendor | `mdata.vendors` | `mdata.vendors` | same |
| customer | `mdata.customers` | `mdata.customers` | same |
| account | `catalogs.accounts` | `catalogs.accounts` | same |
| service | `catalogs.items` | `catalogs.items` | same |
| item | `catalogs.items` | `catalogs.items` | same |
| category | `catalogs.accounts` | `catalogs.accounts` | same |
| class | `catalogs.classes` | `catalogs.classes` | same |
| part | `maintenance.parts_inventory` | `maintenance.parts_inventory` | same |

`category → catalogs.accounts` here is independent corroboration of the PICK-001 correction above:
the registry and the backend route agree, and neither points at `catalogs.expense_categories`.

## It is already guarded

`catalogPickerRegistry.test.ts` asserts, for **every** key with no skip:
- `writeTable === readTable` — *"create must target the table the picker reads"*
- `writeEndpoint === readEndpoint` and `readWriteParity === "same-endpoint-verified"` (catalog-backed only)
- `entityScoped === true`
- `evidence.length > 10` — a `file:line`, not a bare claim

So the class cannot silently regress. A new picker that reads one table and writes another fails that
test.

---

## What remains genuinely open (NOT clause 3)

These are real, but they belong to other clauses/classes and should not be filed under H5:

1. **`catalogs.parts` is empty (0 rows)** while the parts picker reads `maintenance.parts_inventory`
   (144). Whether `catalogs.parts` is intended as a separate catalog or is dead is an owner question,
   not a picker defect.
2. **`catalogs.fuel_stations` is empty (0 rows)** — a fuel-station picker would have no read surface.
   That is a CLS-ECON-EMPTY question (seed or retire), not write≠read.
3. **Clause 4 (server-side search vs client `limit:200`)** — the original PICK-003 row. Untouched
   here; genuinely unverified and worth its own pass. Note the customer-picker cap was already
   addressed (#3899, guard 1875).

## Method note

Every count above was read on prod `br-fancy-credit-akjnd07a` on 2026-08-01 with
`SET app.bypass_rls='lucia'` **after** the catalogs bypass fix landed, so these reads cannot
false-zero the way the original audit's did. Where a table's read surface mattered, the backend query
was traced to its `FROM` clause rather than inferred from the field name — which is exactly what the
two mistakes above turned on.
