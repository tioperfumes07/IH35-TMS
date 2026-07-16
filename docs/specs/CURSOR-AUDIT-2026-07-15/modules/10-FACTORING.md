# 10 — FACTORING (FACT)

**Verdict:** Multi-homed (FACT / Accounting / Dispatch / Banking). Chargebacks lack EntityLinks despite IDs.

## Surfaces
| Home | Role |
|------|------|
| `/factoring` 7 tabs | Ops deep-dive |
| `/accounting/factoring` | Advances lifecycle + EntityLink |
| `/dispatch/factoring-queue` | Ops mirror — `?load=` BUG |
| Banking tiles | Exit ramps |

## HAVE / MISSING / WILL FAIL
**HAVE:** Advances CRUD; Faro import; Dispatch queue; reserve tracker.  
**MISSING:** EntityLinks on Recourse/Chargebacks/Statements; dispute/extend.  
**WILL FAIL:** Cannot click chargeback→advance; Factoring Queue load drawer won’t open (`load` vs `load_id`).

## Professional recommendation
Wire EntityLink `factoring_advance` on FACT tables. Fix Factoring Queue query. Keep all doors — add “canonical home” labels. Do not delete FACT.

## Deep button inventory (repo) — 2026-07-15

**Primary surfaces:** `factoring/FactoringHome.tsx` · `accounting/FactoringListPage.tsx` · `dispatch/FactoringQueuePage.tsx` · Banking forms

### Tabs / doors
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| FACT 7 tabs (Reserve/Recourse/Chargebacks/Statements/Faro/Equipment/Vendor merges) | `FactoringHome.tsx:40-48` | URL via `FACTORING_TAB_PATH` | HAVE |
| Accounting Factoring list/detail | `FactoringListPage` · `FactoringDetailPage` · EntityLink kind `factoring_advance` | Advances lifecycle | HAVE |
| Dispatch Factoring Queue | `FactoringQueuePage.tsx` · flyout `sidebar-config.ts:224` | Ops mirror | HAVE |
| Banking FactoringAdvanceForm / tiles | banking forms | Exit ramps | HAVE — KEEP |

### Buttons / tables
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| Chargebacks Export Selected | `ChargebacksTable.tsx:65-66` | CSV export | HAVE |
| Chargebacks Dispute (coming soon) | `ChargebacksTable.tsx:68-72` | `disabled` + toast | STUB |
| Recourse Extend (coming soon) | `RecoursePipelineTable.tsx:72-76` | `disabled` + toast | STUB |
| Chargebacks row advance id | `ChargebacksTable.tsx:90-97` | `factoring_advance_id` is row key only — **not rendered / not EntityLink** | WILL FAIL |
| Recourse invoice rows | `RecoursePipelineTable.tsx` | Shows invoice_reference text; advance id not linked | WILL FAIL / MISSING |
| Faro import controls | `FactoringHome.tsx` faro_imports tab (~578+) | Statement import | HAVE |
| Driver vendor merges EntityLink | `FactoringHome.tsx:887` | `EntityLink kind="driver"` | HAVE |
| Queue load link | `FactoringQueuePage.tsx:274-275` | `/dispatch?view=loads&load=${row.load_id}` | WILL FAIL |
| Dispatch reads `load_id` | `Dispatch.tsx:198` | `searchParams.get("load_id")` — ignores `load` | WILL FAIL pair |

### Top WILL FAIL (new evidence)
1. **Factoring Queue drawer never opens** — link uses `load=` (`FactoringQueuePage.tsx:275`); Dispatch only reads `load_id` (`Dispatch.tsx:198`).
2. **Chargeback → advance click-through impossible** — advance id present as `getRowId` but never shown as `EntityLink` (`ChargebacksTable.tsx:64,90-97`).
3. **Dispute / Extend are disabled stubs** — operators see actions that cannot run (`ChargebacksTable.tsx:68-72`, `RecoursePipelineTable.tsx:72-76`).
