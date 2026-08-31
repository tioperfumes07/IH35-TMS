# OPERATING MODEL — HOW WE WORK FORWARD (owner-locked 2026-08-31)

Supersedes per-task assignment, LEAD-TICK, census, and wake commits.
Owner directive: every coder produces. No waiting. No bottleneck.

## 0. THE RULE THAT REPLACES EVERYTHING

Each seat OWNS a lane and a queue file `docs/bus/QUEUE-<SEAT>.md`.
Finish an item -> POP THE NEXT ONE FROM YOUR OWN QUEUE. Do not ask. Do not ACK.
Do not wait on another seat. GATES ARE ABOLISHED — the CC-1 gate cost five
seats three hours on 08-31. Blocked? Log ONE line, pop the next item.
A seat is idle ONLY if its queue is empty. That is the lead's failure to
refill, never the seat's failure to work.

## 1. THE LANES

| seat | lane | why |
|---|---|---|
| CC-1 | MONEY + WIRING | owner directive |
| CC-2 | VERIFY ONLY, creates nothing | sole writer of prod_verified (Hard Rule 5) |
| CC-3 | LIVE CHROME | proven: 3 catalog creates confirmed in Neon |
| DEVIN-A | LIVE CHROME | proven: booked loads, ran the bad-load test |
| CASCADE | MECHANICAL BUILD | Chrome-blocked repeatedly (#18785) — do not assign Chrome |
| CODEX | BANKING, 30-min capability check | banking half never started |
| DEVIN (plain) | SUSPENDED | zero output since 2026-08-29 |

## 2. THE QUEUES

### CC-1 — MONEY. In order.
0. FIX FIRST: driver_pay_rates `d55f85e4` (48c) and `ebe87013` (45c) were
   created 08-31 16:09/16:11 with **is_test_data = FALSE**. They are TEST
   rates flagged as REAL, on month-end day. A settlement computed from them
   posts real driver pay into the August close. Set the flag BEFORE settling.
   **Cursor Neon-UPDATE 08-31 ~16:25Z → both TRUE.** CC-1 still re-verifies
   before settle; do not skip item 0.
1. Settlement generation on a closed load. `L-20260831-0002` is
   completed_docs_received with ZERO settlement lines. settlement_lines has
   not moved since 08:06.
2. Driver-bill mint must carry the per-load rate (#18770 root cause).
3. Factoring batch uses the FACTOR PROFILE rates, not the hardcoded
   0.95 / 0.025 in batch.service.ts:179-180 vs the configured 97% / 1.5%.
4. GL verification: every chain JE balanced, is_sample_data correct.
CC-1 does not do UI, docs, or guards.

### DEVIN-A — LIVE CHROME
Load shapes; then Phase 7 bank matching.
HARD LIMIT: ONE batched bus commit per hour. 295 commits in 12h is the most
expensive habit in the system.

### CC-3 — LIVE CHROME
Multi-stop + expenses shape. Then bank-to-settlement match if Codex cannot.

### CASCADE — MECHANICAL
1. Navy subnav sweep: 178 routes, 87 modules, 3 done. Convert bespoke tab rows
   to `<NavyPageSubNav>`. One PR per module. EVERY commit states
   "navy subnav: X of 381" and the number must rise. Then the guard + selftest.
2. Driver pay codes + per-date layover. Additive steps first (catalog table,
   nullable columns) so nothing breaks a chain in flight.

### CODEX — BANKING
30-minute Chrome capability check. Then: expense -> bank match -> reconcile ->
**match a bank transaction to a settlement** (never done by anyone).
If Chrome fails: move to MECHANICAL, banking goes to CC-3.

### CC-2 — VERIFY
JE watch every 20 min. Unflagged August JE count must stay **236**.
Grade other seats' claims against Neon. Creates nothing. Judge CC-2 by the
236 holding and by its grades — NOT by commit count.

## 3. SPEED, MERGE, DEPLOY

- FAST-MERGE ~4 minutes per PR. Every seat ships its OWN PR.
- A PR may not merge until its own `build-typecheck` has **CONCLUDED** green.
  Queued is not green. Running is not green. 5+ bypasses already happened.
- A commit may not cite a GUARD or LIVE PROOF line for a file it does not
  contain. `git show --stat` must list it.
- Class defects: state **X of N** or the close is rejected. #18569 closed
  CLS-UI-SUBNAV-NOT-NAVY having converted **0 of 381**.
- DEPLOY: one per 5-10 PRs or per 10 minutes, whichever first. On a TIMER,
  never per-merge. Only the lead deploys. CC seats never trigger_deploy.
- AFTER EVERY DEPLOY CC-2 posts one line: healthz sha | migrations ok |
  JE-236 unchanged | chains still green. No line, no next deploy.

## 4. CURSOR'S JOB — FOUR THINGS ONLY
1. Refill a queue when it drops below 3 items.
2. Merge PRs.
3. Deploy on cadence.
4. Report to the owner hourly, 5 lines, in chat — NOT as a commit.
Abolished: per-task assignment, census, heartbeats, wake tickets, LEAD-TICK.

## 5. THE HOURLY REPORT — 5 LINES, NOTHING ELSE
1. chains complete (n of 6) and which shapes
2. chains broken and at which phase of the 47-check list
3. unflagged August JE count vs 236
4. settlement_lines count (stuck at 63 since 08:06 — this is the live blocker)
5. what is blocked on the owner
No merge counts. No bus volume. No census.

## 6. STANDING CONDITIONS — NOT PERMISSIONS TO REQUEST
- `is_sample_data = true` on the LOAD at book time. Every downstream read is
  `?? false`, so a missed hop silently posts REAL money. Any hop that posts
  unflagged: STOP that lane and file it.
- NO VOIDS on INV-2026-00049..00081 — real transactions, reconciled separately.
- NOBODY closes the August period. Owner only.
- USMCA only. Live Chrome, real UI. `live_load_number` never NULL.
- Reload + Neon is proof. A toast is not. A screenshot is not.

## 7. HOW WE KNOW IT IS WORKING

| metric | 08-31 | target |
|---|---|---|
| docs-only share of merges | 78% | under 25% |
| LEAD-TICK commits | 249 | 0 |
| docs/bus total lines | 30,721 | under 2,000 |
| seats idle behind a gate | 5 | 0 |
| settlement_lines | 63 (since 08:06) | rising |
| chains complete | 0 of 6 | rising |

If these do not move next shift, the problem is the orchestration, not the seats.
