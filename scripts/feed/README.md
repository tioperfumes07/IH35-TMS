# THE FEED GATES — one day, one proof, one gate

These three gates decide whether a fed day is allowed to close. Until this commit they lived
only in `~/Downloads`: not version controlled, not in CI, free to drift from the thing they
check — the same defect that had already produced a purge verifier checking 19 tables while the
purge SQL deleted 38. A gate that lives outside the repo is not a gate, it is a habit.

**The owner's rule is the whole design: one day, one proof, one gate. Never ahead of a passing
gate.** Feeding day N+1 on top of an untied day N is exactly how the last population drifted —
each day looked close, nobody closed one, and the error compounded twenty-three times.

## The order

| # | gate | question it answers | when |
|---|------|--------------------|------|
| 1 | `verify-feed-readiness.mjs` | Does every name in the feed resolve to exactly ONE master? | ONCE, before day 1 |
| 2 | `verify-feed-load.mjs` | Does each load's money and its posting destinations obey the law? | per load, during the day |
| 3 | `verify-feed-day.mjs` | Does the whole day tie to Faro's own export, on all five columns? | at the end of the day, before it closes |

## What makes them real

**All five columns, every day. Count is a column.** A day with the right dollars and the wrong
number of invoices is NOT tied. `verify-feed-day` compares invoices, purchase, escrow, discount,
wire and net advance, to half a cent.

**Fail closed.** No `DATABASE_URL` and no `--measured` is exit 1, never a skip. A gate that
skips quietly is worse than no gate, because it produces a green that nobody earned. Verified:
`verify-feed-day.mjs` with no `--day` exits 1; `verify-feed-readiness.mjs` with no database
exits 1; `verify-feed-load.mjs` with no arguments exits 1.

**The controls are built, not typed.** `day_control.json` is built by `build_day_control.py`
straight from Faro's `PURCHASE REPORT ALL.csv` and the funds-due report; its own build asserts
eight independent controls and the identity `purchases − receipts = A/R 298,762.00`.
`settlement_control.json` is built the same way from the signed AlwaysTrack settlements. No
number in either file is hand-entered, which is why a gate failing means the FEED is wrong, not
that someone mistyped a control.

**Every gate has a selftest that proves it can fail.** A guard that has never been seen to fail
is an assertion, not a control:

```
node scripts/feed/verify-feed-day.mjs  --selftest
  PASS — a perfect 8/10/26 ties and 7 mutations all trip the gate.

node scripts/feed/verify-feed-load.mjs --selftest
  PASS — 7 money/count mutations and 5 posting-destination violations all trip the gate.
```

## Running a day

```
node scripts/feed/verify-feed-readiness.mjs          # once, before day 1
# ... feed the day through executeHistoricalFeedDay() ...
node scripts/feed/verify-feed-day.mjs --day 8/10/26  # close it, or don't
```

The executor (`apps/backend/src/driver-finance/historical-feed-day.service.ts`) reports
`clean = (refused === 0 && skipped === 0)` for the write side. These gates answer the
reconciliation side. **A day closes only when both say so.** There is no partial credit.
