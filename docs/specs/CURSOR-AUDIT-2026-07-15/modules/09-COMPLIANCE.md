# 09 — COMPLIANCE

**Verdict:** Live top-level dashboard; design still Safety addendum; tabs not deep-linkable; 2290 SoR is Safety Permits.

## Tabs (client state, not URL)
Filings & Compliance Due · Overview · HOS Tracker · HOS Viewer · Violations · HOS History · Required Documents (+ property-tax routes).

## HAVE / MISSING / WILL FAIL
**HAVE:** Filings rollup; fleet/driver drill-through; property-tax; rules (weak prompt UX).  
**MISSING:** URL-per-tab; Required Docs links; create filing.  
**DRIFT:** Dual HOS with Safety; Form 2290 under Safety Permits.  
**WILL FAIL:** Bookmark specific tab; treat Compliance as 2290 SoR.

## Professional recommendation
Add URL query/tab routes. Cross-link Safety Permits as SoR for 2290. Keep top-level module (never delete) — update architectural design to match live.

## Deep button inventory (repo) — 2026-07-15

**Primary surface:** `apps/frontend/src/pages/compliance/ComplianceDashboardPage.tsx`

### Tabs (client state — not URL)
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| Filings & Compliance Due (default) | `ComplianceDashboardPage.tsx:36-45,71,146-151` | `useState("filings")` — **no `useSearchParams`** | WILL FAIL bookmark |
| Overview / HOS Tracker / HOS Viewer / Violations / HOS History / Required Documents | `:37-45,132-143` | `setTab(t.id)` local only | WILL FAIL deep-link |
| Violations tab | `:165-170` | Reuses `HOSViolationsTab` from Safety | DRIFT (dual HOS — KEEP) |
| Required Documents | `:177-180` · `RequiredDocumentsSection.tsx:103` | Create rule UI toggle | HAVE (rules) |
| Filings rollup | `FilingsComplianceDueSection` | Cross-module due | HAVE |
| Property-tax routes | Linked from filings (module org) | Separate routes exist | HAVE / UNVERIFIED all paths |
| Form 2290 SoR | Not under Compliance tabs | Lives Safety Permits (`SAFETY_TABS_CONFIG.ts:78`) | DRIFT |
| Create filing CTA | Not found on dashboard header this pass | | MISSING / UNVERIFIED |

### Primary buttons
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| Tab buttons | `ComplianceDashboardPage.tsx:132-143` | Local state | HAVE surface |
| Export CSV (overview) | `:47-61` | Client download | HAVE |
| Create/archive compliance rules | `:97-113` | Mutations | HAVE |
| Required Docs entity toggles | `RequiredDocumentsSection.tsx:103+` | Create document-type UI | HAVE |
| Drill links to Safety Permits / 2290 | Not found as labeled SoR cross-link | | MISSING |

### Top WILL FAIL (new evidence)
1. **Cannot bookmark a Compliance tab** — tabs are `useState` only (`ComplianceDashboardPage.tsx:71`); refresh returns to Filings.
2. **Treating Compliance as Form 2290 SoR fails** — 2290/permits live under Safety (`SAFETY_TABS_CONFIG.ts:78`).
3. **Shareable HOS Violations deep-link from Compliance is impossible** — same client-tab limitation; Safety has its own `/safety/hos-violations` route.

### Additional explorer evidence
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| Form 2290 generate/list fetch | `Form2290Filings.tsx:9-23` (Safety Permits host) | Raw relative `fetch` — may miss `resolveApiUrl` / credentials path | WILL FAIL |
| Filings Open → 2290 | `FilingsComplianceDueSection.tsx:99-103` | Drill to `/safety/permits` | HAVE (SoR cross-door) |
