# LEAD RULING — 2026-09-22 ROUND 40 · CC-2 LANE CROSS GRANTED + THE RELAY GUARD STAYS OUT OF THE GATE

Laredo Central 11:12 (16:12 UTC). Lead. Two rulings, both asked for by CC-2 in PR #22212.

---

## R-40.3-A — LANE CROSS GRANTED: `scripts/verify-relay-deposits-land-in-usmca.mjs`, CC-2 → CC-1's lane. **THE BLOCK WAS MY OWN ERROR.**

**Measured, not asserted.** `SEAT=CC-2 node scripts/money-pr-local-gate.mjs` on
`origin/cc2-round31-3-relay-amex` (`dc1f2af6db`), run by the Lead at 16:08 UTC, exit **1**:

```
[money-pr-local-gate] RUN scripts/verify-lane-ownership.mjs
LANE GUARD FAIL: CC-2 touched 1 file(s) outside its lane:
    scripts/verify-relay-deposits-land-in-usmca.mjs   -> owned by CC-1
money-pr-local-gate: FAIL — verify-lane-ownership (03b) rejected this branch BEFORE push.
```

Every other step in the gate passed. **This one file is the whole of the failure.**

**I named that file by exact filename as CC-2's required guard in his ROUND 31.1 box, and then my
own lane guard rejected him for building it.** The guard is correct and stays. The error is mine:
a box may not name a file in another seat's lane without the lane-cross ruling issued in the same
box. **Standing rule, effective now, applied to me first: when a Lead box names a
`scripts/verify-*.mjs` file for CC-2 or CC-3, the lane-cross ruling ships in that same box or the
box is defective.**

**GRANTED.** CC-2 re-runs with:

```
LANE_CROSS=2026-09-22-LEAD-RULING-ROUND-40-LANE-CROSS-RELAY-GUARD-AND-DO-NOT-WIRE.md SEAT=CC-2 \
  node scripts/money-pr-local-gate.mjs
```

and puts the identical `LANE-CROSS:` line in the PR body. Scope of this grant is **exactly one
file** — `scripts/verify-relay-deposits-land-in-usmca.mjs` — and nothing else in CC-1's lane.

---

## R-40.3-B — **DO NOT WIRE THE GUARD INTO `money-pr-local-gate.mjs`.** CC-2's instinct is RATIFIED.

CC-2 asked for a ruling rather than silently wiring it or silently leaving it unwired. That was the
right call and it is recorded as his.

**The ruling: it stays out of the gate.** The guard is red for a reason **no pull request can
fix** — USMCA has no Relay deposit feed at all; `integrations.relay_deposits` is filled only by a
one-shot manual CSV import, and closing it needs a human-exported CSV, not code. A merge gate that
is permanently red on an external-data gap does not stop bad merges; it makes every merge a manual
override, and a gate everyone overrides is the same as no gate. **Do not put a guard in the gate
whose red light no author can turn green.**

Where it goes instead, all three, none of them the gate:

1. **Runnable on demand.** `--selftest` stays. CC-2 confirmed it reads RED against today's real
   live state — that is the guard doing its job and it is kept exactly as built.
2. **Reconciling-item register** (Law 6), with the named closing document: **the human-exported
   Relay deposit CSV for USMCA.** Unresolved differences go in the register with a named closing
   document; they do not go in the gate and they are never netted away.
3. **`healthz` warning tier** is where a standing external-data gap belongs if it is to be watched
   continuously — the same tier that already carries `background_jobs.stale`. Not critical: a
   missing upstream feed is not a corrupt ledger.

**Relay deposit GL posting stays HOLD, unchanged.** The owner's own 2026-07-12 tracker HOLDs it
pending per-card classification of the 6 unclassified funding cards. CC-2 is right that a blanket
DR 1295 / CR 2500 would be substantively wrong — `2500` is the Amex liability and unrelated.
**Law 10: no new GL math. Nothing is posted to make a total agree.**

---

## R-40.3-C — CC-2's AMEX FIX IS ACCEPTED AS REAL WORK AND RECORDED AS HIS

He found that the merged `PATCH /accounts/:id/activate` (#22206) set only `is_active` and never
`visible` / `deactivated_at`, against a row carrying `deactivated_at` and the
`ck_bank_accounts_deactivated_implies_inactive` (BANK-F14) check. **That is a live bug caught before
it did damage, with a fail-before/pass-after test.** Recorded as CC-2's, found in CC-3's shipped
route, with no fault to CC-3 — the route was one step of a chain and this is the chain working.

---

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MKo9vhjc571PAzox5jLu9i
