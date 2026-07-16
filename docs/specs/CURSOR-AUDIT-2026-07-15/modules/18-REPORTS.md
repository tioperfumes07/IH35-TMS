# 18 — REPORTS

**Verdict:** Reports hub is substantially larger than MODULE 13’s 12 tabs — category hover nav, Phase 6 runners, audit pack, scheduled/custom builders exist — but sidebar flyout only exposes 3 links, and inventing “+ Custom report” without full SQL trust controls needs CPA/auditor caution.

## Live evidence notes
**REPO-ONLY.**
- Sidebar REPORTS → `/reports` (`sidebar-config.ts` L119); flyout L303–308: Reports Home, Trip Profitability, Late Arrival only
- Hub: `apps/frontend/src/pages/reports/ReportsHome.tsx`
- Subnav: `ReportsSubNav.tsx` — Reports / Category hub / Run report▾ / Cancellations / Scheduled (custom) / Audit▾
- Arch MODULE 13: `IH35_ARCHITECTURAL_DESIGN.md` L691–720
- Many dedicated routes under `/reports/*` in `manifest.tsx` (~L2844+)

## Surface / button inventory

| Surface | Control | Route/behavior | Status |
|---------|---------|----------------|--------|
| Sidebar REPORTS | Nav | `/reports` | HAVE |
| Sidebar flyout | Trip Profitability / Late Arrival | Dedicated routes | HAVE / DRIFT (orphans dozens of reports) |
| `/reports` header | **+ Custom report** | Toggles `CustomReportBuilder` | HAVE / DRIFT vocab (design: + Create Custom Report) |
| `/reports` header | **Schedule** | `/reports/scheduled` | HAVE |
| `/reports` | BasisSelector | Accrual/cash on allowed pages | HAVE (Block-20.2) |
| `/reports` | CategoryHoverNav | Domain categories | HAVE |
| `/reports` KPI strip | Available / Scheduled / Run 7d / IFTA due | `getKpiSummary` | HAVE (≠ design 5 cards) |
| `/reports` | FrequentlyRunTable | Run → dedicated or `/reports/run/:id` | HAVE |
| `/reports` | IftaPreparerCard / ScheduledReportsPanel | | HAVE |
| Subnav | Category hub | `/reports/hub` + `/reports/categories/*` | HAVE |
| Subnav Run report | Trial balance, P&L, Balance sheet, Cash flow stmt/overview, Settlement summary, Customer/Lane profitability, Profit/truck, Fuel recon, Maint cost/unit, Geofence dwell, Deadhead, Scheduled | Phase 6 hrefs | HAVE (many) |
| Subnav | Cancellations | `/reports/cancellations` | HAVE |
| Subnav | Scheduled (custom) | `/reports/scheduled-custom` | HAVE |
| Subnav Audit | 7 audit reports | `/reports/audit/*` | HAVE |
| Aging | AR/AP aging | `/reports/ar-aging`, `/reports/ap-aging` | HAVE |
| Finance overlap | Cash flow statement/overview also under Finance | Dual doors | DRIFT (keep both; clarify) |
| Design Settings tab | Default ranges / export / email | Design L717 | MISSING as dedicated Settings tab |
| Stub path | Frequently-run `status==="stub"` | Toast defer (e.g. detention) | HONEST defer |

## Connectivity to money/ops
- Financial reports use basis selector; cash-basis locked to BS/TB/P&L/home per Block-20.2.
- DispatchMargin / Lane / Geofence reports use EntityLink (load/unit/driver) — good pattern.
- Customer profitability deep-links from Customer Detail.
- AR/AP aging EntityLinks invoices (Finance ArApAgingPage).

## HAVE / MISSING / DRIFT / WILL FAIL
**HAVE:** Large runner inventory; audit pack; custom builder toggle; scheduled reports; IFTA status KPI; category hubs.
**MISSING:** Design Settings tab; design KPI set (Top Lane/Customer/Driver); flyout completeness.
**DRIFT:** Flyout 3 items vs dozens of routes; MODULE 13 tab names ≠ HoverDropdownNav grammar; “+ Custom report” wording.
**WILL FAIL:** Operators using only sidebar flyout never discover P&L/IFTA/audit; training “Reports → P&L Summary tab” mismatches UI.

## Professional recommendation
Expand REPORTS flyout to match `REPORTS_SUB_NAV_ITEMS` (or “See all” → hub) — additive, no deletion. Update MODULE 13 arch design to the shipped hover-nav model. Keep Custom Report Builder but gate destructive/SQL-class exports behind Owner + audit. Ensure every money report row uses EntityLink (invoice/bill/load/unit/driver) — no plain UUID cells.

## Deep button inventory (repo) — finish pass 2026-07-15

**Evidence root:** `apps/frontend/src/pages/reports/` · sidebar `sidebar-config.ts:119,303-307`

### Sidebar / entry
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| Sidebar REPORTS | `sidebar-config.ts:119` | `/reports` | HAVE |
| Flyout (3 only) | `sidebar-config.ts:303-307` | Reports Home / Trip Profitability / Late Arrival | DRIFT (orphans dozens of runners) |

### Reports Home primary CTAs
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| **+ Custom report** | `ReportsHome.tsx:134` | Toggles `CustomReportBuilder` | HAVE / DRIFT vocab (not “+ Create Custom Report”) |
| **Schedule** | `ReportsHome.tsx:135-137` | `navigate("/reports/scheduled")` | HAVE |
| Frequently-run stub | `ReportsHome.tsx:112-116` | `status==="stub"` → toast (e.g. detention-claims) | STUB (honest defer) |
| Phase 6 quick tiles | `ReportsHome.tsx:181-185` | `navigate(PHASE_6_REPORT_HREFS[id])` | HAVE |
| Management pack tiles | `ReportsHome.tsx:210-214` | `/reports/management?type=` | HAVE |
| KPI strip | `ReportsHome.tsx:90-91,75` | Available / Scheduled via `getKpiSummary` | HAVE |
| CategoryHoverNav | `ReportsHome.tsx:142` | Domain categories | HAVE |
| BasisSelector | Block-20.2 pages (BS/TB/P&L/home) | Accrual/cash | HAVE |

### Subnav (full inventory vs flyout)
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| REPORTS_SUB_NAV_ITEMS | `ReportsSubNav.tsx:62-68` | Reports / Category hub / Run report▾ / Cancellations / Scheduled (custom) / Audit▾ | HAVE |
| Run report children | `ReportsSubNav.tsx:10-24,35-46` | Trial balance … Deadhead + scheduled | HAVE |
| Audit children (7) | `ReportsSubNav.tsx:53-59` | `/reports/audit/*` | HAVE |
| Design Settings tab | Not in `REPORTS_SUB_NAV_ITEMS` | Default ranges / export / email | MISSING |

### Dual doors (keep all)
| Surface | File:line | Status |
|---------|-----------|--------|
| Cash flow statement/overview under Reports | `ReportsSubNav.tsx:14-15` | DRIFT vs `/cash-flow` + Finance statements — KEEP |
| AR/AP aging | `/reports/ar-aging`, `/reports/ap-aging` | HAVE |

### Top WILL FAIL (new evidence)
1. **Flyout-only operators never reach P&L / IFTA / Audit** — flyout `sidebar-config.ts:303-307` vs full `ReportsSubNav.tsx:62-68`.
2. **Stub frequently-run rows look runnable** until click — `ReportsHome.tsx:112-116` toast-only.
3. **Training “Reports → Settings tab” fails** — no Settings in subnav.

**Never delete** Reports routes, Category hub, Audit pack, or Custom builder — expand flyout / arch design only.
