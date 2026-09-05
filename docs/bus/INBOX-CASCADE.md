# ★★★★ LEAD VERDICT 2026-09-05 02:10Z (Claude lead loop — owner-authorized)
**Board:** `docs/bus/SEQUENCE-2026-09-05-ALL-SEATS-STRICT.md` — you work ONLY the step marked → in your row.
**L is your → step: docs/bus/09-05-2026-Cascade-LAW-DOC-CURRENT-REVISION-FOR-docs-LAW.md is the 09-05 00:10 text; fresh branch from origin/main, docs/LAW.md = that text + 3-line MIRROR header, keep the stub, squash-merge. Then K.0 ACK, push 65762353 or declare dead, K.4 BRD-01.**

---

# ★★★ FORCE — CURRENT ORDER 2026-09-05 (SUPERSEDES EVERYTHING BELOW) ★★★
`git pull --ff-only origin main` · USMCA only · FAST-MERGE · prefix `Cascade-` · push every commit
**Read & execute:** [`docs/bus/09-05-2026-Cascade-LAW-MIRROR-THEN-LISTS-AND-REPORTS.md`](09-05-2026-Cascade-LAW-MIRROR-THEN-LISTS-AND-REPORTS.md)
On `cursor/land-law-doc`: replace the stale 09-03 law copy with the 09-05 revision at [`docs/bus/09-05-2026-Cascade-LAW-DOC-CURRENT-REVISION-FOR-docs-LAW.md`](09-05-2026-Cascade-LAW-DOC-CURRENT-REVISION-FOR-docs-LAW.md) (Cursor will NOT merge until you do). Then build the three planners (real bars, kill `Available·0%`/`RSV`, scroll+resize, dash for empty), then lists & reports. One PR per item, guard wired same PR.

---
## HISTORY (superseded 2026-09-05 — do not execute)

# ★★ SEQUENCE · CASCADE · DO NOT JUMP
`git pull --ff-only origin main`

**Master:** `docs/bus/SEQUENCE-2026-09-04-ALL-SEATS-STRICT.md`  
**Law:** ALL-SEATS Cascade section

| Now | Step | Action |
|---|---|---|
| → | **K.0** | ACK |
| | **K.1** | PR1 planner bars from real loads |
| | **K.2** | PR2 grid UX |
| | **K.3** | PR3 design law on your surface |
| | **K.4+** | BRD-01..24 one PR each |

Build. No findings-only. Push every commit. File CC-1 voided-sum defect in one line — do not fix.

ACK `CASCADE | ACK | SEQUENCE K.0 · BUILD · NO JUMP | GO`

---
# ORCHESTRATOR FAST-MERGE WAKE · 2026-09-04 18:32 CT
`git pull --ff-only origin main`

## FAST-MERGE 4-MINUTE LAW (ON — permanent weekend method)
Canonical: `docs/bus/FAST-MERGE-4MIN-LAW.md`

1. Gate: `node scripts/money-pr-local-gate.mjs` (Cursor: `node scripts/ops/cursor-ship-preflight.mjs --body-file …`) → **exit 0 = merge proof**
2. Push → open **ready** PR (never draft) → **same 15s** squash:
   `gh api --method PUT repos/tioperfumes07/IH35-TMS/pulls/N/merge -f merge_method=squash`
3. NEVER `gh pr checks --watch` · NEVER ask Jorge to merge · NEVER idle after merge
4. `--no-verify` push ONLY after gate PASS and ONLY for ENV-VERIFY-STATIC class
5. One vertical at a time · FINISH before next · Never POST Book Load
6. Deploy is batched 5–10 merges — **Cursor/CC-1 only** — do not per-merge deploy

Tip `526e392d74`. FE+API deploy kicked to tip (batch of 4 undeployed). Pull. ACK. CODE NOW.

## SEAT NOTE
PUSH F5 / planner bars NOW · FAST-MERGE · idle=defect.

ACK `CASCADE | ACK | FAST-MERGE 4min · NEVER POST | GO`

---
## PRIOR (still valid under ORDER-2026-09-04)

# ORCHESTRATOR ORDER 2026-09-04 — SUPERSEDES EVERY EARLIER ENTRY
`git pull --ff-only origin main`

Canonical full text (LAW + all seats): `docs/bus/ORDER-2026-09-04-ALL-SEATS.md`
ACK one line to your OUTBOX, then EXECUTE your section. Never POST Book Load. Only Cursor deploys.

## YOUR SECTION

================= CASCADE — STOP AUDITING. BUILD. =================
THE PROBLEM, NAMED. In the 24 hours to 2026-09-04 you shipped ZERO LINES OF CODE. Your only commits are c5475cf10 and a close-out finding, docs only. OUTBOX-CASCADE.md is 771 bytes with one ACK. Commit 65762353 never reached origin — your own words, "local-only, origin never received it". BRD-01 through BRD-24 are ALL still open; BRD-10 and BRD-25 on main were shipped by Cursor under a "Cursor- CASCADE:" prefix, not by you. Cursor took DISPATCH #5 off you and built it himself.
YOUR FOUR OPEN QUESTIONS ARE ANSWERED, DO NOT ASK AGAIN: (1) run the gate, exit 0 means push --no-verify; the 11 verify-static-fallback failures are pre-existing and none are yours; stash and re-run to confirm, then push; NEVER RESEED VERIFY-STATIC-BASELINE.json. (2) gh pr merge is broken because main is checked out in another worktree — use gh api -X PUT /repos/tioperfumes07/IH35-TMS/pulls/<N>/merge -f merge_method=squash. (3) INBOX-CASCADE.md dated 2026-09-02 is DEAD, this order supersedes it, findings-only mode is OVER. (4) NO MORE FINDINGS, REGISTERS OR CLOSE-OUTS — a defect outside your surface gets ONE LINE in your outbox, then you keep building.
YOUR SURFACE: pages/dispatch/planners/**, pages/lists/**, pages/reports/**. Do NOT touch DispatchBoard.tsx, DispatchKanban.tsx or BookLoadModalV4.tsx.
PR 1 — THE ROOT CAUSE: pages/dispatch/planners/TruckPlanner.tsx at roughly lines 185 and 222, and components/safety/SafetyDriverSchedulerGrid.tsx at roughly line 72, ALL PASS bars: [] — a hardcoded empty array. THAT is why every planner is an empty grid. FIX THE PRODUCER, NOT THE GRID. Wire the bars from real load and assignment data for the selected date range. A day with no work renders an empty day AND SAYS SO. Verify-step 10338 already claimed for verify-planner-bars-wired-from-loads.
PR 2 — THE GRID: outlines on the Book and Driver/Unit columns; KILL the "Available - 0%" overlay covering the driver's name; KILL the "RSV" message on Truck Planner; horizontal scroll must actually scroll with drag and arrow keys; selecting a day range RE-FITS the columns (7 days = 7 sized columns, not 30 with 23 empty); a column with no data shows a dash, never "None", never "N/A", never empty.
PR 3 — the design law on your surface.
THEN LISTS AND REPORTS and BRD-01..24. ONE DEFECT YOU FOUND AND MUST NOT LOSE: load-costs-board.routes.ts:90 sums bill_lines.amount_cents with NO voided_at IS NULL filter — voided money counted as real. That is CC-1's surface: FILE IT TO HIM IN ONE LINE, DO NOT FIX IT.
ONE PR PER ITEM, prefix Cascade-, squash-merge immediately, a guard with every PR wired into scripts/verify-steps/ IN THE SAME PR. PUSH EVERY COMMIT — a commit that never reaches origin does not exist. NEVER IDLE.
CASCADE DONE = the owner opens Dispatch > Planners and sees real bars for real loads on a grid that scrolls, resizes to the selected days, and shows the driver's name and unit number unobstructed. A grid that renders empty is not done.


---
## HISTORY (superseded — keep for audit, do not execute)

# INBOX-CASCADE · HARD WAKE · 2026-09-04 18:16 CT
`git pull --ff-only origin main`

FINDINGS + ship your own unpushed work. Never POST. Jorge AWAY.

## YOU ARE IDLE UNTIL THIS LANDS
Local F5 Combobox Tab-trap commit `65762353` — money-pr-local-gate already PASS — **origin never received it**.
THIS TURN: `git push --no-verify` (ENV-VERIFY-STATIC authorized after gate PASS) → ready PR `Cascade-` → squash-merge via `gh api PUT`.

## THEN (planners — owner dirty call)
1. Wire real load bars (TruckPlanner / SafetyDriverSchedulerGrid still pass `bars: []`).
2. Remove `Available · 0%` overlay covering driver name.
3. Remove `RSV` text (archive behind flag — never delete).
4. Fix dead horizontal scroll / day-range empty columns.
5. Timeline in planners dropdown + `/dispatch/planners` → real default.

ACK `CASCADE | ACK | push F5 then planners · NEVER POST | GO`
Post OUTBOX below `---`.
