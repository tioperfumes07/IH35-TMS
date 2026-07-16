# 08 — INVENTORY

**Verdict:** Dual door with Maintenance parts; Assignments tab is a false surface (identical to Purchases).

## Surfaces
| Tab | Route | Truth |
|-----|-------|-------|
| Parts & Stock | `/inventory` | ParityTable stock |
| Assignments | `/inventory/assignments` | === Purchases page |
| Purchase History | `/inventory/purchases` | Stock list, not ledger |
| Maint Parts | `/maintenance/parts` | CRUD |
| Maint Parts Inventory | `/maintenance/parts-inventory` | Operational |

## HAVE / MISSING / WILL FAIL
**HAVE:** Create part; record purchase/adjust; WO consume API; WO→Create Bill path on Maint.  
**MISSING:** Vendor on purchase; Inventory→WO/bill EntityLinks; real assignment trail.  
**WILL FAIL:** Operators believe Assignments/History are distinct ledgers.

## Professional recommendation
Keep both doors (never delete). Make Assignments a real assignment ledger OR relabel and add purchase timeline. Add vendor picker + reverse links.

## Deep button inventory (repo) — 2026-07-15

**Primary surfaces:** `apps/frontend/src/pages/inventory/*` · dual door `maintenance/parts*` · `PartsInventoryTable`

### Tabs
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| Parts & Stock / Assignments / Purchase History | `InventoryModuleTabs.tsx:3-7,20-34` | Navigates 3 routes | HAVE (chrome) |
| Assignments page body | `InventoryAssignmentsPage.tsx:8-28` | `listPartsInventory` + `PartsInventoryTable` | WILL FAIL (false ledger) |
| Purchase History page body | `InventoryPurchasesPage.tsx:8-28` | **Identical** data source + table as Assignments | WILL FAIL (false ledger) |
| Parts & Stock | `InventoryPartsStockPage.tsx:82+` | Maps maintenance parts → stock rows | HAVE |

### Buttons / dual doors
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| Part create drawer | `PartCreateDrawer.tsx:14` | Create part | HAVE |
| Maint Parts | `MAINTENANCE_NAV_CONFIG.ts:8` → `/maintenance/parts` | CRUD catalog door | HAVE — KEEP |
| Maint Parts Inventory | `MAINTENANCE_DASHBOARD_TAB_LINKS:41` → `/maintenance/parts-inventory` | Operational inventory | HAVE — KEEP |
| EntityLink to WO/bill from Inventory | Grep `pages/inventory`: **zero** `EntityLink` | No drill-through | MISSING |
| Vendor on purchase (Inventory tabs) | Assignments/Purchases reuse stock table only | No purchase ledger UI | MISSING |

### Top WILL FAIL (new evidence)
1. **Assignments === Purchases** — both files are the same `listPartsInventory` + `PartsInventoryTable` pattern (`InventoryAssignmentsPage.tsx` / `InventoryPurchasesPage.tsx` lines 8–28).
2. **Operators believe they have an assignment trail / purchase ledger** — labels differ; data does not.
3. **No EntityLink anywhere under `pages/inventory`** — reverse/forward connectivity dead on this door.

### Additional explorer evidence
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| Parts & Stock list fetch | `InventoryPartsStockPage.tsx:90-95` | Raw `fetch` **without** `credentials: "include"` (unlike `apiRequest`) | WILL FAIL (401 risk) |
| Purchase form vendor_id | `PartsInventoryTable.tsx:96-105` vs API accepts `vendor_id` | UI never collects vendor | MISSING |
