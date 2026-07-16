# 30 — ELD (hidden stub + Safety audit trail)

**Verdict:** Top-level `/eld` is an intentional **empty shell** (5 tabs, no API) and is **hidden from the sidebar** (`NAV_HIDDEN_STUB_IDS`). Real ELD/HOS value lives under Safety (HOS clocks, violations) and `/safety/eld/audit-trail` (read-only edit history). Do **not** delete the ELD module id/route — un-hide only when live Samsara duty sync ships.

## Live evidence notes
**REPO-ONLY.**

- Sidebar meta keeps `eld` → `/eld`, Owner-visibleRoles (`sidebar-config.ts:122`) but excluded from `SIDEBAR_DEFAULT_ORDER` (`:67-75`).
- Stub page: `EldPage.tsx` + `ELD_TABS_CONFIG.ts` — empty-state copy only; `useState` tabs.
- Live adjacent: `EldAuditTrailViewer` at `/safety/eld/audit-trail` (`manifest.tsx:1449`) — fetches real audit trail + print.
- CAP-11 / Safety HOS: duty clocks from `hos.duty_status_events` (not this stub).

## Surface / button inventory

| Surface | Control | Route/behavior | Status |
|---------|---------|----------------|--------|
| Sidebar ELD | Nav item | Hidden via `NAV_HIDDEN_STUB_IDS` | STUB / HIDDEN |
| Route `/eld` | Still registered | `EldPage` for Owner direct URL | STUB (`manifest.tsx:917`) |
| ELD tabs (5) | Live Duty / HOS Violations / Unidentified / Certifications / Settings | Client state; empty panels | STUB (`ELD_TABS_CONFIG.ts:10-41`) |
| Empty bodies | “once ELD synchronization starts” | No fetch, no buttons | STUB |
| Safety | HOS / Violations tabs | Real Safety module surfaces | HAVE (dual door — KEEP) |
| Safety | ELD Audit Trail viewer | `/safety/eld/audit-trail` — driver+date, timeline, PDF payload | HAVE (`EldAuditTrailViewer.tsx`) |
| Safety audit trail | Driver select / From / To / Download | API-backed query | HAVE |
| Stub ↔ Audit trail | Cross-link from `/eld` | None | MISSING |
| Backend ELD sync into stub tabs | — | Not wired to `EldPage` | MISSING |

## HAVE / MISSING / DRIFT / WILL FAIL

**HAVE:** Honest empty stub (no fake duty events); hidden from nav so operators don’t hit a dead end from rail; real audit trail under Safety; HOS elsewhere.

**MISSING:** Live duty status feed on `/eld`; unidentified driving queue; certification list; settings; link from stub to `/safety/eld/audit-trail` and Safety HOS.

**DRIFT:** Arch sidebar text still lists ELD among “19 icons” (`IH35_ARCHITECTURAL_DESIGN.md:48`) while live has 29 visible + hidden ELD — design stale. Stub tab “HOS Violations” duplicates Safety naming without data.

**WILL FAIL**
1. **Direct URL `/eld` looks like a product** — five tabs, all empty forever until sync ships (`EldPage.tsx:22-28`).
2. **Training from arch “ELD module”** — no live duty UI; trainers must use Safety HOS + audit trail.
3. **Assuming stub will auto-fill from Samsara** — no code path on this page; false green if someone demos empty “No violations” as clean fleet.

## Professional recommendation
Keep `eld` id, route, and tab config (never delete). When Samsara ELD sync is production-ready: wire Live Duty to `hos.duty_status_events` / vendor events, deep-link Violations to Safety SoR (or embed), add unidentified driving reconciliation, then remove from `NAV_HIDDEN_STUB_IDS` and update arch design in the **same** commit. Until then: add a single banner on `EldPage` pointing to Safety HOS + `/safety/eld/audit-trail` so direct-URL visitors aren’t misled. Market bar (McLeod/Samsara): live clocks + unidentified driving are table stakes — stub is correctly hidden.

## Sources
- `apps/frontend/src/components/layout/sidebar-config.ts` (L45, L67-75, L122)
- `apps/frontend/src/pages/eld/EldPage.tsx`
- `apps/frontend/src/pages/eld/ELD_TABS_CONFIG.ts`
- `apps/frontend/src/pages/safety/eld/EldAuditTrailViewer.tsx`
- `apps/frontend/src/routes/manifest.tsx` (L917, L1449)
- `docs/specs/IH35_ARCHITECTURAL_DESIGN.md` (sidebar table L48; HOS CAP-11 notes)
- Related: `modules/13-SAFETY.md`, `modules/09-COMPLIANCE.md` (HOS dual doors)

---

## Sidebar coverage check (this pass)

All `SIDEBAR_ITEM_IDS` map to a module audit file:

| Sidebar id | Module file |
|------------|-------------|
| home, tasks | `17-HOME-TASKS.md` |
| fuel | `06-FUEL.md` |
| dispatch | `12-DISPATCH.md` |
| driver-hub | **`25-DRIVER-HUB.md`** (this file set) |
| maintenance | `14-MAINTENANCE.md` |
| safety | `13-SAFETY.md` |
| compliance | `09-COMPLIANCE.md` |
| drivers | `22-DRIVERS.md` + **`26-DRIVER-PROFILE.md`** (detail) |
| fleet | `21-FLEET.md` |
| insurance | **`11-LEGAL-INSURANCE.md`** (covered — no separate file needed) |
| legal | `11-LEGAL-INSURANCE.md` |
| eld | **`30-ELD.md`** |
| cash-flow, finance | `23-CASH-FLOW-FINANCE-HUB.md` |
| settlements | `07-SETTLEMENTS-DRIVER-FINANCE.md` |
| accounting | `05-ACCOUNTING.md` |
| bank | `04-BANKING.md` |
| factoring | `10-FACTORING.md` |
| customers / vendors | `15` / `16` (+ combined `15-CUSTOMERS-VENDORS.md`) |
| inventory | `08-INVENTORY.md` |
| form_425 | **`27-425C.md`** |
| lists | `19-LISTS.md` |
| reports | `18-REPORTS.md` |
| docs | `20-DOCS.md` |
| users | **`28-USERS.md`** |
| help | **`29-HELP.md`** |
| program, system | `24-PROGRAM-SYSTEM.md` |

**No additional sidebar id lacks a module file** after this pass. Insurance remains under 11 (own rail → `/safety/insurance`).
