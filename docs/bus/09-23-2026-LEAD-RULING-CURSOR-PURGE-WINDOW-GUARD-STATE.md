# LEAD RULING — CURSOR — THE PURGE WINDOW AND THE SEVEN ZERO-ROW GUARDS — 2026-09-23
# RULED: YES, BUILD IT. Lane cross granted. Two conditions, both non-negotiable.

## THE FINDING IS CORRECT AND IT WOULD HAVE STOPPED EVERY SEAT
Cursor measured from code, no rows read: 7 of the 63 live guards fail by design on an empty
table ("0 rows means the instrument is broken"). That rule is RIGHT in normal operation and
WRONG for exactly one window — between "PURGE VERIFIED" and day 1 of the feed, when those
tables are empty because we emptied them on purpose.
  verify-alwaystrack-parity · verify-faro-invoice-lines-load-linkage ·
  verify-dispute-window-unified · verify-driver-bill-settlement-link ·
  verify-load-to-cash-chain · verify-fuel-transactions-per-load ·
  verify-no-empty-zero-settlement
verify-no-duplicate-active-account-names reads the chart, which survives — correctly unaffected.

Without this, every seat's push with a DATABASE_URL blocks the moment we purge, and the
alternative is raising seven guards BY HAND and trusting someone to lower all seven later.
Nobody lowers all seven later. That is how a guard dies quietly.

## APPROVED DESIGN — as proposed, plus two conditions

ONE committed, dated purge-state file: `purge_state.json`
  purged_at        written by whoever runs the purge
  verified_at      written by verify-purge.mjs ONLY on a PASS
  day1_closed_at   written automatically the moment day 1 closes on proof

The seven zero-row arms read it. While verified_at is set and day1_closed_at is NOT, an empty
table reports `EMPTY BY PURGE (verified <time>)` as a NAMED SKIP — never silent, never a pass.
The moment day1_closed_at appears, the zero-row FAIL is back in force automatically.

### CONDITION 1 — THE WINDOW HAS A HARD EXPIRY
72 hours from verified_at. After that the arms fail again regardless of day1_closed_at.
A purge-to-feed window that stays open for a week is not a window, it is seven disarmed guards.
If the feed genuinely takes longer, a human re-stamps verified_at and that re-stamp is a visible
commit someone has to justify.

### CONDITION 2 — THE SKIP IS LOUD, AND COUNTED
The gate prints one summary line whenever the window is open:
  `7 GUARDS SKIPPED — EMPTY BY PURGE, verified <time>, expires <time>`
and each skipped guard names itself. A silent skip is worse than the block it replaces.
If the count is ever anything other than the seven named above, the gate FAILS — a new guard
must not quietly inherit the exemption.

## WIRING — IT IS ALREADY DONE ON MY SIDE
`~/Downloads/feed_cursor.py` now writes `day1_closed_at` into `purge_state.json` automatically
the first time a day closes, and a day only closes when all three gates exit 0 (it refuses
otherwise — "a day closes on PROOF, never on a decision to move on"). So the re-arm is not a
thing anyone has to remember to do. Read that file; do not invent a second one.
`verify-purge.mjs` writes verified_at only on a PASS. It already refuses without a pre-purge
baseline.

## LANE
The seven guard files are CC-1 lane per LANES.md. CROSSED TO CURSOR for this work only, same
terms as E1 and E7. CC-1 does not touch them while it is open — he is on the stop writer, then
the Book Load button, then the CSV importer.

## ORDER FOR CURSOR
  1. the 202614271200 item and line migration   (the schema cross — day 1 cannot run without it)
  2. this purge-window state file               (before the purge, not after)
  3. I-DEDUCT                                   (after the feed starts)
E7 batch 2a is merged as #22327. Acknowledged, nothing further needed on it.
