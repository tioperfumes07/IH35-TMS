# ALL CODERS — ROUND 8.14 — ENGINES, NOT SHELLS · DESIGNS EXACTLY AS THE BOARD · NO DRIFT
Posted 11-12-2026 4:55 AM CT (10:55Z) · Claude-Lead · delivered into every seat's INBOX

Owner order 2026-11-12 4:42 AM CT (verbatim):
> "MAKE SURE THE CODERS ARE STILL WORKING ON OTHER ENGINES. AND CONTINUE WORKING ON DESIGNS NOT DRIFTING ETC, FULLY BUILDS, NOT JUST SHELL ETC."

## 0. Measured activity 06:15Z → 10:45Z (merged PRs on main)
| Seat | Merged since Round 8.13 | Last merge (UTC) | What it was |
|---|---|---|---|
| CURSOR | ~25 | 10:40 (#28999) | MoneyCell / KPI drill wiring + main reds e–j (incl. M1 opco allowlist #28986) |
| CC-1 | 1 | 10:29 (#28998) | ACCT-F11152 has-transactions predicate scope |
| CC-3 | 1 | 09:27 (#28990) | insurance edit test fix |
| CC-2 | 0 | 05:54 (#28978) | AUTH-475 P2 reported BLOCKED; dependabot #28667 #28983 #28984 still open |
| CODEX | 0 | 05:09 (#28957) | — idle 5h40m |
| CASCADE | 0 | — | — idle |
Main at 10:45Z (1f5d80875d): 23 green, 2 running, 0 red.

## 1. LAW FOR THIS ROUND (every seat)
1. **Engine first.** Every item below is a WRITER/READER that produces or reconciles a real number. A PR that only adds a page, a card, a column or a drill with no engine behind it does **not** close a row.
2. **No shells.** A screen counts only if every number on it comes from a live engine query, every row opens its record, and empty/error states are honest (ListErrorState, never a fake 0).
3. **Designs exactly as the board.** Any screen you touch must match its board in `docs/design/v3/` (layout, sizes, the popup standard sm 480 / md 720 / lg 960 / xl 1280, 12px body scale). Layering a new strip on an old page = drift = not done. Put the board file name in the PR body.
4. **Re-measure before you build.** The register (`docs/bus/lead/LEAD-PENDING-REGISTER.md`) was last updated 11-09. Run the row's live query first (USMCA, `SET LOCAL app.bypass_rls='lucia'`). If it is already fixed, post the live proof and mark it; do not rebuild.
5. **Fast-merge law (8.13) stands.** Local gate passes → merge within 4 min. Money writes through engines only, fork first, TB 0 before/after.
6. **DONE line (OUTBOX):** row # · PR # · merge SHA · guard plain + `--selftest` · the live query result after deploy · CT time.

## 2. ASSIGNMENTS — deadline 2026-11-12 23:00Z (5:00 PM CT); missed → Claude-Lead takes it and records the miss
### CC-1 — money engines
- **E1** P-0125 / P-0128 / P-0130 (loads 13711 / 13727 / 13729): trip_closed_at set, status still `open` — `postFinalLoadSettlementsGl` never ran. Fix why the close did not post (root cause, not a hand advance), then post through the engine. Guard `verify-final-load-close-posts` → PASS live.
- **E2** 9 voided headers still carry live JEs (expenses 9b3feabb 59d9b3ef 87e6b3e2 f24b3d7c 94bc20d6; fuel 337a035f 3543b85c 37b620f2 71c8456f). Find the void path that skipped the reversal, fix it, reverse the 9 through the void engine. `verify-void-is-whole` 10 → 1.
- **E3** `load-cost-rollup.sql.ts` alias shadow: 6 loads / 5 settlements under-costed. `verify-load-cost-rollup-lateral-no-alias-shadow` → 0.
- **E4** Load 13700 (Rafael, salaried) week P-0159 closed $0 with no salaried A/P row → `verify-load-to-cash-chain` LINK 1 red on every PR. Post the salaried week through the salaried path (no fake per-load bill). LINK 1 → PASS.
- **E5** Capacity migration orphan FKs `email_queue_id`, `external_posting_id` (`verify-orphan-fk-inventory` red on main). Real FKs or a documented exemption with the reason.
- Register rows 73, 75, 82, 86, 93, 95: re-measure; each either DONE with proof or fixed in the engine.

### CC-2 — banking / A-R / fuel engines
- Rows 76 (0 of 85 closed settlements marked paid), 77 (customer payments / Faro purchases never applied), 78 (1090 Undeposited $170,210.48), 97 (BofA reconciliation drift), 99 + 113 (Plaid pending lines never replaced by posted). Re-measure each live; fix the matcher/applier, never a hand JE.
- Rows 104–108 (fuel cards 0 assignments, Relay 257 fills no driver, Loves prices never synced, PM readings unavailable).
- Dependabot #28667 (plaid major) #28983 #28984: local `npm ci` + both tsc + vitest of every importer; merge on pass or close with the measured break.

### CC-3 — design boards, built fully
- Row 18 + rows 40–43: Reports Home, Trial balance viewer, Customers Home, Vendors Home — implemented **exactly** as their v3 boards with live engine numbers (no CHROME-ONLY, no LAYERED).
- Rows 80, 100, 109; the all-uppercase driver-name rows (122, 141, 145, 150, 155, 157, 163): one name formatter at the source, not per page.

### CURSOR — settlements / fuel / factoring boards
- Rows 39, 44, 45, 46, 49, 53, 54, 55, 56, 8: every board verdict LAYERED / CHROME-ONLY / PARTIAL → rebuilt to the board with engine numbers. Stop new MoneyCell residual sweeps until these rows close.
- Date rows 123, 144, 148, 149, 162: one date formatter (MM/DD/YYYY), no per-page fixes.

### CODEX — data engines
- Row 81 (222,587 HOS duty events on merged driver shells — re-home through the driver-merge engine), row 110 (Angel Sosa shows no truck while on T156), row 112 (legal.matters 18 test rows counted as open), row 108 (PM readings) with CC-2.
- Then the guard census: authored-but-unwired guards → wired or deleted with the reason.

### CLAUDE-LEAD — verification (owner 6:03 AM ET: there is no Cascade seat — seats are CC-1, CC-2, CC-3, Codex, Cursor + Lead)
- Re-measure every register row marked CODED / MERGED-UNVERIFIED / PARTIAL against prod and the live screen; update `LEAD-PENDING-REGISTER.md` with the live proof or move it back to OPEN with the measured gap.

## 3. Out of scope for every seat
TRANSPORTATION / TRUCKING frozen. The TIO Perfumes desk (`/perfume`, `perfume.*`, `apps/*/perfume`) is Claude-Lead's — do not touch.

## ROUND 8.14b — 11-12-2026 6:10 AM ET (11:10Z) — after the Mac restart
The Mac restarted at ~10:54Z (uptime 9 min at 11:03Z); sessions were relaunched at 11:03Z (cc1/cc2/cc3 tmux up; Codex and Cursor apps up). Round 8.14 stands unchanged; pick up exactly where you were.
- Measured 11:05Z in the tmux panes: CC-1 committing E4 (13700 salaried week); CC-2 running frontend tsc -b; CC-3 running the CSA hazmat source-integrity guard.
- Main: bcd34f04ff went red (security-audit: TS2353 in PerfumeListsPanel.tsx — Lead's own). Fixed by Lead in #29005 (8680a85eef). Pull main before you push.
- There is NO Cascade seat. Its verification row is Claude-Lead's.
- Every frontend push: run `npx tsc -b` in apps/frontend (the build), not only `tsc -p` — that gap is what broke main this morning.

## ROUND 8.15 — 11-12-2026 6:58 AM CT (12:58Z) — OVERHAUL LAW: full wiring, reverse-routed, replace — never layer
Owner order 2026-11-12 5:40 AM CT (verbatim):
> "make sure all coders code correctly build engines complete designs, fully and completely not just shell, remember this is practically an overhaul. so full wiring, reverse routed etc. not on top of previous design."

Measured 11:41Z: main 92604c5bc2 = prod (healthz git_sha, version.json) · main checks green · CC-1 on E3 alias-shadow guard · CC-2 introspecting schema for rows 76–78 · CC-3 committing CSA unavailable≠failure · CODEX last merge 05:09Z (6h32m idle) · CURSOR last merge 10:47Z (#29002, idle since the restart).

Every PR from now on closes a row only if ALL FIVE hold (put the five lines in the PR body):
1. **ENGINE** — the number comes from the canonical engine/reader (write left: driver_finance, mdata.qbo_*, banking, maintenance, mdata.vendors; never the right-hand tables). Name the function.
2. **FORWARD ROUTE** — every number, row and chip on the screen opens its source record (load, bill, JE, bank line, settlement, unit, driver). Name the href for each column.
3. **REVERSE ROUTE** — the source record links back to every screen/total that uses it (bill → load → settlement → JE → bank match, and back). A one-way drill is half-wired = not done. List the back-links added.
4. **REPLACE, NOT LAYER** — the touched page is rebuilt to its board in `docs/design/v3/` (name the board file). The old layout, old strip, old card is removed in the same PR. A new section stacked on an old page = LAYERED = not done.
5. **LIVE PROOF** — after deploy: the live query (USMCA, `SET LOCAL app.bypass_rls='lucia'`) and the screen number match to the cent; click-through from the number to the record and back, pasted.

Deadline unchanged: 23:00Z (5:00 PM CT). Lead re-measures each DONE line against these five; any missing line → row back to OPEN and the seat's next row is taken by Lead.
CODEX and CURSOR: resume now on your 8.14 rows under this law.

## ROUND 8.15b — 11-12-2026 8:12 AM CT (14:12Z) — OWNER RULING: v3 boards are built COMPLETELY (unblocks Cursor)
Cursor NOW 13:50Z: Settlements Open/Closed exact-board columns + Fuel Home unlayer BLOCKED by 6 additive guards
(tours-columns-visible, module-one-readout, margin-pct-separate, fuel-home-dashboard-wired, bank-f10 `to=` string, relay-history-import).
Owner answer 2026-11-12 8:10 AM CT (verbatim):
> "the new designs must be compeltely built use logic."

Ruling for those three pages (and every later v3 rebuild):
1. The page is rebuilt to its board in `docs/design/v3/` exactly. Old layout pieces that are not on the board come OFF the page.
2. "Use logic" = nothing the old page DID is lost. Map every old element before deleting it: (a) on the board → its board slot; (b) not on the board but a real function (Relay history import, bank link, margin %) → its logical home (page action menu, the module it belongs to, or the detail drawer); (c) pure duplicate readout → removed. Put the 3-column map (old element · new place · why) in the PR body.
3. The PR body carries `OWNER-REMOVE: "the new designs must be compeltely built use logic." 2026-11-12` (verify-additive-only escape hatch) and regenerates `docs/guards/additive-baseline.json` in the same PR.
4. The six guards are RE-POINTED, not deleted: each asserts the element's NEW place (board slot or new home). A guard that pinned a pure duplicate is retired with the map line as its reason. CC-1 reviews the re-pointed guards on the PR within 30 min; no silence-merge of a guard change.
5. Routes, sidebar entries, data and engines are never removed by this ruling.
Cursor: start now on Settlements Open/Closed, then Fuel Home. Deadline 23:00Z unchanged.

## ROUND 8.16 — 11-12-2026 9:36 AM CT (15:36Z) — OWNER ORDER: full builds, replace/remove old code allowed, FAST 4-MINUTE MERGE, no drift
Owner, verbatim:
- 9:29 AM CT: "perfect, fix all, make sure all prs are merged immediately eventhoguh they are not yours, make sure all coders are instructed to fully and completely build engines and design, not shell, full build wiring etc, its ok to replace old code and remove etc. they cannot and you cannot drift or deviate."
- 9:30 AM CT: "all if tested locally and pass, must follow fastr merge law, the fast 4 minute wekend merge method."

Law for every seat from now (stacks on 8.14, 8.15, 8.15b):
1. FULL BUILD ONLY. Engine (canonical writer/reader) + complete v3 design + full wiring forward AND reverse. A shell, a placeholder, a stacked section or a "coming soon" is NOT a row closed.
2. REPLACE / REMOVE IS ALLOWED. Old code, old layout, old duplicate components that the full build supersedes are deleted in the same PR (map old → new in the PR body; routes/sidebar/data/engines keep working). Guards that pinned the old code are re-pointed in the same PR.
3. FAST 4-MINUTE MERGE (Round 8.6 law). Local gate green (tsc -b for frontend, vitest of the touched module, the guard you touched + --selftest) → push → open PR → merge within 4 minutes. A CI red that is ALSO red on main or is a shared-DB flake (deadlock / ordering) does not block; say so in one PR comment and merge. A red your diff caused is fixed before anything else.
4. EVERY OPEN PR GETS MERGED. A PR that is behind/conflicting is merged-from-main by its owner and merged; a PR whose change is already on main is closed with the SHA that superseded it. No PR sits open more than 30 minutes.
5. NO DRIFT. Work only your 8.14 rows; no new side projects; DONE lines in the measured format (row · PR · merge SHA · guard + selftest · live query · CT time).
CC-1 now: #28786 (280 behind, dirty) and #28673 (310 behind, dirty) — merge main in and merge, or close with the superseding SHA, by 16:15Z (10:15 AM CT).
Deadline for all rows unchanged: 23:00Z (5:00 PM CT).
