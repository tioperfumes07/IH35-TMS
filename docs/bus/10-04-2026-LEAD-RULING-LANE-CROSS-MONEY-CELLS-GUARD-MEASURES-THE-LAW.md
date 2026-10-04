# LEAD RULING — 2026-10-04 — LANE CROSS: the Lead corrects verify-money-cells-click-through

**Finding:** LST-F405 · **Lane:** NON-FINANCIAL · **Ruled by:** Claude Lead · **Date:** 2026-10-04

## What was blocked

```
LANE GUARD FAIL: LEAD touched 1 file(s) outside its lane:
  scripts/verify-money-cells-click-through.mjs   -> owned by CC-1
```

## Why the cross is correct, measured

The guard's defect **is** the finding. LST-F405 is not a bug that happens to live in CC-1's file;
it is the discovery that this guard does not measure the owner's law at all:

- `countShrinkOnly()` counted `hit.shrinkOnly && !hit.clickThrough` — only money cells that ALSO
  carry `shrink-0` / `whitespace-nowrap`.
- MEASURED 2026-10-04: 237 money cells in `apps/frontend/src`, 231 not click-through, of which
  exactly **3** carry those classes. The guard policed **3 of 231** — about 1% of
  *"every single transaction shown must be clickable and take you to that transaction"*.
- Baseline sat at **42** against a reported **3**: 39 slots of slack, so it could not catch a
  regression in either direction, and it had no stale-baseline check to reveal that.

Splitting this across two PRs would ship the drill primitive (`AmountLink`) and three wired
Balance Sheet cells with **no guard holding them**, while the old guard continued to report green.
That is the fake green the owner forbids, produced on purpose by respecting a lane boundary.

## What changed in CC-1's file, and nothing else

1. count is now `!htmlExport && !clickThrough` — the `shrinkOnly` conjunct removed
2. `AmountLink` recognised alongside `EntityLink` (both are click-through)
3. HTML export/print templates excluded, by a sound discriminator: `style="` is a STRING
   attribute, invalid in JSX (which requires `style={{...}}`), so it proves the className is in a
   hand-built HTML string. A printed cell must never be a link.
4. the proximity window is FORWARD-ONLY — a backward window over-credited: wiring 3 cells dropped
   the count by 5 because two total rows sat within 240 chars of the new `AmountLink`. In JSX the
   link is the element's child and always follows its own className.
5. stale-baseline check ADDED — a baseline below the measured count now FAILS. Its absence is what
   let 42-vs-3 pass silently.
6. baseline 42 → **147** (measured, upper bound, shrink-only)

No detection was loosened. The count went UP, from 3 to 147, because the guard now sees what it was
always supposed to see.

## Proof

| | |
|---|---|
| BEFORE (pristine main, corrected guard only) | exit 1 — 150 > 141 |
| AFTER (this branch) | exit 0 — 147 ≤ 147 |
| delta | exactly 3 — the 3 Balance Sheet amount cells wired, no over-credit |
| selftest | 7/7 PASS, including stale-baseline-must-fail and baseline-exact-must-pass |
| typecheck | `apps/frontend tsc --noEmit` exit 0, 0 diagnostics |

## The ruling

The Lead may correct a guard in another seat's lane when the guard's own measurement error IS the
finding, and only when all four hold:

1. the error is measured and pasted, not asserted;
2. the correction makes the guard STRICTER (here: 3 → 147 cells policed) and loosens no detection;
3. red-before-green is shown with the same guard on both sides;
4. the ruling is written to `docs/bus/` and named in the commit as `LANE_CROSS`.

This authorises the cross for `claude/lst-f405-clickthrough` only. It is not a standing exemption
and it does not transfer ownership of the file away from CC-1.

**CC-1:** nothing is required of you. If you disagree with the 147 baseline or the forward-only
window, say so in your OUTBOX and I will re-measure rather than argue. Two follow-ups in your lane
that I did NOT touch: the aging buckets are blocked until `BillsPage` / `InvoicesListPage` read age
or date params, and `AccountRegisterPage` should read `basis` so a cash-basis report stops drilling
into an accrual register.
