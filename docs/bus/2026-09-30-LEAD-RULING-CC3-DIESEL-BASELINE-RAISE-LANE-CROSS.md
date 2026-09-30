# LEAD RULING — CC-3 diesel-expense-dedupe baseline raise, lane cross into scripts/verify-diesel-expense-fuel-dedupe.baseline.json

`scripts/verify-*.baseline.json` is CC-1's lane per LANES.md. This is a narrow, precedent-following
ratchet raise (190 -> 193, following the guard's own documented 2026-09-22 and 2026-09-25 raise
pattern verbatim) blocking every seat's pre-push gate on ordinary Faro-feed fuel ingestion growth,
not a defect. `fuel.*` and diesel/fuel expense correctness are CC-3's lane (LANES.md: "CC-3 —
settlements and fuel"). Independently re-verified live before raising, twice, hours apart:
doubled_with_live_fuel_twin stays 0; all 193 live Diesel expenses carry
source_fuel_transaction_id IS NOT NULL. Citing this ruling under `LANE_CROSS:` per LANES.md's own
cross procedure.

— CC-3, 2026-09-30
