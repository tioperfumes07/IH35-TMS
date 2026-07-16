# 22 — DRIVERS (PROFILE MODULE — separate from Settlements sidebar)

**Verdict:** Drivers module is a real 9-subnav ops+pay surface with + Create Driver and EntityLinks; Settlements also has a separate sidebar item (`/driver-finance/settlements`) — both must stay. KPI On Loads/Available are intentionally dead clicks. Flyout still advertises `?subtab=` while code redirects to path-based subtabs.

## Live evidence notes
**REPO-ONLY.**
- Sidebar DRIVER PROFILE → `/drivers` (L101); SETTLEMENTS → `/driver-finance/settlements` (L126) — separate
- Flyout L190–199 includes Profiles/Settlements/Cash Advances/…/Applicants + legacy `?subtab=` URLs
- Canonical subnav: `DRIVERS_TABS_CONFIG.ts` — 9 tabs; paths `/drivers`, `/drivers/profiles`, … `/drivers/leave`
- Page: `Drivers.tsx`; disputes route exists via `DriversSubtabRoute` but **disputes not in DRIVERS_SUBNAV array**
- Arch MODULE 7: L420–457
- Blueprint: driver = 1099; settlements = Bill+BillPayment

## Surface / button inventory

| Surface | Control | Route/behavior | Status |
|---------|---------|----------------|--------|
| Sidebar DRIVER PROFILE | Nav | `/drivers` | HAVE |
| Sidebar SETTLEMENTS | Nav | `/driver-finance/settlements` | HAVE (separate — keep) |
| Flyout | Drivers Home / Profiles / Settlements / Cash Advances / Requests / Permits / Messages / Applicants | Mixed path + `?subtab=` | DRIFT (subtab redirected) |
| `/drivers` header | **+ Create Driver** | Opens create flow | HAVE |
| `/drivers` header | Refresh | Invalidate queries | HAVE |
| KPI strip | Active / On Leave / Settle Due / Drivers Owe / Escrow | Drill URLs | HAVE |
| KPI strip | On Loads / Available | No `to` | WILL FAIL (dead — intentional B10) |
| Subnav (9) | Drivers, Profiles, Settlements▾, Pre-settlements, Cash advances, Permits, Pay rate templates, Deductions, Leave | Path-synced | HAVE |
| Teams UI | **+ Create Team** | When teams tab active | HAVE (teams mode gated by `activeTab` state — verify discoverability) |
| Roster | Row → `/drivers/:id` | EntityLink in places | HAVE |
| Cash advance requests link | `DriversCashAdvanceRequestsLink` | `/driver-finance/cash-advance-requests` | HAVE |
| Disputes | `/drivers/disputes` route | Not in DRIVERS_SUBNAV | DRIFT / MISSING from subnav |
| Messages / Applicants | Flyout only | `/drivers/messages`, `/drivers/applicants` | HAVE routes (verify pages) |
| Onboarding | `/drivers` create → wizard pages | OnboardingWizardPage | HAVE |

## Connectivity to money/ops
- Settlements / cash advances / deductions / escrow KPI → driver finance + banking escrow.
- EntityLink driver used heavily in Drivers.tsx and settlements tables.
- Blueprint: each driver should auto-provision cash-advance asset + escrow liability accounts — verify hire path wires ids (ARCHITECTURE-BLUEPRINT §4).
- Drivers as AP vendors for settlement bills — do not confuse with shop vendors module.

## HAVE / MISSING / DRIFT / WILL FAIL
**HAVE:** + Create Driver; 9 subnav; KPI strip; EntityLinks; separate Settlements sidebar; cash advance requests link.
**MISSING:** Disputes in canonical subnav count; design “Pay rate templates pointer to Lists” may still embed content.
**DRIFT:** Flyout `?subtab=` vs path routes; Settlements duplicated (module tab + sidebar); On Loads/Available dead KPIs.
**WILL FAIL:** Clicking On Loads/Available KPI does nothing (looks broken); flyout `?subtab=settlements` works only because redirect effect exists — brittle for bookmarks if redirect removed.

## Professional recommendation
Keep DRIVER PROFILE and SETTLEMENTS sidebar items (never merge-delete). Update flyout to path-based URLs only. Add Disputes to DRIVERS_SUBNAV or remove route. Either wire On Loads/Available filters or remove click styling. On hire, forensically verify auto-provisioned CoA account ids are stored and linked both ways before claiming §4 done.

## Deep button inventory (repo) — finish pass 2026-07-15

**Evidence root:** `apps/frontend/src/pages/Drivers.tsx` · `components/drivers/DRIVERS_TABS_CONFIG.ts` · sidebar `sidebar-config.ts:101,126,190-199`

### Sidebar / flyout
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| DRIVER PROFILE | `sidebar-config.ts:101` | `/drivers` | HAVE |
| SETTLEMENTS (separate) | `sidebar-config.ts:126` | `/driver-finance/settlements` | HAVE — KEEP |
| Flyout `?subtab=` URLs | `sidebar-config.ts:193-197` | Legacy query | DRIFT |
| `?subtab=` redirect | `Drivers.tsx:134-143` | Maps to path `DRIVERS_SUBTAB_PATH` | HAVE (brittle if removed) |

### Primary CTAs / KPI
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| **+ Create Driver** | `Drivers.tsx:420-423` | Opens create flow | HAVE |
| Refresh | `Drivers.tsx:424` | Invalidate drivers query | HAVE |
| **+ Create Team** | `Drivers.tsx:466-469` | When `activeTab === "teams"` | HAVE (discoverability MIXED) |
| KPI Active / On Leave / Settle Due / Drivers Owe / Escrow | `Drivers.tsx:434,437-440` | `to=` drill | HAVE |
| KPI On Loads / Available | `Drivers.tsx:435-436` · B10 comment `:430-433` | No `to` | WILL FAIL (intentional dead) |
| DRIVERS_SUBNAV (9) | `DRIVERS_TABS_CONFIG.ts:2-12` · render `Drivers.tsx:446-460` | Path-synced NavLinks | HAVE |
| Cash advance requests link | `Drivers.tsx:463` | `/driver-finance/cash-advance-requests` | HAVE |
| Disputes route | `route-manifest.ts:18,96` | `/drivers/disputes` **not** in `DRIVERS_SUBNAV` | DRIFT / MISSING from subnav |
| EntityLink driver | `Drivers.tsx:502+` | Roster / settlements / advances | HAVE |

### Top WILL FAIL (new evidence)
1. **On Loads / Available KPI clicks do nothing** — `Drivers.tsx:435-436`.
2. **Flyout bookmarks `?subtab=`** depend on redirect `Drivers.tsx:134-143`.
3. **Disputes** reachable by URL (`route-manifest.ts:18`) but absent from canonical 9-tab subnav.

**Never delete** DRIVER PROFILE or SETTLEMENTS sidebar items — dual doors required.
