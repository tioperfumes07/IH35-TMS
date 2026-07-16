# 25 — DRIVER HUB

**Verdict:** Real office inbox + scheduler shell for cash-advance review; three hub tabs are client-state only (not URL-deep-linkable). Load-update / repair / complaint inbox tabs are honest empties — not fake data. Dual door with Safety scheduler is KEEP (never delete).

## Live evidence notes
**REPO-ONLY** (no browser this pass). Evidence from source + route registration.

- Sidebar: `driver-hub` → `/driver-hub` (`sidebar-config.ts:109`); flyout Home + Driver App (`:298-302`).
- Hidden from arch design as a named MODULE — design still lists “DRV APP” as sidebar icon; live rail has **DRIVER HUB** + separate DRIVER PROFILE. Treat as additive product surface (never delete).
- Routes: `/driver-hub`, `/driver-hub/reporting`, `/driver-app` (`manifest.tsx:933-946`, `:3840`).

## Surface / button inventory

| Surface | Control | Route/behavior | Status |
|---------|---------|----------------|--------|
| Sidebar DRIVER HUB | Nav | `/driver-hub` | HAVE |
| Flyout | Driver Hub Home | `/driver-hub` | HAVE |
| Flyout | Driver App | `/driver-app` → `DriverAppLandingPage` opens `VITE_DRIVER_PWA_URL` or `https://driver.ih35dispatch.com` | HAVE (landing only) |
| Hub header | Reporting (review roles) | Link → `/driver-hub/reporting` | HAVE (`DriverHubPage.tsx:36-42`) |
| Hub tabs | Overview / Driver Scheduler / Leave Requests | `useState` only — **no URL sync** | WILL FAIL bookmark (`DriverHubPage.tsx:28,46`) |
| Overview | Driver Inbox | Cash-advance pending list via office API | HAVE (`DriverInbox.tsx`) |
| Inbox filter tabs | All / Cash advances / Load updates / Repairs / Complaints | Client filters; non-cash counts hardcoded `0` | STUB (honest empty — `DriverInbox.tsx:12-21,64-70`) |
| Inbox card | Expand / pay-from account / Approve & post / Deny | Office approve cascade (B5) + deny with reason | HAVE (`:89-104,220-230`) |
| Inbox | Non-review roles | Message: requires Manager/Accountant/Owner… | HAVE (`:106`) |
| Scheduler tab | Embeds `DriverSchedulerGridPage` | Same component as Safety scheduler | DRIFT dual door (KEEP) |
| Leave Requests tab | Embeds `DriverSchedulerRequestInboxPage` | Safety leave inbox reuse | DRIFT dual door (KEEP) |
| Reporting page | Date From/To + Export CSV | `getInboxReporting` + client CSV | HAVE (`DriverHubReportingPage.tsx:78-100`) |
| Reporting KPI cards | Total/Approved/Denied/rates/volume | Read-only summary | HAVE |
| Reporting | Back links | `/driver-hub` | HAVE |

## HAVE / MISSING / DRIFT / WILL FAIL

**HAVE**
- Cash-advance Approve & post / Deny wired to office endpoints (not cosmetic).
- Reporting with CSV export for accountability.
- Role gate for review (`REVIEW_ROLES` — `DriverHubPage.tsx:13`).
- Driver App flyout landing (does not pretend office UI is the PWA).

**MISSING**
- URL-per-hub-tab and URL-per-inbox-filter (shareable links).
- Backend for Load updates / Repairs / Complaints inbox types (tabs exist as empty shells by design).
- Architectural design MODULE entry for Driver Hub (design still stale vs 29-item sidebar).

**DRIFT**
- Scheduler + Leave live under Safety routes/components AND Driver Hub tabs — dual door; keep both, label SoR if needed.
- `03-SIDEBAR-FULL-INVENTORY.md` said driver-hub has no flyout — **wrong**; flyout exists (`sidebar-config.ts:298-302`).

**WILL FAIL**
1. **Bookmark / share a hub tab** — refresh always returns Overview (`useState` default).
2. **Operator expects Load updates / Repairs / Complaints to show work** — counts always 0; only cash advances load (`DriverInbox.tsx:64-70`).
3. **Non-reviewer opens Overview** — sees role wall only; may look “broken” vs empty inbox UX.

## Professional recommendation
Keep DRIVER HUB as the office request/ops inbox (Alvys/McLeod-style dispatcher inbox). Add `?tab=` / `?inbox=` URL sync. Wire remaining inbox types to real APIs when PWA emits them — do **not** delete empty tabs. Cross-link Safety scheduler as SoR for calendar editing if Hub remains a read/approve surface. Update `IH35_ARCHITECTURAL_DESIGN.md` to name Driver Hub (additive) so CI tab law matches live rail.

## Sources
- `apps/frontend/src/components/layout/sidebar-config.ts` (L109, L298-302)
- `apps/frontend/src/pages/home/DriverHubPage.tsx`
- `apps/frontend/src/pages/home/DriverHubReportingPage.tsx`
- `apps/frontend/src/components/driver-inbox/DriverInbox.tsx`
- `apps/frontend/src/pages/DriverAppLandingPage.tsx`
- `apps/frontend/src/routes/manifest.tsx` (L933-946)
- `apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerGridPage.tsx`
- `apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerRequestInboxPage.tsx`
