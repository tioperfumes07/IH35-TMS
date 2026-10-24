# IH35-TMS LEAD HANDOFF — 10-23-2026 10:30 PM CT — READ ONCE, THEN WORK

## How to work (owner law, tonight)
- CODE-COMPLETE MODE (owner 9:40 PM): every register row coded + merged; NO Chrome/visual verification now; owner inspects
  pages at the end; then engines are verified. Deadline Sat 10-24 10:00 AM CT (15:00 UTC).
- Owner 9:50 PM: tiered models (cheap model for mechanical sweeps, top model only for money/engine logic); no wasted tokens;
  short direct replies: what I did · proof · what's next.
- Owner 9:50 PM: give your honest best recommendation; do not follow blindly; do not argue after he decides; no double work.
- Money never relaxes: writes through engines only, fork first, TB 0 before/after, tie-out test. Never delete a live
  (DATABASE_URL) check. Never --no-verify over a static red you caused. Live-data-only reds: OWNER-RULING-443.261 (push
  --no-verify with the gate log line in the PR body). USMCA only (5c854333-6ea5-4faa-af31-67cb272fef80); TRANSPORTATION and
  TRUCKING frozen. Never print/commit secrets; never open ~/Desktop/09-28-2026-IH35-MASTER-KEYS-ENVS-SINGLE-SOURCE-OF-TRUTH.md.
  Repo is PUBLIC (never commit the conversation register).
- Coder boxes: recipient-headed code block, saved ~/Downloads/MM-DD-YYYY-<Coder>-<Name>.md, appended to the bus, tmux nudge
  (text, then a separate C-m) for cc1/cc2/cc3; journal line in ~/Desktop/IH35-CLAUDE-JOURNAL.md. Central time.

## Where everything is
- Register (truth for all 224 rows): repo docs/bus/lead/LEAD-PENDING-REGISTER.xlsx + .md (merged #27443). Copy:
  ~/Downloads/10-23-2026-LEAD-PENDING-REGISTER-Updated.xlsx. 10:15 PM counts: 27 done-live, 16 merged-unverified,
  17 partial, ~150 open. Seat column = current owner.
- All 10-23 coder boxes: repo docs/bus/lead/boxes/2026-10-23/ (40 files) and ~/Downloads/10-23-2026-*.md.
- Bus: ~/IH35-LEAD-CHANNEL/2026-10-10-LEAD-TO-SEATS.md (Lead → seats, newest at bottom);
  ~/IH35-LEAD-CHANNEL/2026-10-10-SEATS-TO-LEAD.md (seats → Lead).
- Owner rulings tonight: docs/bus/lead/OWNER-RULING-443.288-EXPENSE-LOAD-CONFIRMED-BY-DISPATCH-OR-CLOSER.md (every expense
  load confirmed by a person; settlement close refuses unconfirmed; discount child follows its receipt).
- Designs: docs/design/v3/ (36 boards + Load History + 5 reports + V3-Modal-FuelAssignment popup standard, PR #27439).
  Owner's settlement document format: project doc OWNER-DECISIONS-CLOSED-AND-THIRTEEN-FEATURES-2026-09-02.md ("eight sections").
- Static reds split by seat: docs/bus/lead/MAIN-STATIC-REDS-443.290-BY-SEAT.md (#27407).
- Prod: Neon tiny-field-89581227 / br-fancy-credit-akjnd07a, reads need set local app.bypass_rls='lucia' (Neon_True is
  read-only; Neon write MCP gives fork/prod connection strings). Render backend srv-d7rpem7avr4c73fhp4n0; healthz
  https://ih35-tms.onrender.com/api/v1/healthz/shallow. The cloud container cannot reach Postgres (port blocked): run DB
  scripts from the Mac (Desktop_Commander). Mac worktrees ~/IH35-TMS-lead281/282/283 (node_modules: ~/IH35-TMS-claude).
  Push from Mac: `env -u DATABASE_URL git push`; PR via `gh api -X POST repos/tioperfumes07/IH35-TMS/pulls`, merge via
  `gh api -X PUT …/pulls/N/merge -f merge_method=squash`. Commit gate wants: FINDING/LANE/DOD-A..E/VERIFY-1..8/
  MODULE_PROGRESS (accounting 38 of 40, banking 19 of 20, factoring 9 of 10)/Live=…/ITEMS_TOUCHED/MIGRATE/ROOT CAUSE/FIX/
  GUARD/LIVE PROOF/REMAINING/SURFACE-BREACH-AUTHORIZED: <owner seat>.

## Lead's own open work (do first)
1. GATE: every seat's money gate fails ONLY on CC-1 443.292-F3 (verify-no-unauthorized-production-write: CC-1's ops
   scripts 2026-10-23-cc1-backfill-settlement-numbers-443292-A.mjs + -void-empty-settlements-443292-F.mjs write raw SQL, no
   owner-auth gate; box ~/Downloads/10-23-2026-CC1-443.292-F3-Ops-Scripts-Through-Engines.md). When CC-1 merges it, post
   "GATE GREEN" on the bus. Linkage guard PASSES in the gate now.
2. Push these 3 branches (all committed, tests green) once the gate is green:
   - ~/IH35-TMS-lead282 claude/lead-443-285-open-invoices-kpi-ar (row 200): Accounting Open invoices KPI = issued invoices
     only = GL 1100 $621,076.72 (was $624,076.72 incl. 1 proforma $3,000). Test 3/3, tsc 0.
   - ~/IH35-TMS-lead283 claude/lead-443-283-manual-opening-cash (rows 31–35, 89, 90, 211): opening cash = operating
     accounts only (BofA Plaid + Relay ledger) $25,533.37; 283b is_credit direction; 283c restores the approved AvP + Manual
     boards that Cursor #27390 reverted. 3 commits, guards + 7/7 tests, tsc 0.
   - ~/IH35-TMS-lead281 claude/lead-row98-factoring-kpi-units (row 98): Factoring KPI raw NUMERIC text + True cost from one
     source. Test 3/3, 33 factoring tests, tsc 0.
3. AUTH-453 (Dreamline discounts → card-credit documents, owner-approved 8:42 PM, expired 10:20 PM): prod 198 of 241 done,
   TB 0 (postings 7,883). Owner 9:58 PM: do NOT extend; finish everything else first, then ask the owner to renew and run
   `scripts/ops/2026-10-23-cc2-443-258-5-statement-discounts-to-card-credits.mts --apply` with BATCH=3 + OWNER_AUTH_ID
   (loop script ~/Downloads/lead-tmp/run453loop.sh retries deadlock/lock timeout; prod URL in ~/Downloads/lead-tmp/.prod,
   0600, never print). AUTH-454 (5 settlement headers) DONE on prod, TB 0.
4. Register upkeep: mark rows CODED as seats post "ROW n CODED · sha"; re-copy to Downloads; docs-only PRs.
5. Recommended to owner: start a fresh Lead session (this one is very long) — this file is the handoff.

## Assignments (443.297, by register row)
CC-1 (38): 66–73, 75, 79, 82, 85, 86, 89, 90, 93–95, 101, 122, 139, 141, 145, 146, 150, 163, 165, 166, 168, 172, 174, 176,
  212–217 + 443.292 A–F (settlement number at close 5852…, tour dates, week list status, escrow per load, deductions are not
  bill payments [218 rows $7,303.21], empty settlements) + F3 P0.
CC-2 (25): 12, 16, 21, 22, 27, 76–78, 83, 84, 97, 99, 104–107, 113, 115, 120, 124, 138, 201, 202, 204, 205 + 443.288-A
  (merged 5892782b30) /B (expense load_confirmation) + 443.296 fuel evidence (360 of 818 fills no station coords; parked-hold
  resolver; odometer at fill from telematics.vehicle_locations).
CC-3 (22): 5, 15, 18, 19, 40–43, 61, 62, 74, 80, 100, 109, 116, 117, 167, 173, 182, 193, 198, 221 + 443.294 override
  catalog/engine/button (steps 1–4a merged; replace all 67 free-text sites).
Cursor (77, owner pastes): 8, 9, 28, 37–39, 44–56, 102, 103, 114, 121–151 (its share), 161–196 (its share), 206, 209,
  218–220 + 443.288-C (confirmation queue), 443.293 (statement = settlement document; Close settlement button in Dispatch;
  Accounting tabs), 443.295 (popup standard sm 480/md 720/lg 960/xl 1280, default md; Fuel assignment redesign).
Codex (27, runs from the bus per 443.298): 6, 29, 58–60, 64, 81, 108, 110–112, 118, 119, 125, 152–160, 197, 199, 207, 210;
  filters PR (ready, ships on green); 443.291 guard consolidation (6,266 guards, 488 live; 316 slate copies → one check).
Lead: 3, 200, 203, 211 (+ took 31–35, 98 from Cursor).

## Facts measured tonight (do not re-measure)
- GL A/P 2000 = 126,443.92 = open bills; GL A/R 1100 = 621,076.72 = issued open invoices; TB 0.
- AvP actuals from operating bank: Oct income $208,031.56 / expense $205,270.54.
- Settlements: open headers period = creation day (UTC midnight → shows a day early); 82 numbered (max 5851), 12 not;
  escrow_ledger 58 rows, 0 with load, 2 with settlement; P-0123/P-0124 closed empty ($0, 0 lines).
- Modal.tsx falls back to 85% width; only xl capped; 140 of 155 popup files pass no size.
- T173 fill 10/19 3:32 PM Love's #237 Tallulah: truck parked there 3:09–4:05 PM, odo 438,489.5; station_lat null.
- verify:arch-design main CI red fixed by Lead #27422 (splat routes + V3 panel titles).
