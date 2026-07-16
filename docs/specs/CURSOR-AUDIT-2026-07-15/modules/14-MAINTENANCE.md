# 14 — MAINTENANCE

**Verdict:** Feature-rich beyond design 10 tabs; WO financial links DEAD; Create Bill/Expense are OLD forks.

## Nav DRIFT
Flyout 11 (arch 10) · SUBNAV 15 (config 10) · Lists catalogs 10.

## Buttons
| Location | Actions |
|----------|---------|
| Home | + Create Bill, + Create Expense, + Create Work Order (types) |
| WO detail | Edit, Save (**no onClick — DEAD**), + Create Bill/Expense, PDF, Cancel, Void |
| Linked financials | `<a href=/accounting/bills?bill_id=>` — BillsPage ignores bill_id |
| Linked expenses | `?expense_id=` opens Expense **create** page |
| Parts | Create part, purchase, adjust |

## HAVE / WILL FAIL
**HAVE:** WO create; FK on create from WO; Parts dual door (B23 intentional).  
**WILL FAIL:** Click linked bill/expense from WO; Save header dead; Maintenance expense/bill without +Add.

## Professional recommendation
Use EntityLink `bill` → `/accounting/bills/:id`. Add expense detail. Wire Save or remove. Share Accounting forms into Maintenance modals/panels. Update Module 2 tab law to 15. Never delete dual parts doors — clarify labels.

## Deep button inventory (repo) — 2026-07-15

**Primary surfaces:** `MaintenanceHome.tsx` · `WorkOrderDetailPage.tsx` · `MAINTENANCE_NAV_CONFIG.ts` · parts dual door

### Nav counts (DRIFT)
| Control | File:line | Count | Status |
|---------|-----------|-------|--------|
| Sidebar flyout `MAINTENANCE_MODULE_NAV_LINKS` | `MAINTENANCE_NAV_CONFIG.ts:3-16` | **11** (incl. Position History) | DRIFT vs arch 10 |
| Dashboard operational tabs | `:32-43` | **10** | HAVE |
| Lists catalogs constant | `:52` | 10 | HAVE |
| Parts + Parts Inventory dual door | `:8` + `:41` | Intentional B23 | HAVE — KEEP |

### WO detail / home buttons
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| Home + Create Bill / + Create Expense | `MaintenanceHome.tsx:254-257` | Opens create flows | HAVE |
| WO Edit | `WorkOrderDetailPage.tsx:410-411` | Opens edit | HAVE |
| WO Save header | `WorkOrderDetailPage.tsx:413-415` | **No `onClick`** — disabled only by mismatch/id | DEAD |
| WO + Create Bill / + Create Expense | `:416-420` | Modals | HAVE |
| Linked bill `<a href=/accounting/bills?bill_id=>` | `:685` | Query deep-link | WILL FAIL |
| BillsPage reads `bill_id`? | `BillsPage.tsx:162-175` | Reads status/vendor_id — **never `bill_id`** | WILL FAIL |
| Linked expense `?expense_id=` | `WorkOrderDetailPage.tsx:713` | Lands create/list — expense EntityLink resolves **null** | WILL FAIL |
| EntityLink expense | `EntityLink.tsx:100-101` | `case "expense": return null` | WILL FAIL / MISSING detail |

### Top WILL FAIL (new evidence)
1. **WO Save header is dead** — button at `WorkOrderDetailPage.tsx:413-415` has no `onClick`.
2. **Linked bill from WO does not open that bill** — `?bill_id=` written (`:685`) but `BillsPage` never reads it (`:162-175`); should use `/accounting/bills/:id` EntityLink path.
3. **Linked expense cannot drill to a detail** — expense kind returns null (`EntityLink.tsx:100-101`); `?expense_id=` opens create surface.
