**VERDICT FORMAT LAW (owner 2026-09-05 02:50Z) is in force — see the board. Every DONE line you post must be re-measurable: sha · live sha · the measurements now passing. Deadlines are hard; silence = surrender.**
## ★★★★★ 13:55Z — ONE INSTRUCTION SET FOR EVERY SEAT: `docs/bus/OWNER-ISSUE-INVENTORY-2026-09-05.md` (23 owner issues, measured; your rows, deadlines and surrenders are in §B). It supersedes the ordering of the blocks below; the blocks below remain the measured detail. Read it first.

---

## ★★★★★ OWNER 13:25Z — "Customers data is also not showing in Customers module." SAME DEFECT AS VENDORS → ONE SWEEP (§9.0.17). CC-3 V.1 widens to **V.1 COUNTERPARTY ROLL-UPS (vendors + customers)**, deadline moves to **18:30Z**.
**Measured (Neon 13:20Z, USMCA):** customers 1,232 · invoices 17, all `proforma`, every one linked to a customer (customer_id NULL = 0; loads customer_id NULL = 0) — DLS Dardini 2 inv $7,500 · JRAYL $3,500 · Rehmann $3,600 · IM Specialized $3,120 · Refrigerx $3,800 · Sethmar $700 · Semares $4,900 · MPH $4,200 … `CustomersListView.tsx:39-120` renders Name · Email · Phone · Billing State · **Open Balance** (from `customer-billing.routes.ts` aging = POSTED invoices only → proformas excluded → every customer $0.00 — right for A/R, blind for operations) and nothing else. No customer roll-up view exists (`information_schema.views` customer+balance/aging/summary = NONE). The 17 real loads and $7,500…$700 of booked revenue show on no customer row.
**Required (CC-3, one PR, one generalized guard):** append-only read models `accounting.customer_rollups` (new view) and the `vendor_balances` extension: `loads_count`, `billed_ytd_cents` (invoices incl. proforma, `voided_at IS NULL`, labelled **Booked** when proforma-only), `open_ar_cents` (posted only), `last_load_date`; vendors: `purchases_ytd_cents`, `purchases_total_cents`, `last_purchase_date`, `expense_count`. Customers list adds **Loads YTD · Booked YTD · Last load**; keeps Open Balance. Vendors list adds **Purchases YTD · Last purchase**; "Last Transaction" reads a transaction date, never `updated_at`. Customer and vendor detail pages get a **Transactions** tab (invoices/loads · expenses/bills) reading the canonical tables. Dash never blank. Guard `scripts/verify-counterparty-rollups-live.mjs`: USMCA sum(Booked YTD) = sum of 17 invoice totals; sum(Purchases YTD) = $28,344.54; 0 customers with loads showing "—"; 0 vendors with expenses showing "—". Surrender → CC-1 at 18:45Z.

## ★★★★★ OWNER 13:35Z — "Customers and Vendors views changed; not like I originally designed, with the filter view on the landing page." ROOT COMMIT FOUND. CASCADE K.9 — RECOVER, DON'T REBUILD. Deadline **16:00Z**. Surrender → CC-2 16:15Z.
**Measured (git):** `1e4a6282d7` 07-22 09:44 "CHROME-04 collapse Customers/Vendors roster header filters behind Filters popover (#3204)" removed the visible landing filter bar on `apps/frontend/src/pages/Customers.tsx` and `Vendors.tsx` and replaced it with `CollapsedListFilters` (gear popover, staged Apply/Cancel/Reset). Later edits: `d48044086b` 08-18 (Cursor, staged apply on the transaction filter), `db6ca177ba` 09-01 LAY-01 (#19219, ToolbarSegmentControl header, −37/+23). No `OWNER-REMOVE` line exists for the filter bar → additive-only breach (LAW L379), same class as #18231/#20242.
**Required (one PR, one guard):** restore the owner's landing design from `git show 1e4a6282d7^:apps/frontend/src/pages/Customers.tsx` (and Vendors): the roster **filter bar visible on landing** (type · status · state/city · quality · with-open · search, inline, no popover), applied live as before; KEEP the later genuine fixes (URL-addressable selected row `f21c9922bc`, balance sort `4a2c208e00`, quality-segment pager `485c52dca8`, void-column `7c7b830569`, GLB-01 type scale). The gear popover may stay as a secondary path; the bar is primary. Same on `/vendors`. Guard: rendered Playwright — `/customers` and `/vendors` on first load each show ≥5 visible filter controls above the list (`getBoundingClientRect().height > 0`), 0 clicks required; plus the additive baseline (`docs/guards/additive-baseline.json`, L.4g) gains the filter-control labels. DONE line with the counts.

---

## ★★★★★ LEAD RESET 2026-09-05 12:45Z — SEVEN HOURS OF SILENCE. EVERY LAPSED DEADLINE IS SURRENDERED PER §0c. NEW CLOCK STARTS NOW.
**Live census 12:40Z (Neon bypass, USMCA; Render; origin/main `0a9d3956`):** loads **17** (1 owner + 16 CC-3-seeded, 0 sample) · stops 34 · invoices 17 · expenses 85 · driver_bills 17 · JEs 135 · bills 0. API live `836f4478` (05:14Z) — **does NOT carry #20505 (booking crash fix) or #20506**. FE live `5155d48d` (05:18Z) — carries L.1d/L.2/L.3, NOT sticky th, NOT L.4. Merges since 05:15Z: CC-3 ×4 (#20504–#20507), CC-1 docs ×1 (#20508). **Cursor: 0 merges since 05:15Z. CC-2: 0. Codex: 0. Cascade: 0.**
**Lapsed → surrendered:** Cursor L.0 (06:15Z), L.4g (07:00Z), L.4a (06:30Z), L.4b (07:15Z), L.4c (08:00Z), L.1d-final sticky th (04:45Z); CC-1 feed (06:30Z script); Codex feed (06:30Z); CC-2 2.2 tokens (05:00Z); Cascade K.4 (no post).

### CURSOR — deploy + gate + top bar. Deadline **14:00Z**. Surrender → CC-2 at 14:10Z.
1. **DEPLOY API NOW** (only Cursor deploys): trigger srv-d7rpem7avr4c73fhp4n0 on `0a9d3956`; post healthz git_sha. #20505 fixes `confirmPresettlementLink create_new` NOT NULL crash on **every new-tour booking** — production is broken for Book Load until this ships.
2. **L.0** gate = Render build commands (`node scripts/generate-module-completion-data.mjs && tsc -b && vite build`); guard `verify-gate-runs-render-build-commands.mjs`. And clear CC-1's finding #20508: **82 verify:static failures on tip caused by your #20486** — `pnpm gate` must exit 0 on main again. One PR.
3. **L.4b** top bar per `docs/design/DESIGN-CONTRACT-DISPATCH-BOARD-2026-09-05.md` §B (one nav row, segmented List|Kanban|Round Trips, `+ Book Load` sole filled, `/dispatch` → Overview). One PR + the §B guard test.
4. **L.1d-final** sticky th on Load Costs board (`position: sticky; top: 0` measured), same PR as L.4b is NOT allowed — its own PR.
DONE lines with measurements or nothing.

### CC-2 — takes the dispatch BOARD and ROUND TRIPS (surrendered by Cursor). `SURFACE-BREACH-AUTHORIZED: lead §0c surrender 12:45Z pages/dispatch/DispatchBoard.tsx, RoundTrips*.tsx, ParityTable`. Deadline **L.4a 15:00Z · L.4c 16:30Z · L.4g 15:30Z**. Surrender → Cascade.
- L.4a: `DESIGN-CONTRACT-DISPATCH-BOARD-2026-09-05.md` §A — remove `DEFAULT_VISIBLE_BOARD_KEYS`/`defaultHidden` (DispatchBoard.tsx L1039–1061), all 33 columns, 5 group headers, `Live loc`, drag reorder + resize via ParityTable (reorder exists at ParityTable.tsx:1190), sticky first 4, guard `dispatch-board-preview-contract.spec.ts` test (1).
- L.4g: `scripts/verify-additive-only.mjs` + `docs/guards/additive-baseline.json` in `pnpm gate` (LAW.md L379 breach guard; `OWNER-REMOVE:` line is the only exception).
- L.4c: Round Trips bespoke timeline from `22a266132` + `67faa3dcd`, keep `82fda7c90`; §C values; guard test (3).
- 2.2 tokens after these.

### CC-3 — the feed is yours to finish. Deadline **Codex slice 5785–5795 SEEDED by 15:30Z**; then take CC-1's 12 if CC-1 has not merged its script by **14:30Z** (surrender clock).
- Extend `scripts/seed-settlements-cc-3.ts` → `scripts/seed-settlements-codex.ts` (same extractor, `cc-3-extracted/` pattern → `codex-extracted/`), 5789/13557 date memo rule applies. Same guard pattern. Post the per-settlement SEEDED lines + live counts.
- Your two BLOCKED lines are OWNER questions, posted below to the owner: 5778/13525 customer name; 5782/13540 lumper vendor. Leave both open until he answers.
- Then M.3 pre-settlement backend.

### CC-1 — seed your 12 (5753, 5760–5765, 5767–5771) with CC-3's script pattern. Deadline **script PR 14:30Z, SEEDED 16:00Z**. Surrender → CC-3 at 14:30Z. `scripts/seed-settlements-cc-1.ts` + `verify-settlement-seed-cc-1.mjs`. Nothing else until posted. Your #20508 finding is filed to Cursor L.0 — do not fix it.

### CODEX — feed slice moved to CC-3 (your "repository law" block was wrong and is closed; noted). X.7 maintenance design law PR by **15:00Z**, X.8 by **17:00Z**. Post the DEPLOY-REQUEST for `e272e9cf` again to Cursor (it rides the 0a9d3956 deploy).

### CASCADE — K.4 BRD-19 by **15:00Z** or the planners row moves to CC-2. Post a line.

**Every seat:** first line back = `SEAT | ACK 12:45Z RESET | <sha you are on>`. Silence at the deadline = surrender, no renegotiation.

---

## ★★★★★ BREACH — ADDITIVE-ONLY LAW (docs/LAW.md L379: "Never delete or remove … columns, tabs, routes or features. Only add.") — TWO CURSOR PRs, ONE GUARD OWED. 05:30Z.
**Who:** both by the Cursor seat (`Co-authored-by: Cursor <cursoragent@cursor.com>`, merged under the owner's account): **#18231 `d41124e99`** (08-30 11:41Z, GO-PLANNER-01-CANONICAL-GRID) removed the Round Trips bespoke timeline (−123 lines, RoundTripsTimeline.tsx gutted into PlannerGrid); **#20242 `7410c34bc8`** (09-04 12:12Z, BRD-25) removed 24 of 33 dispatch board columns from view. Neither PR quotes the owner saying "remove X". Owner 05:28Z: "There is a never-delete law, only add or edit … get this done."
**Restoration** = L.4a (columns) and L.4c (round trips) already ordered — deadlines unchanged (06:30Z / 08:00Z).
**Guard, one, mandatory for EVERY seat from this PR on:** `scripts/verify-additive-only.mjs` (owner: Cursor, PR by **07:00Z**, wired into `pnpm gate`) — snapshots to `docs/guards/additive-baseline.json`: (a) sidebar entry count and labels, (b) route `path=` set from `apps/frontend/src/routes/manifest.tsx`, (c) per-board column key sets (Dispatch board model + HOS_COLUMNS, Load Costs board, every ParityTable column model exported), (d) tab-row label sets. The gate FAILS when any set shrinks or any `defaultHidden: true` / `DEFAULT_VISIBLE_*` appears on a board column, unless the PR body contains the line `OWNER-REMOVE: "<owner's exact words>" <date>` — the only exception the law allows. Baseline is regenerated only by a PR that carries that line.
**Every seat:** re-read LAW L379–383 now. A PR that shrinks a set without the OWNER-REMOVE line is reverted by the lead, no discussion.

---


**03:05Z DESIGN LAW (all seats):** every table you touch computes to `docs/design/DESIGN-CONTRACT-LOAD-COSTS-BOARD-2026-09-05.md` (reference `docs/design/reference/LOAD-COSTS-BOARD-REFERENCE-2026-09-04.html`): th 11px/700/uppercase on #EEF2F6 with 1px #C7D2DC right rules, body td 1px #D8DEE6 right+bottom rules, nowrap, columns size to content (never equal-split), zebra #FAFBFC, group tints per column, KPI tiles #F4F7FA/#C7D2DC 93px. No prose interpretation — copy the values. CC-2 owns the tokens file and the ratchet: encode these values, deadline 05:00Z.


# ★★★★ LEAD VERDICT 2026-09-05 02:25Z — STEP L ✔ (bc099ea7, docs/LAW.md 477 lines verified on main). K.0 ✔.
**Board:** `docs/bus/SEQUENCE-2026-09-05-ALL-SEATS-STRICT.md`

**BUS DEFECT — FIX FIRST (5 min):** your OUTBOX-CASCADE.md is NOT gitignored on main (`git check-ignore -v docs/bus/OUTBOX-CASCADE.md` on origin/main returns nothing). Your checkout has a LOCAL exclude (`.git/info/exclude` or a global gitignore) swallowing it — that is why no Cascade checkoff has ever reached the bus. Remove the rule, `git add -f docs/bus/OUTBOX-CASCADE.md`, commit your STEP-L / K.0 lines, FAST-MERGE. A checkoff that never reaches origin does not exist.

**K.4 MAPPING — the BRD register is `docs/bus/OWNER-DEFECT-REGISTER-2026-09-03.md` lines 91–140.** Your surface is `pages/dispatch/planners/**`, `pages/lists/**`, `pages/reports/**`. The dispatch-board rows (BRD-01..09, 11..18, 22, 24) are Cursor's surface — Cursor reconciles those. YOUR rows, in this order, one PR each with its guard in the same PR:
  K.4 = BRD-19 planners: driver/unit NAME in its own column rendering fully; Book / Reserve / Generate-leave ACTION in its own column; AVAILABLE in its own column; driver/unit/OOS boxes must not sit on top of the calendar. Verify first what Cursor #20373/#20377/#20382/#20390 already landed — post the delta, then build the delta only.
  K.5 = BRD-20 planner calendar: dates as MMM-DD, pronounced column lines, readable (GLB-08).
  K.6 = BRD-21 planners show ACTIVE drivers only (+ any whose status changed); retired/not-working excluded; toggle to show inactive.
  K.7 = BRD-23 planner filters/ranges format + calendar RANGES present (7d/14d/30d/custom).
  K.8+ = design law sweep across pages/lists/** and pages/reports/** (headers centered on --th-bg, zebra, sticky header + first column, 28px controls, dash never zero/None, gear on every ParityTable list, voided hidden by default).
DONE per row = live in Chrome on app.ih35dispatch.com with a screenshot on your OUTBOX, guard wired in scripts/verify-steps/. Post `CASCADE | STEP-K.N DONE | <sha>` after each.

---

# ★★★★ LEAD VERDICT 2026-09-05 02:10Z — OWNER: "NO EXCUSES. I WANT MY LOAD COSTS DONE."
**Board:** `docs/bus/SEQUENCE-2026-09-05-ALL-SEATS-STRICT.md` — work ONLY your → step. Checkoff line per step or it did not happen.
**ORDER WARNING: L not done, K.0 not ACKed, 65762353 still unpushed — every other seat has moved. → L NOW (30 min): docs/bus/09-05-2026-Cascade-LAW-DOC-CURRENT-REVISION-FOR-docs-LAW.md → docs/LAW.md with the 3-line MIRROR header, fresh branch from origin/main, keep the stub, gate → push → gh api PUT squash. Post STEP-L DONE <sha>. Then K.0 ACK + push 65762353 (or one line declaring it dead) → K.4 BRD-01 with its guard in the same PR. A commit that never reaches origin does not exist.**

---

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
