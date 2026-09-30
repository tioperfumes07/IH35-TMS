# Closure 39 — resolved deadhead-mileage register, taken OFF the close gate

CC-1, 2026-09-30, per Lead RULING 1 (ROUND 293): "NO WORM CARVE-OUT. The lock did its job... DO
THIS INSTEAD: record all 15 resolved values in a committed file with their source, so nothing is
re-derived later, and apply them when each settlement/invoice closes naturally. Closure 39 is NOT
a close blocker on its own — mileage is operational, not a GL balance. It comes off the close gate
and onto the operational backlog."

## Status

Closure 39 is REMOVED from the August/September close gate as of this file. It is an operational
backlog item, not a GL-balance blocker. Re-apply the values below via
`scripts/ops/2026-09-28-cc1-round210-deadhead-miles-backfill.ts --apply` (same sanctioned writer,
same computed values — do not re-derive) once each load's blocking settlement/invoice closes.

## The 15 resolved values

Source: `computeChainDeadheadMiles` (the sanctioned engine — the same unit's most recent prior
delivery to this load's pickup, never invented), run live against production 2026-09-30 via the
existing AUTH-158 script in DRY_RUN mode (no write). All 15 resolved cleanly; 0 came back blank.

| load  | miles_deadhead (resolved) | blocked by | reference |
|-------|---------------------------|------------|-----------|
| 13593 | 1620.7 mi | issued_invoice | invoice 13593, status=sent |
| 13622 | 1544.8 mi | issued_invoice | invoice 13622, status=sent |
| 13624 | 1638.9 mi | open_settlement | P-0005 |
| 13625 | 133.4 mi  | open_settlement | P-0013 |
| 13626 | 42 mi     | open_settlement | P-0009 |
| 13627 | 145.2 mi  | open_settlement | P-0014 |
| 13628 | 504.9 mi  | open_settlement | P-0008 |
| 13630 | 111.3 mi  | open_settlement | P-0003 |
| 13631 | 1051.7 mi | open_settlement | P-0012 |
| 13632 | 1371.5 mi | open_settlement | P-0010 |
| 13633 | 13.5 mi   | open_settlement | P-0018 |
| 13634 | 1239.2 mi | open_settlement | P-0018 |
| 13636 | 1763.7 mi | open_settlement | P-0011 |
| 13638 | 217.9 mi  | open_settlement | P-0002 |
| 13639 | 197.1 mi  | open_settlement | P-0004 |

Note: 13633 and 13634 share settlement P-0018 (a multi-load settlement) — both blocked by the
same open settlement, resolved independently to their own correct values.

## The second closure-39 component: 13622's miles_practical

Separate from the 15 above, `mdata.loads.miles_practical` is also NULL on load 13622 (the other 14
loads above already have a real `miles_practical` value — verified live, see table below). No
AlwaysTrack record exists for this load's practical miles anywhere searched this session. Real
pickup/delivery coordinates exist on the load's own stops, but the geocode/mileage provider
needed to derive miles from them is the same one CC-3 was separately told is down
(`verify-geocode-provider-is-reachable` FAIL, `provider_unavailable` on a known-good US address —
CC-3's item, ROUND 293). This is NOT a WORM-lock question — it is a missing-source-data question,
blocked on a different, unrelated infrastructure item. Do not attempt to backfill it until that
provider is confirmed reachable and a real value can be derived, not guessed.

| load | miles_practical (live) |
|---|---|
| 13593 | 1670.4 |
| 13622 | NULL — no source, blocked on geocode provider (CC-3) |
| 13624 | 1929.2 |
| 13625 | 1844.6 |
| 13626 | 606.1 |
| 13627 | 1306.0 |
| 13628 | 1640.8 |
| 13630 | 1500.4 |
| 13631 | 1347.2 |
| 13632 | 1358.6 |
| 13633 | 1497.7 |
| 13634 | 1358.6 |
| 13636 | 1929.2 |
| 13638 | 1958.9 |
| 13639 | 1898.4 |

## The unknown lock reason, for the record (per the Lead's own request)

AUTH-158 found `updateDispatchLoad` refuse 2 of the 15 (13593, 13622) for a lock reason AUTH-123
(2026-09-28) never encountered: **`issued_invoice`**. AUTH-123's original 13-load population was
all still-open-settlement, never-yet-invoiced loads, so it only ever exercised the
`open_settlement` branch of the money-lock. 13593 and 13622 are new since (13593 created this
session under AUTH-146; 13622 already existed but was not part of AUTH-123's original population)
and are both already invoiced (`status='sent'`), which is a SEPARATE `LOAD_EDIT_LOCK_MONEY_FIELD_KEYS`
gate condition in `updateDispatchLoad` — an issued invoice locks the load's money-adjacent fields
(including `miles_deadhead`) the same way an open settlement does, and correctly refused here.
Both lock branches are working as designed; this is documented so a future reader does not have to
rediscover it from a script's own runtime output.
