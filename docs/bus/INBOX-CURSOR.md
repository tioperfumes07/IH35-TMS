# Cursor INBOX · HONEST BUILT · NON-STOP · Live=BLOCKED

**Boot (mandatory):**  
1. `docs/lockdown/FULLY-WIRED-COMPLETE-BAR-2026-08-13.md`  
2. `docs/lockdown/HONEST-BUILT-LAUNCH-LAW-2026-08-14.md` ← seat lanes + theater ban  
3. This INBOX → then `docs/bus/OUTBOX-CURSOR.md`

## ☐ NOW (Cursor lane — permanent sequence)

0. **OPEN `LV-REPORTS-GEOFENCE-RECON-GROUPED-TABLES-MISSING-SURFACE-BAR`** — live USMCA `/reports/geofence-reconciliation`; dynamic anomaly-class ParityTables at `GeofenceReconciliationReport.tsx:85-151` lack Search+Range+gear and disappear entirely at zero rows. Fix once for every class with a leaf-specific mutation guard; preserve date Apply, EntityLinks, resolution, and honest empty state; `BLOCKS=LIVE-REPORTS-GEOFENCE-RECONCILIATION-CHROME`; OWNER-GATED=no.

0. **OPEN `LV-HOVERDROPDOWN-HOVER-CLICK-SELF-CLOSE`** — live USMCA `/reports` `All` trigger becomes active but renders no flyout: shared `HoverDropdown` opens on mouseenter, then the same click sees open state and closes it. Fix once across all three consumers (Reports category nav ×2 + Safety group nav) with pointer/keyboard/outside-dismiss behavior coverage and one mutation-proven guard; `BLOCKS=LIVE-REPORTS-REPORT-FLYOUT,LIVE-SAFETY-GROUP-NAV`; OWNER-GATED=no.

0. **OPEN `LV-INVENTORY-ASSIGNMENTS-DUPLICATE-SEARCH`** — live USMCA `/inventory/assignments` has canonical ParityTable Search+Range+gear plus a second “Search assignment trail” input (`InventoryAssignmentsPage.tsx:34-60,170-188`). Fix as a vertical `ParityTable filterBar` search-child class sweep with one mutation-proven all-consumer guard; `BLOCKS=LIVE-INVENTORY-ASSIGNMENTS-CHROME`; OWNER-GATED=no.

1. **Theater purge:** `qbo_chrome` + `picker_law` — no `leafRe:.*` / `|.*` / word-blanket Built  
2. **Surface-bar leaf-existence audit** (Fully-Wired item 7) — **confirmed green live this session** (all 6 inventory ratchets PASS: create-drawer, toolbar, wizard, modal, ParityDrawer, Combobox)  
3. **qbo_chrome + picker_law leaf-specific honesty** (your own next-ranked item) — verify no `leafRe:.*`/`|.*` remains on these two specifically; fix any found  
4. FE reverse/connectivity leftovers (EntityLink / drawer / chrome — non-GL) — resume in progress (DriverReportsQueue EntityPicker)  
5. Your **14-item** slice of the orphan guard registry (`docs/audit/ORPHAN-GUARD-OWNER-HANDOFF-2026-08-15.md` — picker/chrome/surface-bar guards not wired into CI): wire + fix any that are actually red, same pattern CC-1 is using on its 76  
6. Bus truth + rewake idle seats — never idle waiting for Jorge  
7. Live Chrome — **owner-directed to begin now, in parallel with 1–6, not gated on whole-product Built=100%.** Per your own status: theater purge + surface-bar green — start Live Chrome per-leaf on what's already honestly Built; **do not** claim whole-product "Live" from partial coverage. State exactly which leaves you verified and how.

**Codex is helping with Live Chrome verification while it has zero items in its own lane** — coordinate so you don't both click through the same leaf; claim/tag which leaves you're each covering in your OUTBOX lines.

**FORBIDDEN:** soft “Done / fully wired / launch-ready” · inventing new scoreboard columns · `leafRe=.*` theater · claiming whole-product Live complete from a partial pass  

OUTBOX: `Cursor | … | Live=BLOCKED(whole-product) | theater_broad_remaining:N | leaves_live_verified:<list> | NEXT=…`

## LAW LOCK
- Fully wired = 12-item bar (Live Chrome last)  
- Launch without Live = items **1–11** + **honest Built** — `HONEST-BUILT-LAUNCH-LAW-2026-08-14`

## CODEX HANDOFF · 2026-08-16 · LV-PROGRAM-TRACKER-R2-CREDENTIALS-MISSING

Actions run `31940366897` is green only because both R2 upload scripts skipped on absent `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` (log lines 4350, 4424-4433). Live `/program/tracker` remains on the Aug 15 fallback with zero Completed. Exact OPEN acceptance and `BLOCKS=LV-PROGRAM-TRACKER-DEPLOYMENT-PROOF-PRODUCER-DROPPED` are in `docs/audit/GUARD-WORKORDERS.md`; audit row 868. Owner-gated=no; Cursor bus/deploy lane.
## CODEX HANDOFF · 2026-08-15 · FINDINGS-REGISTER-SIGNOFF-DRIFT-2026-08-15

`node scripts/verify-findings-register-signoff.mjs` is red on current main: seven board OPEN IDs are absent from `docs/audit/CC-3-FINDINGS-CHECKLIST.md`, and three checked Cursor rows have empty/misaligned Guard cells. Exact IDs and acceptance are filed in `docs/audit/GUARD-WORKORDERS.md`. Mechanical bus/register ownership; `OWNER-GATED=no`; `BLOCKS=FINDINGS-TRIPLE-LOCK-GREEN`.
## CODEX HANDOFF · 2026-08-16 · LV-TOPBAR-RESPONSIVE-HORIZONTAL-CLIP

At 697px Live USMCA `/home`, shared `Topbar.tsx` clips the company switcher after `Current:` and pushes every right-side action off-screen. Fix the shared vertical class across all modules; preserve all actions via responsive wrapping/compaction/accessible overflow, with a leaf-specific guard and viewport test. Exact OPEN row, source lines, acceptance, audit row 875, and `BLOCKS=LIVE-CHROME-RESPONSIVE-ALL-MODULES` are filed. OWNER-GATED=no.
## CODEX HANDOFF · 2026-08-16 · LV-HOME-DRIVER-DAY-SUMMARY-EMPTY-HIDES-TOOLBAR

Live USMCA `/home` has honest no-HOS copy but zero Search/Range/gear/Filter controls because `DriverDaySummaryCard.tsx:82-105` replaces `ParityTable` when `has_data=false`. Preserve the explanation and keep an empty governed table mounted; extend the Home guards with an independent empty-branch mutation. Exact OPEN row, audit 879, and `BLOCKS=LIVE-HOME-EXACT-TOOLBAR-LEAVES` are filed. OWNER-GATED=no.

## CODEX HANDOFF · 2026-08-16 · LV-COMPLIANCE-TOOLBAR-BORROWS-FILINGS-TAB

Live `/compliance` shows Search/Range/gear on the default 37-row Filings table, while `/compliance?tab=hos_viewer` mounts matrix-claimed `HosViewerSection` with only driver/date controls. Correct the exact leaf owner in the matrix and both vertical guards; do not invent a table on HOS Viewer. Exact OPEN row, audit 884, and `BLOCKS=LIVE-COMPLIANCE-EXACT-TOOLBAR-LEAVES` are filed. OWNER-GATED=no; no mutation.

## CODEX HANDOFF · 2026-08-16 · LV-TASKS-TOOLBAR-LEAVES-POINT-TASK-BOARD

Live `/tasks` Task Board has Filters and two task cards but no Search/Range/gear. Live `/tasks/report` mounts matrix-claimed `TasksReportPage` with all three controls and one scoped assignee row. Bind the three exact leaves to `/tasks/report` and extend both vertical exact-consumer ratchets. Exact OPEN row, audit 885, and `BLOCKS=LIVE-TASKS-EXACT-TOOLBAR-LEAVES` are filed. OWNER-GATED=no; no mutation.

## CODEX HANDOFF · 2026-08-16 · LV-USERS-TOOLBAR-BORROWS-DETAIL-ACTIVITY

Live `/users` root has a 19-row UsersPage with Search/Range/gear, while matrix-claimed `UserActivityTab` mounts only inside `/users/:id` after selecting Activity and owns a separate audit list. Bind root leaves to `pages/Users.tsx`, or inventory detail Activity separately if owed. Exact OPEN row, audit 886, and `BLOCKS=LIVE-USERS-EXACT-TOOLBAR-LEAVES` are filed. OWNER-GATED=no; no mutation.

## CODEX HANDOFF · 2026-08-16 · LV-DRIVER-HUB-TOOLBAR-LEAVES-POINT-INBOX

Live `/driver-hub` Inbox has no governed list toolbar; `/driver-hub/reporting` mounts matrix-claimed `DriverHubReportingPage` with Search/Range/gear, one linked row, dates, and metrics. Bind all four toolbar leaves to Reporting and extend both exact-consumer ratchets. Exact OPEN row, audit 887, and `BLOCKS=LIVE-DRIVER-HUB-EXACT-TOOLBAR-LEAVES` are filed. OWNER-GATED=no; no mutation.

## CODEX HANDOFF · 2026-08-16 · LV-DRIVERS-TOOLBAR-BORROWS-PROFILE-HISTORY

Live `/drivers` root has the 12-row roster Search/Range/gear, while matrix-claimed `OperationsHistoryTable` mounts separately in `/drivers/:id` as zero-row assignment history. Bind root leaves to the actual roster owner or inventory detail history separately. Exact OPEN row, audit 889, and `BLOCKS=LIVE-DRIVERS-EXACT-TOOLBAR-LEAVES` are filed. OWNER-GATED=no; no mutation.

## CODEX HANDOFF · 2026-08-16 · LV-PROGRAM-MODULES-FILTER-CONTROL-ABSENT

Live `/program/modules` rendered Search, Range, gear, and 14 real rows, but no Filters panel or Apply action despite an exact `chrome.toolbar_filter` claim. Add the governed filter interaction or prove N/A and remove the claim; mutation-prove missing Apply. Exact OPEN row, audit 892, and `BLOCKS=LIVE-PROGRAM-MODULES-FILTER` are filed. OWNER-GATED=no; no mutation.

## CODEX HANDOFF · 2026-08-16 · LV-SYSTEM-PROGRAM-FILTER-CONTROL-ABSENT

Live `/system?tab=program` rendered Search, Range, gear, and eight phase rows, but no Filters panel or Apply action despite an exact `chrome.toolbar_filter` claim. Add the governed filter interaction or prove N/A and remove the claim; mutation-prove missing Apply. Do not alter QBO behavior. Exact OPEN row, audit 893, and `BLOCKS=LIVE-SYSTEM-PROGRAM-FILTER` are filed. OWNER-GATED=no; no mutation.
