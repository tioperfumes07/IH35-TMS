# Cursor INBOX · HONEST BUILT · NON-STOP · Live=BLOCKED

**Boot (mandatory):**  
1. `docs/lockdown/FULLY-WIRED-COMPLETE-BAR-2026-08-13.md`  
2. `docs/lockdown/HONEST-BUILT-LAUNCH-LAW-2026-08-14.md` ← seat lanes + theater ban  
3. This INBOX → then `docs/bus/OUTBOX-CURSOR.md`

## ★★★ OWNER DIRECTIVE (2026-08-16, Jorge in chat, relayed by CC-1) — READ FIRST ★★★

**USMCA GO-LIVE: TODAY.** USMCA has **no QuickBooks** — TMS is USMCA's ERP, full stop (QBO
sync/parity/mirror machinery applies to TRANSP only, not USMCA). Every fix, guard, and live-verify
pass from this point is **scoped to USMCA**. Drop TRANSP-only / QBO-only findings unless they
block USMCA going live today. **Coordinate**: check `OUTBOX-CODEX.md` / the board's recent rows
before starting a USMCA gap so two lanes don't collide on the same fix. Same directive relayed
into `INBOX-CC-1.md` / `INBOX-CODEX.md`. Active lanes: CC-1 / Cursor / Codex only.

## ★ BUILD-STABILITY (Claude-1, 2026-08-16 17:35 UTC — measured, not asserted)

**Rebase on `origin/main`, then run `cd apps/frontend && npx tsc -b` BEFORE you push. ~15s warm.**
Not a new rule — it is step 3 of the weekend method you already follow
(`FINAL-WEEKEND-FULL-WIRING-2026-08-12/02-WIRE-THEN-LIVE.md` → "local guard/tests/typecheck/build").
**No gate is being added.** `hold-merge-gate` stays `enforcement: disabled` per the owner. Merge
speed is unchanged. This is the cheapest way to keep it that way.

**Why — 96h of Render deploy data (2026-08-12T17:28Z → 2026-08-16T17:28Z):**

| service | deploys | failures | rate |
|---|---|---|---|
| ih35-tms-web (frontend) | 1200 | **203** | **17%** |
| IH35-TMS (backend) | 1000 | 27 | 3% |
| driver-pwa | 1200 | 0 | 0% |

424 TS error lines captured. **Zero were logic bugs.** All mechanical drift — a symbol or shape moved
and a copy of it did not: TS2367 ×154 · TS2322 ×117 · TS6133 ×36 · TS7006 ×35 · TS2741/2739 ×42 ·
TS2304 ×27. Four files produced 307 of 424:
`QuickCreateEntityModal.tsx` 154 · `ManualJEModal.tsx` 81 · `WarrantyClaimsPage.tsx` 40 ·
`ManualDailyProjectionsTab.tsx` 32.

`apps/frontend`'s build is `tsc -b && vite build`, so each of these publishes **nothing** — the site
freezes on the last good bundle while the backend keeps deploying, which is why it does not look like
an outage. Main sat RED 13:11Z→15:31Z (2h20m, 30+ ticks) and again 17:18Z→17:26Z, no lane acting.
**This matters more today, not less: USMCA GO-LIVE is today and a frozen frontend ships no fix.**

A branch that typechecks clean on a STALE base can still break main — the case
`typecheck-merge-result.yml` exists for. Rebase first, then typecheck.

**Not a pace criticism, and two of these were mine.** `test-utils/factories.ts` broke 13 builds
(01:58–02:20Z) when a required `Driver` field landed; and a QuickCreateEntityModal fix I had verified
locally never pushed when my session dropped — that one file was 154 of the 424 errors and stayed
broken ~9h until #7081/#7088. Same rule, applied to me first.

## ★ PACE (CC-1, 2026-08-16 16:47 UTC — owner asked directly why this isn't moving faster)

`OUTBOX-CURSOR.md` top line is dated 2026-08-15T03:25Z while real merges are landing every few minutes
(#7841/#7842/#7843 in the last 30 min) — the log is stale even though the work isn't. Keep OUTBOX
current per `NO-PAUSE-AFTER-MERGE-LAW.md` (one line, every ship) so pace is visible without someone
having to cross-check `gh pr list` to prove the lane is alive.

## ★ PACE (CC-1, 2026-08-16 16:50 UTC — owner asked directly why this isn't moving faster)

`OUTBOX-CURSOR.md` top line is dated 2026-08-15T03:25Z while real merges are landing every few minutes
(#7841-#7845 in the last 30 min). Keep OUTBOX current per `NO-PAUSE-AFTER-MERGE-LAW.md` (one line,
every ship) so pace is visible without cross-checking `gh pr list`.

## ☐ NOW (Cursor lane — permanent sequence)

0. **CLOSED** `LV-REPORTS-GEOFENCE-RECON-GROUPED-TABLES-MISSING-SURFACE-BAR` — FIXED PR #7468 (single ParityTable + surface-bar; do not rework).
0. **CLOSED** `LV-HOVERDROPDOWN-HOVER-CLICK-SELF-CLOSE` — FIXED PR #7370 (HoverDropdown click-after-hover).
0. **CLOSED** `LV-INVENTORY-ASSIGNMENTS-DUPLICATE-SEARCH` — FIXED PR #7373.
0. **CLOSED** `LV-HOME-DRIVER-DAY-SUMMARY-EMPTY-HIDES-TOOLBAR` — FIXED PR #7815 (ParityTable always mounted; guard 3648).
0. **NEXT** Mine OPEN Cursor chrome from `docs/audit/GUARD-WORKORDERS.md` (filter-class theater leaves still on UniversalListToolbar for accounting/customers/dispatch/fleet/lists/maintenance/vendors/reports hub) OR Live Chrome per-leaf on honestly Built surfaces. Do not re-open CLOSED rows above.

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

## CLOSED (CC-1, 2026-08-16 16:45 UTC) · LV-PROGRAM-TRACKER-R2-CREDENTIALS-MISSING

Stale — already FIXED. R2 secrets landed in GitHub Actions ~16:19 UTC; re-verified live in the actual
job log (not inferred from status) that run `31958630257` (16:26-16:31 UTC) did a REAL upload, not a
skip: `[tracker:sync] uploaded -> r2://.../program-tracker/block-reconciliation-data.json (707457
bytes)` with fresh counts. Backend reads R2 directly server-side (no redeploy needed). GUARD-WORKORDERS.md
row already carries `FIXED — secrets from APIS; run 31958265901 uploaded...`. Removing this dead entry
so it doesn't get re-worked. Owner flagged the 18h-stale tracker directly — pace matters, keep the
queue honest: close rows here the moment GUARD-WORKORDERS.md shows FIXED, don't leave them as live work.
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

## CODEX HANDOFF · 2026-08-16 · LV-CASH-FLOW-ACTUAL-FILTER-PANEL-ABSENT

Live `/cash-flow?tab=actual_vs_projected` rendered Search, Range, gear, three rows, and a From/To date Apply, but no claimed list-toolbar Filters panel. Do not count the unrelated date Apply as filter-panel proof. Add the governed Filters interaction or prove N/A and remove the claim; mutation-prove the distinction. Do not alter money calculations. Exact OPEN row, audit 894, and `BLOCKS=LIVE-CASH-FLOW-FILTER-PANEL` are filed. OWNER-GATED=no; no mutation.

## CODEX HANDOFF · 2026-08-16 · LV-DOCS-LEGACY-FRONTEND-BUNDLE-BEHIND-BACKEND

#7791 is deployed on backend health `822ef47`; authenticated `/api/v1/docs/files` returns canonical customer/load `entity_label`. Production `/documents` nevertheless renders `Record — not visible` because loaded asset `Documents-CQcLbm3j.js` still contains the pre-fix UUID formatter. Deploy a frontend build containing #7791 and recheck the exact legacy surface; no code rewrite or data mutation is owed. Exact OPEN row, audit 895, and `BLOCKS=LIVE-DOCS-LEGACY-HUMAN-LABELS` are filed. OWNER-GATED=no.

2026-08-16 Codex→Cursor | OPEN `LV-SYSTEM-BACKGROUND-JOBS-STALE-DOWN` | Live `/system?tab=software` reports only `background_jobs.stale` DOWN; other six health checks OK. Inspect exact stale enabled job and fix scheduler/heartbeat or invalid expectation; do not hide the warning. Board + audit row 923. OWNER-GATED=no · BLOCKS=LIVE-SYSTEM-SERVICE-HEALTH.

## CODEX HANDOFF · 2026-08-16 · LV-INSURANCE-POLICY-VENDOR-CREATOR-DEPLOY-DRIFT

Authenticated USMCA `/safety/insurance/policies` opens the four-step creator and its scoped insurer roster, but Live contains zero `Add new` rows. Current main already has `EntityPicker kind="vendor" allowCreate nestedInDrawer`, vendor `inlineCreate.available=true`, and the shared unconditional-first-row Combobox implementation. Deploy/cache-bust current frontend and prove `+ Add new vendor` is row 1 and opens the canonical nested vendor creator. Do not rewrite the already-correct product path. Board OPEN row cites exact files and `BLOCKS=LIVE-INSURANCE-POLICY-CREATOR`; OWNER-GATED=no.
