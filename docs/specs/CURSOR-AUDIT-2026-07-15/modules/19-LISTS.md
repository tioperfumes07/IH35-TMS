# 19 — LISTS

**Verdict:** Lists is a large domain catalog mega-hub (Accounting CoA/Items/Classes, Safety, Maintenance, Fuel, Fleet, Drivers, Names Master) far beyond MODULE 12’s 12 named tabs — mostly HAVE routes + Create on accounting catalogs; Names Master and some names catalogs still `live: false`.

## Live evidence notes
**REPO-ONLY.**
- Sidebar LISTS → `/lists` (L118); flyout L229–234: Lists & Catalogs, Names Master, Maintenance Services
- Hub: `ListsHubPage.tsx` + `ListsSubNav.tsx` + `DOMAIN_CONFIG` in `AllCatalogsMap.tsx`
- Dozens of routes in manifest L2043–2706
- Arch MODULE 12: L658–687 (12 tabs) — DRIFT vs domain map

## Surface / button inventory

| Surface | Control | Route/behavior | Status |
|---------|---------|----------------|--------|
| Sidebar LISTS | Nav | `/lists` | HAVE |
| Flyout | Names Master / Maint Services Catalog | `/lists/names`, `/lists/maintenance/services-catalog` | HAVE |
| Hub | DomainRibbon + AllCatalogsMap | Click → `buildCatalogPath` | HAVE |
| Hub | RecentActivityCard | | HAVE |
| Hub | QboSyncHealthCard **Force sync** | `postForceListsQboSync` | HAVE (Owner-sensitive) |
| Subnav | Lists & Catalogs / Names Master / Catalog Index | | HAVE |
| Subnav | Catalog domains▾ | `/lists/{safety,maintenance,dispatch,fuel,drivers,fleet,accounting,names_master}` | HAVE |
| Subnav | Safety catalogs (partial) | 3 of 6 safety catalogs in subnav | DRIFT (others via map only) |
| Subnav | Parts Catalog | `/lists/maintenance/parts-catalog` | HAVE |
| Accounting | Chart of Accounts **+ Create** | `ChartOfAccountsListPage` AccountDrawer | HAVE |
| Accounting | Items **+ Create** | `ItemsListPage` / ItemEditorModal | HAVE |
| Accounting | Classes / Payment Terms / etc. | `AccountingCatalogListPage` **+ Create** | HAVE |
| Accounting | Detail Types **+ Create** | | HAVE |
| Accounting | Void/Cancel Reasons **+ Create Entry** | | HAVE |
| Accounting | Account Role Bindings | Read-only v1 per DOMAIN_CONFIG | HAVE (read) |
| Accounting | Posting Templates | Route live | HAVE |
| Names Master | Brokers | live:true | HAVE |
| Names Master | Shippers / Consignees / Lenders / Insurance Carriers | `live: false` | MISSING |
| Design tabs | Driver Pay Codes, Locations, Border Routing, Customer Quality Flags, Settings | Design L669–684 | DRIFT — redistributed into domains / some renamed |

## Connectivity to money/ops
- CoA / Items / Payment Terms / Expense Categories / Account Role Bindings are the GL spine (ARCHITECTURE-BLUEPRINT §5).
- Maintenance vendors catalog links to `/maintenance/vendors` (not mdata.vendors).
- QBO sync health is read + force-sync trigger; parallel-books law = no TMS→QBO write-back for books (push flags OFF) — sync UI must not imply write-back of journals.

## HAVE / MISSING / DRIFT / WILL FAIL
**HAVE:** Domain mega-map; CoA/Items/Classes create; force QBO sync control; inventory/activity cards; services catalog flyout.
**MISSING:** Names Master non-broker catalogs; design Settings tab; Locations / Border Routing Profiles as called out in MODULE 12 (verify if relocated).
**DRIFT:** MODULE 12 “12 tabs” ≠ 8 domains × many catalogs; flyout under-represents accounting CoA.
**WILL FAIL:** Training from MODULE 12 tab names (“Driver Pay Codes” as top tab) won’t find that label — it’s under Drivers domain as Pay Rate Templates / Pay Types.

## Professional recommendation
Treat Lists hub as canonical; rewrite MODULE 12 to domain map (Rule 05 same-commit). Add Accounting CoA + Items to sidebar flyout (additive). Finish Names Master live catalogs or mark HOLD with tracker. Never delete a catalog route because it looks redundant with Accounting module — Lists is the master-data door; Accounting consumes it.

## Deep button inventory (repo) — finish pass 2026-07-15

**Evidence root:** `apps/frontend/src/pages/lists/` · sidebar `sidebar-config.ts:118,229-233`

### Hub / sync
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| Sidebar LISTS | `sidebar-config.ts:118` | `/lists` | HAVE |
| Flyout | `sidebar-config.ts:229-233` | Hub / Names Master / Maint Services | DRIFT (under-represents CoA) |
| Force QBO Sync | `QboSyncHealthCard.tsx:22-23` · wired `ListsHubPage.tsx:59-62` | `postForceListsQboSync` | HAVE (Owner-sensitive) |
| DomainRibbon + AllCatalogsMap | `ListsHubPage.tsx` + `AllCatalogsMap.tsx` | `buildCatalogPath` | HAVE |
| RecentActivityCard | `ListsHubPage.tsx` | Recent catalog activity | HAVE |
| `?domain=` deep scroll | `ListsHubPage.tsx:65-74` | Scroll to domain section | HAVE |

### Subnav
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| LISTS_SUB_NAV_ITEMS | `ListsSubNav.tsx:21-43` | Hub / Names / Catalog Index / domains / Safety (3) / Parts | HAVE / DRIFT (safety partial) |
| Safety catalogs in subnav | `ListsSubNav.tsx:33-37` | Internal Fine / Civil Fine / Company Violation only | DRIFT (others via map) |

### Create CTAs (sample — accounting spine)
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| CoA **+ Create** | `ChartOfAccountsListPage.tsx:381` → `AccountDrawer` | HAVE |
| Items **+ Create** | `ItemsListPage.tsx:160` | HAVE |
| Accounting catalogs **+ Create** | `AccountingCatalogListPage.tsx:103` | HAVE |
| Detail Types **+ Create** | `DetailTypesListPage.tsx:74` | HAVE |
| Void/Cancel **+ Create Entry** | `VoidCancelReasonsListPage.tsx:142` | HAVE |
| DomainFlyout **+ Create new catalog** | `DomainFlyout.tsx:28` | HAVE |

### Names Master live flags
| Catalog | File:line | Status |
|---------|-----------|--------|
| Brokers | `AllCatalogsMap.tsx:148` `live: true` | HAVE |
| Shippers / Consignees / Lenders / Insurance Carriers | `AllCatalogsMap.tsx:146-150` `live: false` | MISSING / STUB |

### Top WILL FAIL (new evidence)
1. **MODULE 12 “Driver Pay Codes” as top tab** — redistributed under Drivers domain; training from design tab list fails.
2. **Clicking non-live Names Master tiles** — `live: false` catalogs (`AllCatalogsMap.tsx:146-150`).
3. **Force sync mistaken for TMS→QBO journal write-back** — parallel-books law; UI is master sync trigger only.

**Never delete** any Lists catalog route or Maintenance vendors catalog — Lists is the master-data door.
