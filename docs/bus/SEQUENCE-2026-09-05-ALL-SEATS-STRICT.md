# SEQUENCE LAW 2026-09-05 — ALL SEATS · STRICT NUMBERED ORDER · LEAD-CONTROLLED
**Status: BINDING.** Owner 2026-09-05: *"Number the sequences … strict control … so they continue working in that order."*
Supersedes SEQUENCE-2026-09-04 where the two differ. Claude (lead loop, owner-authorized) reads every
OUTBOX every 20 minutes, marks this board, and rewrites each INBOX TOP. Cursor deploys and enforces.

## CONTROL RULES
1. A seat works ONLY the step marked `→` in its row. It may not touch step N+1 until `SEAT | STEP-N DONE | <sha> | <proof>` is on its OUTBOX and the lead has marked it `✔` here.
2. Posting work on a later step = `ORDER VIOLATION` — lead reverts it to N; the work is not merged into the board until N is done.
3. A blocked step is declared in writing on the OUTBOX (`STEP-N BLOCKED | <exact blocker> | <who unblocks>`). Only then may the seat take the next UNGATED step in its own row — never another seat's.
4. Cross-seat gates are hard stops (table below). Nobody closes a pre-settlement. Nobody but Cursor deploys. Nobody POSTs Book Load as a probe. USMCA only.
5. Full order per seat: `docs/bus/09-05-2026-<Seat>-*.md`. This board is the index; the order file is the text.

## VERDICT FORMAT LAW — owner order 2026-09-05 02:50Z. PERMANENT. APPLIES TO EVERY SEAT, EVERY STEP.
Owner: *"All coders should have them in that format from now on, so this shit doesn't happen again."*
Every step the lead hands a seat, and every DONE a seat posts back, carries ALL of the following or it is rejected:
1. **MEASURED, NOT DESCRIBED.** The defect and the proof are numbers read from the live screen (getComputedStyle / getBoundingClientRect on app.ih35dispatch.com, the deployed sha named) or the live DB (Neon, bypass_rls=lucia, USMCA) or the source file:line on tip. "Looks bold", "seems truncated", "should be fine" are not evidence.
2. **THE EXACT TARGET.** File:line or component, the rule it violates (law doc §, owner ruling date, spec part), and the exact value required (e.g. th font-weight 400, td border-right 1px --th-border, rate 0.0000, column sizes to label, nowrap on money cells).
3. **ONE PR + ONE GUARD, NAMED.** The guard asserts the measured value and is wired in scripts/verify-steps/ in the same PR. Merged is not done; deployed + re-measured is done.
4. **A HARD DEADLINE (UTC)** on the step, sized to the work (30 min – 2 h), written on the INBOX and the board.
5. **THE SURRENDER RULE.** The seat that takes the surface if the deadline is missed is named in advance. A missed deadline is not renegotiated: the lead rewrites both INBOXes at the deadline and the work moves. The surrendering seat keeps its money/GL lane only.
6. **THE DONE LINE** is re-measurable: `SEAT | STEP-N DONE | <sha> | <live sha> | <the same measurements, now passing> | NEXT N+1`. The lead re-measures before marking ✔.
Silence past a deadline = surrender. "Blocked" must quote the blocker and name who unblocks it, in writing, before the deadline.

## DESIGN CONTRACT (owner 03:05Z) · `docs/design/DESIGN-CONTRACT-LOAD-COSTS-BOARD-2026-09-05.md` + reference HTML in `docs/design/reference/`
No design instruction ships without reference file + exact values + computed-style guard. th weight = 700 (correction). Cursor L.1 = copy the contract; CC-2 encodes it in tokens + ratchet (05:00Z).

## SETTLEMENT FEED — OWNER PRIORITY #1 (02:58Z) · `docs/bus/ORDER-2026-09-05-SETTLEMENT-FEED-PRIORITY.md`
CC-1 12 · CC-3 8 · Codex 11 · owner 6. Live UI only, is_sample_data=false, addresses only, never close, stop at first refusal. Cursor fixes every FEED BLOCKED on its surface ahead of L.3.

## DISPATCH (owner 04:08Z) · `docs/bus/ORDER-2026-09-05-CURSOR-IS-DISPATCHER.md`
CC-1/CC-3/Codex/Cascade do not poll the bus. Cursor wakes them: D.3 hand wakes now (04:20Z) · D.1 wake-seat.sh (04:40Z) · D.2 lead-dispatch-loop every 10 min (05:00Z). A seat silent 15 min after its INBOX changed = Cursor wakes it. The owner pastes nothing.

## CROSS-SEAT GATES
| Gate | Blocks | Opens when |
|---|---|---|
| CC-1 STEP 0 (CC-3 migrations applied) | CC-3 3.3–3.5 · Cursor C.6 · CC-1 1.11 | CC-1 sha on OUTBOX-CC-1 (Cursor applies under C.3 if CC-1 silent by 02:30Z) |
| CC-3 3.2b (flap fix merged) | any Samsara projection or Loves import | CC-3 STEP-3.2b DONE |
| CC-3 3.5 (guards green) | CC-1 1.11 actual miles · Cursor C.6 push-back | CC-3 STEP-3.5 DONE |
| CC-3 API shapes published | Cursor driver-prompt UI + live-progress board | shapes on OUTBOX-CC-3 |
| Cursor API deploy | live proof of every backend merge since 1fa5201 | healthz sha on OUTBOX-CURSOR |
| Owner closes pre-settlements | everyone | owner says so |

## THE BOARD (lead marks ✔ / → / ✖ / ⛔)
### CURSOR — lead · deploys · `docs/bus/09-05-2026-Cursor-LEAD-DEPLOY-BUS-AND-DISPATCH-FINISH.md`
| # | Step | Mark |
|---|---|---|
| C.1 | Deploy API to tip; healthz sha to OUTBOX | ✔ 683717b live 02:05Z |
| C.2 | Census each 20-min tick; STATUS-NOW step numbers; ORDER VIOLATION calls | standing |
| C.3 | Apply migration #4 | ✔ b69fbd24 — geofence_vehicle_state verified on Neon 04:18Z |
| L.1 | LOAD COSTS BOARD live defects | PARTIAL #20462 (lead re-measured FE 3251ee3 03:06Z: td rules ✔ nowrap ✔ rate ✔ Booked ✔ pills ✔ · th still 55px/6 truncated ✖ · th weight 400 ✖ (contract 700) · blank instead of — ✖) |
| L.1b | contract values | 11/13 ✔ on 949c025 (re-measured 03:32Z) · truncation ✖ (root cause: table min-width 0 + wrapper overflow visible → 55px cols) · 4 empty cells not "—" ✖ |
| L.1c | min-width | PARTIAL #20470 (03:54Z re-measure FE 0d45afd: min-width 1660 ✔ but table-fixed → 20×83px equal, SECTION overflow-hidden clips 5 columns, th not sticky, 4 empties) |
| L.1d | scroller ✔ · dashes ✔ (2795482) · table-layout STILL fixed (20×83px), Deadhead Pay overflows, th not sticky | PARTIAL |
| L.1d-final | table-layout auto · sticky th + Load col · rendered-page guard. Deadline 04:45Z. Surrender: CC-2 | → |
| L.3 | TAB ROW Costs·Expenses·Bills·Fuel advances·Broker advances·Driver pay·R&M·Documents wiring existing list components (owner: "I still do not see the rest of the tabs"). MOVED AHEAD OF L.2. Deadline 06:00Z. Surrender: Cascade | next |
| L.4 | CURSOR | RESTORE 33-column dispatch Table (BRD-25 hid 24; HOS/On-time/Samsara ETA); List = 18 cols; gear visible; guard dispatch-table-33-columns.spec.ts | **06:00Z** | CC-2 at 06:05Z | OPEN (owner 05:05Z) |
| L.2 | Costs-tab register — owner records an expense on 13508. Deadline 08:00Z (after L.3) | |

| C.4 | Unit picker excludes Sold/deactivated/non-entity units (U-156-provisional) + guard | ✔ #20436 |
| C.5 | Dispatch on a draft shows the 400 reason on screen | ✔ fe2e8976 |
| C.6 | 09-04 dispatch cleanliness leftovers (Kanban width+drag, Assignment draggable cols, Round Trips missing trips, Detention one-liner) + reconcile BRD-01..18/22/24 status on this board (they are your surface) | → |
| C.7 | Driver Instruction Sheet per FINAL-No-Pay render; house PDF template guard | |
| C.8 | Tour-close = Laredo delivery OR yard geofence | |
| C.9 | Book Load → Samsara push-back — ⛔ until CC-3 3.6 | ⛔ |
| C.10 | Driver prompt UI + live-progress board — ⛔ until CC-3 shapes | ⛔ |

### CC-1 — money · `docs/bus/09-05-2026-Claude-Coder-1-LOAD-COSTS-COMPLETE-VERTICAL-Updated.md`
| # | Step | Mark |
|---|---|---|
| 1.0 | Apply CC-3 migration drafts (batch) on Neon; sha to both OUTBOXes | ✔ 3c3c4321 (Neon-verified) |
| M.1 | Apply migration #4 | ✖ MISSED 03:40Z → transferred to Cursor C.3 (04:20Z) |
| 1.3a | TRANSFERRED TO CURSOR L.1 (owner 03:10Z) | ✖ stood down |
| M.2 | Durable draft advance, backend only + 400 reason body. Deadline 04:30Z | next |
| 1.2 | CoGS picker + fuel by role + operating_bank by role (#20425 #20426) | ✔ |
| 1.3/1.4 | → Cursor L.2 / L.3 | ✖ transferred |
| M.3 | → CC-3 (owner 02:50Z) | ✖ transferred |
| M.4a | FEED: 5753, 5760–5765, 5767–5771 (12) via live UI; first DONE/BLOCKED 04:00Z; no line by 04:20Z = slice re-split to CC-3 + Codex via real UI; never close; hands off 5766/5772/5776/5780/5783/5784 | | — **04:50Z OWNER CORRECTION: SEED script, not UI. PR 06:30Z · live 08:00Z**
| M.5 | Three-mile schema + CPM; 1.11 actual miles ⛔ until CC-3 3.5 | |

### CC-2 — design + verify-live · `docs/bus/09-05-2026-Claude-Coder-2-DISPATCH-DESIGN-SWEEP-THEN-ACC-DEFECTS.md`
| # | Step | Mark |
|---|---|---|
| 2.0 | ACK + retro STEP-2.1 DONE (#20397) | ✔ |
| 2.1 | Tokens landed | ✔ |
| 2.2 | Encode DESIGN CONTRACT values in tokens.ts + ratchet (th 700/#EEF2F6/#C7D2DC rules, td #D8DEE6 rules, zebra, tints, KPI 93px), then dispatch sweep. Deadline 05:00Z | → |
| 2.3 | J1 to 0/0 + GLB-05/07/09/10 | |
| 2.4+ | ACC-01.. one vertical each, USMCA-filtered | |
| V | Standing: verify-live every Cursor deploy (#20425/#20426 first) | standing |

### CC-3 — MONEY CODER #2 (owner 02:50Z) + telematics · `docs/bus/09-05-2026-Claude-Coder-3-GEOFENCE-ENGINE-REBUILD-LOVES-604-AND-ARRIVAL-ALERT-CHAIN-Updated.md`
| # | Step | Mark |
|---|---|---|
| 3.1 | Address count wiring | ✔ #20411 |
| 3.2a | samsara_addresses draft handed | ✔ #20412 |
| 3.2b | Engine flap fix code + guards + migration #4 drafted + TEST geofence archived | ✔ #20447, live in 7e852b2 (lead re-measured). API shapes still owed inside 3.3 |
| 3.3 | Samsara import/projection → TRANSFERRED TO CODEX X.9 (owner 02:50Z) | ✖ transferred |
| M.3 | PRE-SETTLEMENT BACKEND (from CC-1): 404→200, escrow 2500¢ per load conditional, board+drop read-model endpoints, shapes to Cursor. After M.4b. Deadline 07:00Z. Surrender: CC-1 | next | — **04:50Z OWNER CORRECTION: SEED script, not UI. PR 06:30Z · live 08:00Z**
| M.4b | FEED NOW (owner 02:58Z): 5773–5775, 5777–5779, 5781–5782 (8) via live UI; first DONE/BLOCKED 04:00Z; slice 10:00Z — BEFORE M.3 | → |
| 3.4 | Match proximity+name, collision report | |
| 3.5 | Three guards green | |
| 3.6 | ACK push-back contract | |
| 3.7–3.9 | Telematics defects (dup latest_position, NULL geocode, T144) | |
| 3.10–3.12 | DRV-03 / samsara links / accident VOID FE — post retro checkoffs | |
| 3.13 | Loves 604 import (dry-run → apply after §7.2 flap proof) | ⛔ |
| 3.14 | Alert chain stages 1–4 + live-progress API | |

### CODEX — maintenance · `docs/bus/09-05-2026-Codex-IN-SHOP-FEED-FLEET-QUEUE-BORDER-CONTRACT.md`
| # | Step | Mark |
|---|---|---|
| X.1 | Units held in maintenance report | ✔ (0 held) |
| X.2 | In-shop feed endpoint + shape | ✔ #20430 (deploy pending) |
| X.3 | unit_number on every units-without-load row | ✔ |
| X.4 | FLT-01 → FLT-02 → FLT-04 → FLT-10 | ✔ (FLT-10 render = Cascade) |
| X.5 | Border contract endpoint to Cursor | ✔ #20437 |
| X.6 | Live-verify X.2/X.3/X.5 on live API; paste raw JSON. Deadline 03:20Z | → |
| X.F | FEED NOW (owner 02:58Z): 5785–5795 (11) via live UI; first DONE/BLOCKED 04:00Z; slice 10:00Z — after X.6 | next | — **04:50Z OWNER CORRECTION: SEED script, not UI; repo-law BLOCKED line CLOSED. PR 06:30Z · live 08:00Z**
| X.9 | SAMSARA IMPORT/PROJECTION service (from CC-3 3.3): after X.F. Deadline 12:00Z. Surrender: CC-3 | |
| X.7 | Design law on maintenance surface, one guarded PR | |
| X.8 | WO create/edit comboboxes + unit-picker rule + ≥$7,000 role routing on screen | |

### CASCADE — lists/reports · `docs/bus/09-05-2026-Cascade-LAW-MIRROR-THEN-LISTS-AND-REPORTS.md`
| # | Step | Mark |
|---|---|---|
| L | docs/LAW.md = 09-05 revision + MIRROR header; squash-merge | ✔ bc099ea7 |
| K.0 | ACK; push 65762353 or declare dead | ✔ (65762353 declared dead) — OUTBOX gitignore defect to fix |
| K.4 | BRD-19 planners: name / action / available columns; boxes off the calendar | → |
| K.5 | BRD-20 calendar dates MMM-DD, column lines | |
| K.6 | BRD-21 active drivers only | |
| K.7 | BRD-23 planner filters/ranges | |
| K.8+ | Design-law sweep pages/lists/** + pages/reports/** | |

## LEAD LOG
- 05:05Z OWNER: cannot find the dispatch view with HOS/location/on-time (16-20+ cols). Live-measured Table mode = 9 of 33 columns, 0 chooser buttons — BRD-25 #20242. Cursor L.4 issued: restore 33 (Table) / 18 (List), gear, rendered guard, 06:00Z → CC-2.
- 04:50Z OWNER: feed is a SEED (scripts/seed-settlements-<seat>.ts via service layer, real data, single-stop only; owner hands 5766/5772/5776/5780/5783/5784 + anything he already entered). Lead's UI-only rule struck in ORDER file, 09-04 feed doc and AGENTS.md L13 amended. CC-1 5753 login-BLOCKED and Codex 5785 repo-law-BLOCKED lines CLOSED. (newest first)
- 04:22Z — C.3 ✔ verified. L.1d partial (scroller+dashes ✔; table-fixed 83px, th not sticky) → L.1d-final 04:45Z. Owner: tabs not visible → L.3 moved ahead of L.2 (06:00Z), L.2 → 08:00Z. D.3 wakes still not posted; feed 0 rows.
- 04:08Z — OWNER: Cursor is the dispatcher — wakes CC-1/CC-3/Codex/Cascade sessions with their INBOX tops (D.1–D.4); root cause of the silent feed = seats are prompt-driven and nobody prompted them.
- 03:58Z — L.1c re-measured: table-fixed equal 83px + SECTION clip → L.1d (04:30Z final, surrender CC-2). CC-1 missed M.1 → Cursor C.3 applies migration #4 (04:20Z). Feed: still 1 load / 0 expenses on Neon; 04:00Z deadline imminent, no seeder has posted.
- 03:32Z — Cursor L.1b 949c025 re-measured 11/13; truncation root cause pinned (min-width 0, overflow visible); L.1c issued. M.1 vehicle_state still absent (03:40Z). Feed: no rows yet (04:00Z).
- 03:06Z — Cursor L.1 #20462 re-measured: 5/7 pass; truncation (55px columns) NOT fixed, guard measured the wrong thing; th 400 vs contract 700; blanks not dashes → L.1b, deadline 04:15Z unchanged. M.1 (vehicle_state) still absent; feed lines none yet.
- 03:05Z — OWNER: coders cannot reproduce the approved render → DESIGN CONTRACT: reference HTML + exact CSS values + computed-style guard in repo; th weight corrected to 700 (reference); prose specs banned.
- 02:58Z — OWNER: settlement feed is priority #1 for every money-capable seat, no gate. Split CC-1 12 / CC-3 8 / Codex 11 / owner 6. ORDER-2026-09-05-SETTLEMENT-FEED-PRIORITY.md on the bus.
- 02:50Z (real clock; earlier labels 02:45–03:10Z ran ~25 min ahead) — OWNER: CC-1 unreliable → CC-3 is money coder #2 (M.3 pre-settlement backend, M.4b feed half); Codex takes Samsara import as X.9; both were idle >10 min.
- 03:10Z — OWNER: Cursor takes Load Costs (board L.1, register L.2, tabs L.3); CC-1 stands down from UI → M.1 migration #4 (03:40Z), M.2 draft backend, M.3 pre-settlement backend, M.4 feed, M.5 mileage.
- 03:00Z — CC-3 3.2b ✔ verified (code live in 7e852b2, TEST geofence archived on Neon); geofence_vehicle_state still absent → migration #4 = CC-1 0b after 1.3a, Cursor fallback. CC-3 → 3.3 code, deadline 04:30Z. VERDICT FORMAT LAW merged c9d81dcf (.cursor rule + LAW doc + board).
- 02:45Z — Owner viewed the live board; lead measured it in the owner's Chrome (61f1967). CC-1 → 1.3a with a 03:45Z deadline; miss = Cursor takes the board + Costs tab (owner order). Codex → X.6/X.7/X.8.
- 02:25Z — Cascade L ✔ bc099ea7 (LAW.md 477 lines), K.0 ✔; BRD rows split: planners (19/20/21/23) = Cascade K.4–K.7, dispatch-board rows = Cursor reconciles. Cascade OUTBOX local-ignore defect ordered fixed.
- 02:10Z — Cursor C.1/C.4/C.5 ✔ (683717b live). CC-1 1.0 ✔ Neon-verified; → 1.1 remainder then 1.3 Load Costs register (owner: no excuses). Codex X.3–X.5 ✔ → X.6/X.7. CC-2 2.0 ✔ → V + 2.2. CC-3 and Cascade: ORDER WARNING — silent since 01:16Z.
- 02:00Z — board created. CC-1 skipped 1.0; reverted to 1.0. Codex X.2 accepted. Cascade L stale copy rejected, current text supplied.
