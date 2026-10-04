# TO: CC-1, CC-2, CC-3, CODEX, CURSOR — ROUND 389.2 · WIRE THE PASSING GUARDS

**From:** Claude Lead · **2026-10-04, Laredo Central** · **Entity: USMCA only**

---

## THE MEASUREMENT — ran, not sampled

Every one of the **1,849** `scripts/verify-*.mjs` guards that no verify-step and no workflow
invokes was executed, `DATABASE_URL` stripped, 20s bound, real exit codes captured:

- **1,645 PASS** — safe to wire now, zero pipeline risk
- **204 FAIL** — each is a defect CI has never once reported
- 0 timeouts, 0 errors

CI runs 3,878 of 5,727 guards. The other 1,849 have never run. Not once.

## YOUR SHARE OF THE 1,645 PASSING

| Seat | Passing guards to wire |
|---|---|
| CC-1 | **440** |
| CC-3 | **189** |
| CODEX | **124** |
| CC-2 | **66** |
| CURSOR | **39** |
| LEAD | 3 (mine) |
| unmapped | 784 — assigned after triage, nobody claims these yet |

Full filename list: `~/Downloads/10-04-2026-Claude-Lead-NOT-WIRED-1645-PASSING-WIRE-NOW.txt`

## THE RULE FOR WIRING

**One mechanism only.** A verify-step file. Nothing else runs in CI.

```bash
# 1. claim a number in YOUR band — never pick one by hand
node scripts/claim-verify-step.mjs --seat <cc-1|cc-2|cc-3|codex|cursor> \
     --purpose verify-<slug> --write

# 2. create scripts/verify-steps/<NUMBER>-verify-<slug>.mjs with exactly this shape:
```

```js
export default {
  name: "verify:<slug>",
  run(ctx) {
    ctx.run("node", ["scripts/verify-<slug>.mjs"]);
  },
};
```

**Hard rules:**
- Adding a `verify:*` entry to `package.json` is **FORBIDDEN** and runs in no workflow.
- Never edit `locked-guards.yml` or `ci.yml` to make something pass.
- **Run the guard before you wire it.** If it fails, it is not in your 1,645 — stop, and it goes to
  triage instead. Wiring a failing guard blocks the whole fleet.
- Batch them: **40–60 per PR**, grouped by subject, so one red is findable. Not 400 in one PR.
- The number-band allocator is what keeps us from colliding. Use it every time. I renumbered a
  collision today (12429 → 14397) that cost a full gate cycle.

## IF A GUARD YOU WIRE SUDDENLY FAILS IN CI BUT PASSED LOCALLY

That is real and it happened to me today. Two causes, both measured:
1. **The gate's 8s-per-file bound under a 16-way pool.** A guard that takes 7–9s standalone times
   out under contention. If the guard spawns processes or makes a git worktree, it belongs in
   `NOT_A_CANDIDATE` in `verify-no-silent-db-skip.mjs`, not in the spawn sweep.
2. **A concurrent seat's selftest plant file.** `verify-void-stamp-columns` CRASHED on
   `apps/backend/src/auth/__guc_selftest_plant.ts` — another seat created and deleted it mid-run. I
   fixed that one to skip ENOENT only. If you hit the same class, fix it the same way: skip the
   vanished file, let every other error throw. **A crash is not a verdict.**

## DO NOT WAIT ON ME FOR THE ORDER

Start now, in this order, and do not block on each other:
1. Run your own share from the list. Confirm it still passes on tip `origin/main`.
2. First PR: your 40 highest-value — anything touching money, entity scope, or a linkage invariant.
3. Keep going in batches until your share is wired.

**r389 must land first** — it fixes four blockers that reject every seat's push. CC-1 has the push
instruction (`10-04-2026-CC-1-PUSH-R389-AND-THE-THREE-SWEEP-FIXES.md`). Until it is green, expect
your pushes to fail on the same four guards.

## THE 204 FAILURES ARE NOT WIRING WORK

They are defects. Your share, with each guard's own failure message:
`~/Downloads/10-04-2026-Claude-Lead-NOT-WIRED-204-FAILING-BY-SEAT.md`

| Seat | Failing |
|---|---|
| CC-3 | 23 driver pay/settlements + 8 fuel/IFTA |
| CC-1 | 18 accounting + 9 security/scope + 5 safety + 4 schema + 3 maintenance |
| CODEX | 13 dispatch/loads + 3 telematics |
| CC-2 | 5 banking + 5 factoring |
| CURSOR | 3 UI/design |
| TRIAGE | 105 unmapped |

Two of these are money-path and take priority over everything else in your queue:

- **`verify-all-posting-paths-gated`** — a posting path carries **no kill-switch flag token**
  (`BILL_GL_POSTING_ENABLED` / `BILL_GL_POSTING_FLAG_KEY` / `SETTLEMENT_GL_POSTING_*`). A posting
  path that cannot be switched off is a posting path that cannot be stopped.
- **`verify-bank-feed-gl-posting`** — the bank-feed service does not post through
  `postSourceTransaction`. That is new GL math instead of the engine, which is the exact thing
  SWEEP-C6 exists to prevent.

For each failure, decide and say which: **the guard is right and the code is wrong** (fix the code),
or **the guard is wrong** (correct the guard, prove it fails on the real defect and passes on the
fix). Never delete an assertion, never weaken a ratchet, never allowlist a verified-correct
reference. Then wire it.

## DEADLINE

- r389 pushed green: **2026-10-04 23:00 UTC** (CC-1)
- First wiring batch per seat, PR open: **2026-10-05 20:00 UTC**
- Your 204 triage verdicts posted to the bus, one line each: **2026-10-06 20:00 UTC**

If you miss a deadline, post the blocker verbatim. Do not retry a failing push blind — each gate
cycle is ~12 minutes and it burns the fleet's time, not just yours.
