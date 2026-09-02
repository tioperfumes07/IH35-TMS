# CC-1 — MILES SPEC FOR DISPATCH, FINAL — 2026-09-02

Owner pasted Claude's settlement workbook answer into the bus. **This is law.** It supersedes `docs/bus/MILES-LAW-FINAL-2026-09-02.md` pay formula and catalog-empty autofill.

AlwaysTrack "loaded" = shortest loaded + deadhead (one formula, 3,237 lanes, no catalog corruption). Going forward we do **not** store that as one number.

## STORE THREE NUMBERS PER LOAD. Never derive one from another.

| Field | Meaning | Feeds |
|---|---|---|
| `miles_shortest` | loaded shortest route | DRIVER PAY (loaded line) |
| `miles_practical` | loaded practical route | CUSTOMER RATE / RPM |
| `miles_deadhead` | previous delivery → this pickup | COST + DRIVER PAY (empty line) |

## DRIVER PAY — two lines, always

```
DRIVER PAY = (miles_shortest × rate_loaded) + (miles_deadhead × rate_empty)
```

Company Settlement 5753 already shows it: "Loaded Miles at rate, Empty Miles at rate."
`rate_empty` is its own config value **per driver**. It equals `rate_loaded` today. **Do not hardcode the equality.**

CUSTOMER RPM = rate / `miles_practical` (loaded lane only)
COMPANY CPM  = cost / (`miles_practical` + `miles_deadhead`)
**NEVER** fold deadhead into practical.

All empty miles paid, same rate as loaded **today**, via the separate field.

## AUTOFILL

- Loaded + practical: from `catalogs.lane_mileage`. Lane property.
- Deadhead: **COMPUTE** from the truck's last delivery location, **across ALL entities**. NEVER from a lane average — August deadhead on comparable lanes ranged 0 to 598 miles. Property of where the truck was, not of the lane.
- If previous position is unknown: leave **BLANK**. Operator types. Never fill a number that will be paid out.

## ATTRIBUTION

Deadhead belongs to the load it **positions for** — the front leg, booked on the load being picked up. Not on the load that just delivered. Historical August books it both ways; normalise **forward** before any per-load margin report is trusted.

## THE GUARD

Every load's `miles_deadhead` must reconcile to the distance from that truck's previous delivery, across all entities, or it flags.

Flag only when it matters: `short > practical`, or reverse-lane difference over 100 miles. Autofill, flag, OK popup, operator may edit, **NEVER block booking.**

## WHAT IS NOT A DEFECT — do not "fix"

- `short_miles` exceeding practical on a deadhead load (AlwaysTrack pay basis carrying empty). Correct by design.
- Company vs driver settlement miles disagreeing by ~2.9% (0.9713, sd 0.0137). Practical vs short. Correct by design. The 69-settlement gap is the law working.

Do **not** mass-swap the lane catalog.

## BANK / FAKE MATCH DOCS (owner 2026-09-02)

Leave bank transactions **uncategorized**. Bills/expenses created to match them or from categorization are **not real**. Void them later (then delete). Do not spend this week on purge/categorize semantics. **Build the engines now.** Junk can be deleted while Jorge books loads.
