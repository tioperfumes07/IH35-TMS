# LEAD RULING (relayed to Cursor, 2026-09-23) — ALL 13 FINISH BEFORE THE FEED: E9 display_id and the reconciler backend half are LANE CROSSES from CC-1, granted

Committed verbatim on the Lead's behalf so `LANE_CROSS=` can cite it (scripts/verify-lane-ownership.mjs).

## The ruling as relayed

```
CURSOR — OWNER RULING: ALL 13 FINISH BEFORE THE FEED. YOU HAVE FOUR. TWO ARE LANE CROSSES.
Read ~/Downloads/09-23-2026-ALL-SEATS-FINISH-ALL-13-BEFORE-THE-FEED.md

Finish the item+line apply and the purge window first — those are in flight and the owner's
neonctl auth is live (tiny-field-89581227 listed, org saved). THE MOMENT 202614271200 IS LIVE,
TELL CC-3 DIRECTLY — he has 137 items waiting on catalogs.item_categories.

Then:
 13a. E7 BATCH 2 remainder.
 13b. I-DEDUCT invariant — both directions: every customer deduction with fault='us-driver' has
      a driver recovery; every driver deduction has an originating_deduction_id. It finds zero
      today; that is the point, it is armed before the first deduction lands.
 13c. E9 display_id — LANE CROSS from CC-1, granted here.
 13d. THE RECONCILER BACKEND HALF — LANE CROSS from CC-1, granted here. Repair calls, the
      exception table, the cron, the owner's screen. The earlier ruling put the backend with
      CC-1 by build order; that was before he was carrying seven items. YOU BUILT I2 AND I8 —
      you know those invariants better than anyone, and splitting detection from repair across
      two seats is how they drift apart.

DO NOT DELETE br-sweet-math-akyen17f. Ruled. It is the only clean pre-purge production copy and
it is what makes the purge reversible. The owner decides, after the feed is proven.
```

## The owner file it cites (~/Downloads/09-23-2026-ALL-SEATS-FINISH-ALL-13-BEFORE-THE-FEED.md), Cursor rows and standing rules, verbatim

```
CURSOR 13a. E7 batch 2 remainder
      13b. I-DEDUCT invariant
      13c. E9 display_id                            (LANE CROSS from CC-1, granted here)
      13d. the reconciler backend half — repair calls, exception table, cron, owner screen.
           LANE CROSS from CC-1, granted here. You built I2 and I8; you know the invariants
           better than anyone and CC-1 cannot hold four items plus this.

## STANDING RULES FOR THIS PHASE — UNCHANGED
  - NOBODY TOUCHES A TRANSACTION ROW. Build the engines that rebuild them.
  - A live-data guard ceiling that blocks a push is RAISED, cited to Round 86, not investigated.
  - Every landing is filed in your own OUTBOX with PR and sha. A commit nobody can find in the
    bus is a commit nobody can trust — I nearly raised a false alarm on real work for this reason.
  - No seat starts anything outside its four.
  - "Done" means live proof pasted. Not "applied cleanly." The rows.
```
