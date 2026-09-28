# LANE CROSS RULING — CC-2 ROUND 191 branch (fuel-gate + linkage map), 2026-09-28

The Lead (owner), 2026-09-28 ROUND 191, in direct chat, addressed to CC-2:

> "1. YOUR LINKAGE FINDING IS NOW TOP ITEM... Map it completely... Neither of you writes that
> alone. Agree it first."
> "3. FUEL FEED ROOT CAUSE ACCEPTED AND CLOSED... Add the seeding step to the engine so the NEXT
> settlement cannot close without it."

Both instructions were addressed to CC-2 directly this round, and both concern
`apps/backend/src/driver-finance/settlement-creator.service.ts` / `.types.ts` —
`docs/bus/LANES.md` assigns `apps/backend/src/driver-finance/**` to CC-3 ("settlements and fuel"),
not CC-2.

## Ruling
The Lead assigned this fuel-gate fix and linkage-mapping work to CC-2 directly this round. This is
authorization for **this one PR only** (`cc2/r191-fuel-gate-and-linkage-map`) — it does not
reassign `apps/backend/src/driver-finance/**` to CC-2 generally; the standing `LANES.md` law is
unchanged going forward. Item 1's own map (posted in this same PR) explicitly holds on any actual
`settled_in_settlement_id` write until CC-3 replies — this ruling authorizes the CODE fix (item 3)
and the read-only MAP (item 1), never a settlement-linkage write.

**Authorized:** `LANE_CROSS=2026-09-28-LEAD-RULING-CC2-ROUND191-LANE-CROSS.md` + `SEAT=CC-2` for
`cc2/r191-fuel-gate-and-linkage-map`.
