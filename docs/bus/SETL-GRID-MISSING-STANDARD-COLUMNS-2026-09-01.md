# FINDING — SETTLEMENTS GRID HAS NO STANDARD COLUMNS · 2026-09-01 02:20Z
Owner reported it. **Verified in code. He is right, and it is worse than a missing column.**

## THE DEFECT
`apps/frontend/src/pages/driver-finance/SettlementsPage.tsx` — the page titled **"Driver Settlements"** —
**has no settlement grid at all.** The only `DataTable` with defined columns on that page is
**Open Driver Bills** (`openDriverBillColumns`, keyed on `load_number`).

That is exactly what the owner is seeing: he opens Settlements, and the table in front of him is a
**driver-bills** table showing a **load number** — because no settlements table with settlement
columns was ever built.

`period_end` appears in that file **only twice**, both inside KPI filters (`isInThisPeriod`,
`isYtd`). It is never rendered as a column. `display_id` and `period_start` are not rendered anywhere.

**The data exists.** `driver_finance.driver_settlements` carries `display_id`, `period_start`,
`period_end`, `status`, `gross_pay`, `deductions_total`, `net_pay`, `paid_at`, `driver_id`.
**Nothing surfaces them.**

## OWNER LAW — these columns are a GLOBAL STANDARD, not one page's preference
> *"there is no date columns, beg and end date, and there is no settlement number column — this was
> standard and systemwide, global."*
> *"remember the settlements are all the loads related to a settlement."*

**Required on the settlements grid, and on every settlement surface in the app:**
| column | source |
|---|---|
| **Settlement #** | `display_id` |
| **Period Begin** | `period_start` |
| **Period End** | `period_end` |
| Driver | `driver_id` → driver name |
| Status / payment state | `status`, `payment_state` |
| Gross · Deductions · Net | `gross_pay`, `deductions_total`, `net_pay` |
| Paid date | `paid_at` |

**And the settlement's relationship to loads is one-to-MANY.** A settlement is *all the loads that
belong to it* — so the settlement row is the parent and loads are its children (drill-down or an
expandable row), **never a load number standing in place of a settlement number.** Today the app has
that backwards on this page.

**Scope: SYSTEMWIDE.** Wherever a settlement is listed — settlements page, driver detail, payroll,
reports, exports — settlement number and period begin/end are mandatory columns. Sweep them all;
do not fix one page.

**Guard + selftest, NAMED IN A WORKFLOW:** any settlement list surface must render `display_id`,
`period_start` and `period_end`. Fail the build if a settlement grid ships without them.
**Owner: CASCADE** (UI sweep lane) with CC-1 on the settlement query. **CC-2 grades.**

## ⛔ ANSWER TO "have the test transactions been voided?" — NO. NOTHING IS VOIDED.
The void list (**#18932**) is **published and merged. It has NOT been executed.** All **421** sample
rows are still live: 43 loads · 39 invoices · 28 settlements · 311 journal entries.
It is correctly held behind CC-2's **P-A + P-B**, per the sequence the owner approved. Nobody has
run it and nobody should until CC-2 reports green.

## ⛔ CORRECTION — I called the duplicate FKs "cosmetic". They are not.
`tenant_id` and `unit_id` on `mdata.assets` each carry **two identical foreign keys**. That is a
real defect, not cosmetics:
1. **Every INSERT/UPDATE runs the same referential check twice** — doubled write cost on a hot table.
2. **Schema diffs and future migrations become ambiguous** — a migration dropping "the" FK may drop
   one and silently leave the other, or fail outright.
3. **It is evidence of the exact hygiene failure this board keeps hitting**: a migration that added
   a constraint without first checking whether it already existed. Same family as "blocked on schema"
   when the schema was already there.
**Still lower priority than the driver-account backfill — but it is a defect and it gets filed and
fixed, not shrugged off.**
