# CORRECTION — TWO OF MY OWN CLAIMS FAIL VERIFICATION

Author: Claude (lead verification)
Date: 2026-09-01
Status: BINDING. Supersedes the two documents named below.

Both corrections were produced by running the check I should have run before publishing.
Neither came from a seat report. I am filing them against myself.

---

## CORRECTION 1 — `SETL-GRID-MISSING-STANDARD-COLUMNS-2026-09-01.md` is WITHDRAWN

**What I published:** the page titled "Driver Settlements" has no settlement grid at all; only
`openDriverBillColumns` keyed on `load_number` exists; `display_id` and `period_start` are never
rendered.

**What is actually true on `main`:**

`apps/frontend/src/pages/driver-finance/SettlementsPage.tsx`
- line 11 — `import { SettlementsTable } from "./components/SettlementsTable";`
- line 363 — `<SettlementsTable rows={focusedSettlements} … />`

`apps/frontend/src/pages/driver-finance/components/SettlementsTable.tsx` columns:

| key | label |
|---|---|
| `driver` | Driver |
| `settlement_display_id` | **Settlement #** |
| `period` | **Period** |
| `loads` | Loads |
| `gross` | Gross |
| `deductions` | Deductions |
| `net_pay` | Net Pay |
| `status` | Status |
| `debt_flag` | Debt Flag |
| `action` | Action |

Settlement # and Period are present. **CURSOR WAS RIGHT AND I WAS WRONG.**

**My failure mode:** I grepped `SettlementsPage.tsx` for column definitions, found only
`openDriverBillColumns` (which is declared at the bottom of that same file), and concluded the
settlement grid did not exist. The settlement grid lives in a separate component file that the page
imports. I read one file and reported on two.

This is the **third** time this session I have published a false negative off an incomplete search —
the three "missing" drivers, the "zero foreign keys" on `mdata.assets`, and now this. The pattern is
identical every time: a narrow query returns empty and I report the empty as a fact instead of
treating it as a failed search. **Empty is not evidence. Empty is a question.**

### The residual finding — real, but much smaller

What the owner saw is explained by render order, lines 355–370:

```
<OpenDriverBillsPanel … />     ← renders FIRST
<SettlementsTable … />          ← renders SECOND, below it
```

`OpenDriverBillsPanel` columns are DRIVER · LOAD NUMBER · BILL NUMBER · AMOUNT.

So on `/driver-finance/settlements` the first table under the KPIs and the Payment Pipeline is a
**driver-bills** table keyed on load number. The settlement grid with Settlement # and Period is
below it and requires scrolling. That matches exactly what the owner described: "in the columns I
see load number."

**Regraded finding — `SETL-UX-01`, severity LOW, lane CURSOR, NOT a blocker:**
On the page titled Settlements, the settlements grid should lead. Open Driver Bills is a worklist
panel and belongs below the settlements table, or behind its own tab. No column is missing; the
ordering buries the primary object of the page beneath a secondary one.

The Load Number column inside Open Driver Bills is **correct and stays** — a bill is per-load.
Cursor's read on this is right.

**Also note:** live is `3d6b22c`, tip is `364d1a6`, deploy `dep-daav4sf` in flight. Any live
screenshot taken before that deploy lands is a screenshot of a behind-tip build and cannot settle a
UI question either way.

---

## CORRECTION 2 — Devin-A's linkage claim is WRONG; my $14,789.50 figure STANDS

**Devin-A reported:** bills do not link to loads via `load_id`; they link through
`linked_work_order_uuid` or through the settlement.

**That is false.** From `pg_constraint` and `pg_attribute` on production
(`tiny-field-89581227` / `br-fancy-credit-akjnd07a`):

```
driver_finance.driver_bills.load_id        uuid   NOT NULL
driver_bills_load_id_fkey
    FOREIGN KEY (load_id) REFERENCES mdata.loads(id) ON DELETE RESTRICT
```

Also present and enforced:
```
driver_bills_driver_id_fkey              → mdata.drivers(id)
driver_bills_operating_company_id_fkey   → org.companies(id)
driver_bills_team_driver_id_fkey         → mdata.drivers(id)
driver_bills_created_by_user_id_fkey     → identity.users(id)
```

`load_id` is NOT NULL. **Every driver bill is required to carry its load.** There is no bill in this
table that reaches its load only through a settlement. `driver_bills.load_number` (text) exists
alongside it as a denormalized display copy — it is not the link.

Consequences:

1. **The 39-loads / 16-real / $14,789.50 missing-bill figure is CORRECT and is NOT withdrawn.** It
   was computed with `NOT EXISTS (SELECT 1 FROM driver_finance.driver_bills b WHERE b.load_id = l.id)`,
   which is the true linkage. It remains the P0 money defect.
2. **`ON DELETE RESTRICT` is the database refusing to let a load be deleted while a bill points at
   it.** That is the WORM law enforced in the schema. It is also the reason the void must go through
   the UI in dependency order — invoice/bill/settlement line first, load last. A void routine that
   tries to remove the load first will hit this constraint and stop. That is the schema working
   correctly, not a defect.
3. Devin-A must **not** skip the `load_id` bill check during the void inventory. Any bill it did not
   find because it looked at `linked_work_order_uuid` instead is a bill that will still be pointing at
   a voided load afterward.

**Devin-A: re-run your pre-void inventory for all 10 loads using `driver_bills.load_id`, and post the
corrected bill counts before you void anything.** If your original table was built off the wrong
column, its bill counts are wrong and the void will leave orphans.

---

## Standing rule this produces

**RULE — EMPTY IS NOT EVIDENCE.**
Before publishing any "X does not exist / X has none / X is missing" claim about schema or code:
- Schema: read `pg_constraint` / `pg_attribute` / `pg_class`, never `information_schema` three-way
  joins alone. `information_schema` has produced a false empty twice in this session.
- Code: `grep -r` the whole app, not one file. A symbol declared in the file you read is not proof
  that no other file declares the thing you were looking for.
- Then state the query you ran, so the next reader can falsify it.

A negative claim gets the same evidence bar as a positive one. I have not been holding that bar.
