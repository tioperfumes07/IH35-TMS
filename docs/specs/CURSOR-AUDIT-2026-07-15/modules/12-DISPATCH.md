# 12 — DISPATCH

**Verdict:** Wide ops surface; not yet McLeod/Alvys command-center grade. Critical URL bugs.

## Live/repo critical WILL FAIL
1. Factoring Queue uses `?load=` — drawer needs `load_id` → **drawer never opens**.  
2. Planning “Reserve a Load” → `?book_load=1` — **Dispatch.tsx never opens modal**.  
3. Settlements secondary tab = stub quick-link only.  
4. Customs tab = stub.  
5. MapView = card list not map.  
6. In-Transit Issues: no Promote-to-WO; UUID create UX.

## Nav layers (DRIFT)
Sidebar flyout ~25 · DispatchSubnav queues · SecondaryNav 5 tabs — three chromes.

## Button inventory (major)
| Area | Buttons / actions |
|------|-------------------|
| Home | Overview/Kanban/List/Round Trips, + Book Load |
| Board | Export, Quick Assign, bulk status, pre-settlement |
| Drawer | Edit, Reassign, Create/View Invoice, Factoring approve, Spawn tabs… |
| Book Load modal | Full wizard V4 |
| Detention | Sync, Stop accrual, Bridge billing, Notify |
| OCR | Convert to load |
| POD | Approve/Reject, BOL PDF |
| Equipment transfers | New transfer (UUID modal) |

## HAVE
Book→assign→invoice→FARO path; HOS/OOS gates; Trip Pairing; exception queues breadth.

## Professional recommendation
Fix two URL bugs immediately (correct, not patch). Add EntityLink on queues. Promote Customs/WO. Real map or honest rename. Keep additive queues — unify chrome with persistent subnav on queue pages.

## Deep button inventory (repo) — 2026-07-15

**Primary surfaces:** `Dispatch.tsx` · `dispatch/*` · `components/dispatch/DispatchSubnav.tsx` · `sidebar-config.ts` flyout

### Nav chromes (DRIFT)
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| Sidebar flyout (~25 links) | `sidebar-config.ts:201-228` | Queues + planners + factoring | HAVE |
| Secondary tabs Load board / Book load / Assignments / Settlements / Pre-settlements | `Dispatch.tsx:41-48` | Path-based subTab | HAVE |
| Settlements secondary content | `Dispatch.tsx:487-497` | Quick-link stub only | STUB / DRIFT |
| Subnav “Reserve a Load” | `DispatchSubnav.tsx:43,102-105` | `href=/dispatch?book_load=1` | WILL FAIL |
| Dispatch reads `book_load` | `Dispatch.tsx` — **no** `get("book_load")` | Modal only via local `newLoadOpen` | WILL FAIL |

### Critical URL / drawer bugs
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| Open load drawer | `Dispatch.tsx:198` | `searchParams.get("load_id")` | HAVE |
| Factoring Queue load link | `FactoringQueuePage.tsx:274-275` | `?load=` not `load_id` | WILL FAIL |
| At-Risk / Late / Detention links | e.g. `AtRiskQueuePage.tsx:42` | Correct `load_id` | HAVE |

### Buttons / views
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| + Book Load / BookLoadModalV4 | `Dispatch.tsx:116` · `BookLoadModalV4.tsx` | Modal wizard | HAVE |
| MapView | `MapView.tsx:19-47` | **Card grid of lat/lng** — not a map | DRIFT / WILL FAIL naming |
| In-Transit Issues create | `InTransitIssuesPage.tsx:39` | Requires `load_id` trim — UUID UX | DRIFT |
| Promote-to-WO on In-Transit Issues | Grep page: **none** | | MISSING |
| OCR Convert to load | `OcrQueuePage.tsx:53` | Prefill book_load | HAVE |
| POD Approve/Reject | `PodReviewPage.tsx` | Review actions | HAVE |
| Equipment transfers | flyout → `/dispatch/equipment-transfers` | Transfer UI | HAVE / UNVERIFIED modal quality |
| Customs dedicated tab | Not a secondary tab; border history has CustomsTimePill | | STUB / MISSING as tab |

### Top WILL FAIL (new evidence)
1. **Reserve a Load URL never opens Book modal** — Subnav `book_load=1` (`DispatchSubnav.tsx:43`) unread by `Dispatch.tsx`.
2. **Factoring Queue load click fails to open drawer** — `load=` vs `load_id` (`FactoringQueuePage.tsx:275` vs `Dispatch.tsx:198`).
3. **“Active Load Map” is not a map** — `MapView.tsx:34-47` renders buttons/cards only.

### Additional explorer evidence
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| MapView pin buttons | `MapView.tsx:36-44` | `<button>` with **no** `onClick` | DEAD |
| Subnav “Live Map” vs Map route | Subnav → geofencing; `/dispatch/map` separate | DRIFT |
| Drawer Customs tab | `CustomsTab.tsx:3-8` | Explicit stub UI | STUB |
