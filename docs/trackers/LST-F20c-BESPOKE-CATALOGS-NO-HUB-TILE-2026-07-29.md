# LST-F20c — bespoke catalogs with a backend and no front door

**Status: guard landed, 4 catalogs frozen and shrinking. 2 of the 4 need an owner shape decision.**

## What was wrong

`verify-every-catalog-wired.mjs` checks four legs — backend route, hub tile, route manifest, frontend
registry. A catalog served by a hand-written `catalogs/*.routes.ts` instead of the generic factory took
this exemption:

```js
if (bespoke.has(table)) continue;   // served by a hand-written catalog route module
```

That `continue` skipped the **hub-tile and frontend-registry legs entirely**. A bespoke catalog with a
complete, audited backend and zero user interface therefore reported as fully wired, and the gate
printed `0 orphans`.

`dispatch_flag_colors` sat in exactly that state: 24 live rows across all three entities, counted in
the Lists badge, openable from nowhere. It was found by hand (LST-F20b), not by the gate that exists
to find it.

## Why the exemption was there, and why it is not simply deleted

The reason was real. A bespoke catalog has no factory config, so there is no declared `urlSegment` to
match a hub tile against. The hub is keyed **kebab-case** (`catalogKey`), tables are **snake_case**,
and deriving one from the other is right 16 times out of 18 and silently wrong the rest: `accounts` is
keyed `chart-of-accounts`, not `accounts`.

That inference trap has now produced a wrong answer three separate times in this repo. So the
exceptions are **declared, not inferred** — `BESPOKE_HUB_KEY` in the guard. An unlisted mismatch fails
loudly rather than passing quietly.

## The 4 that surfaced

All four are `WIRE (global)`, lane `non-fin`, in the owner's `docs/inventories/catalog-wiring-map.csv`
— the owner's map outranks the inventory, which classifies them HEADLESS-BY-DESIGN. All four have a
backend route, **zero** hub tiles and **zero** routes. 115 rows total.

| table | rows | owner shape_fix | blocked? |
|---|---:|---|---|
| `us_states` | 56 | — | **No — wireable as-is** |
| `mexico_states` | 32 | — | **No — wireable as-is** |
| `file_categories` | 21 | `add code/display_name` | Yes — schema change, owner-gated |
| `wo_cancellation_reasons` | 6 | `add code/display_name` | Yes — schema change, owner-gated |

They are frozen in `KNOWN_BESPOKE_NO_TILE`. That list is a **ratchet, not an allowlist**: a new
offender fails the gate, and an entry that gets wired must be *deleted* from the list or the gate
fails too. It can only shrink.

## Owner decision needed

`file_categories` and `wo_cancellation_reasons` have no `code`/`display_name` columns. Two ways
forward, and the repo has precedent for the second:

1. **Additive migration** adding `code`/`display_name` and backfilling — what the owner map's
   shape_fix column literally asks for.
2. **Column alias, no migration** — the factory already supports `codeColumn`/`displayNameColumn`,
   and LST-WIRE-08 used it for `labor_rates` (`rate_code`) and `maintenance_part_locations`
   (`location_code`), explicitly rejecting a shape migration because it *"would store the same fact in
   two columns and let them drift, which is exactly the split-brain that forced
   `catalogs.vendor_types` to carry a both-way sync trigger."*

**Recommendation: option 2** where the columns already carry the fact under another name, falling back
to option 1 only where no such column exists. It matches the standing precedent, needs no migration,
and cannot drift. Verify the real column names on the prod branch before either — the map's shape_fix
notes have already proven stale once (it told us to add `display_name` to `dispatch_flag_colors`,
which already had it).

`us_states` and `mexico_states` need no decision — they are ordinary wiring work.

## Guard proof

`scripts/verify-every-catalog-wired.mjs`, existing verify-step (no new number claimed).

- Green on `origin/main` as-is.
- **Arm 1** — delete the `dispatch-flag-colors` tile → exit 1 naming `dispatch_flag_colors`. The gate
  now catches the exact defect that got past it.
- **Arm 2** — give `us_states` a tile without removing it from the list → exit 1 demanding it be
  removed. The ratchet cannot rot.
- Restored → exit 0.
