# 13 — SAFETY

**Verdict:** 28-tab shell real; flyout only 5; accident money fields cosmetic; fines lack drill-through.

## Tabs
28 canonical in SAFETY_GROUPS (9 groups) + Cert Expiry alias. Flyout: Driver Files, DOT Compliance, DOT Inspections, CSA Mitigation (orphan), Anomaly Alerts (orphan).

## Critical WILL FAIL
- Accident drawer: Insurance Claim #, Bill/Expense #, police/3rd party, cost lines, Record/Service Type — **look editable, not saved**.  
- Spawn WO/Liability — **no EntityLink**.  
- Fine liability UUID — **no click-through**.  
- Fine bank payment id — dead text.  
- Group stub URLs → ComingSoon while real tabs exist elsewhere.

## Insurance nested
Policies / Type Catalog / Coverage Gaps / Claims / Lawsuits under `/safety/insurance`. Cargo Claims tab ≠ insurance.claims (intentional split — document).

## Professional recommendation
Persist or remove cosmetic fields (honesty). EntityLink liability/WO/claim. Expand flyout or accept in-module-only (document). Update arch 27→28. Never delete orphan live pages — add to groups or document.

## Deep button inventory (repo) — 2026-07-15

**Primary surfaces:** `SAFETY_TABS_CONFIG.ts` · `SafetyLayout.tsx` · `AccidentReportDrawer.tsx` · fines drawers · Insurance nested

### Tabs / flyout
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| SAFETY_GROUPS (9 groups, 28 in-group tabs + cert-expiry alias → 29) | `SAFETY_TABS_CONFIG.ts:18-97` | In-module nav | HAVE |
| Sidebar Safety flyout (5) | `sidebar-config.ts:182-189` | Driver Files, DOT Compliance, DOT Inspections, CSA Mitigation, Anomaly Alerts | DRIFT (thin) |
| CSA Mitigation / Anomaly Alerts in flyout | `:187-188` | Live routes; may be outside primary groups labeling | DRIFT / orphan flyout |
| Insurance nested under Safety | `InsuranceTab.tsx` · route `/safety/insurance` | Nested 6 surfaces | HAVE |
| Permits (2290 SoR) | `SAFETY_TABS_CONFIG.ts:78` | `/safety/permits` | HAVE |

### Accident drawer (cosmetic WILL FAIL)
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| Record Type / Service Type | `AccidentReportDrawer.tsx:209-228` | Fixed value + `onChange={() => {}}` | WILL FAIL (cosmetic) |
| Police / Insurance Claim / Bill-Expense / 3rd party / plate / vendor invoice | `:323-347` | Uncontrolled inputs — **not in save payload** | WILL FAIL |
| Location | `:342-343` | `defaultValue` only — not controlled/saved | WILL FAIL |
| Cost lines editor | `:434` | `TwoSectionLineEditor` local state | UNVERIFIED persist |
| Save | `:360` | Persists wired fields (dates/driver/unit/etc.) | HAVE (partial) |
| Driver/Unit/Load/Vendor pickers | `:249-288` | Persist | HAVE |

### Fines / spawn
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| Convert to Driver Liability | `FineDetailDrawer.tsx:100-106` | Creates liability | HAVE |
| Converted liability id | `:86` | Plain text UUID | WILL FAIL |
| Internal fines Liability column | `InternalFinesPage.tsx:129` | `String(driver_liability_id)` | WILL FAIL |
| Bank payment id | `FinePaymentLinkBanner.tsx:12-15` | Text UUID — no `/banking` link | DEAD |
| DOT Inspections spawned WO | `DOTInspectionsTab.tsx:85` | `EntityLink kind="work_order"` | HAVE |
| DotInspectionsPage spawned WO | `DotInspectionsPage.tsx:61` | Plain string | DRIFT |

### Top WILL FAIL (new evidence)
1. **Accident money/claim fields look editable but do not save** — uncontrolled inputs at `AccidentReportDrawer.tsx:323-347`; Record/Service Type no-ops `:216-228`.
2. **Fine→liability has no drill-through** — UUID text only (`FineDetailDrawer.tsx:86`).
3. **Fine bank payment is dead text** — `FinePaymentLinkBanner.tsx:13` never links a transaction.
