See [`docs/LAW.md`](../docs/LAW.md) — the authoritative source for all accounting, schema, and production decisions.

## THE TRANSACTION LINKAGE LAW — owner-stated 2026-09-30, BINDING

Full text: `docs/laws/TRANSACTION-LINKAGE-LAW.md`. Read it before writing any money row.

Three tiers, and the owner drew the line himself:

- **TIER 1 — a truck that is WORKING.** Requires **unit AND driver AND load**, no exceptions.
  Fuel, DEF, tolls, crossings, scales, lumper, detention, over-the-road repair, roadside, tow,
  accidents, citations, trip permits. A truck that burns fuel is moving; moving means a driver and
  a load. If the load is unknown, FIND IT — never write NULL.
- **TIER 2 — something done to an ASSET, not a trip.** Requires **unit (or trailer/equipment)**.
  Load and settlement are OPTIONAL and **must not be forced**. Shop PM, in-house repair, yard
  tires, DOT inspection, wash, unit insurance, registration, lease payment. Owner's reason, and it
  is correct: the truck may be parked with the driver home, or waiting on a driver. Forcing a load
  here invents a trip that never happened, so the guard fails the DEMAND, not the row.
- **TIER 3 — the company, not the fleet.** Company + GL account only. A unit link here is a defect.

**Reverse routing counts.** A link that resolves one way and not the other is half a link and
counts as unlinked. Every hub — unit, driver, load, settlement, trailer, vendor, customer — must be
able to list everything that touched it.

**The GL is part of the linkage.** Every transaction reaches its account through the object's TYPE,
never free text. A type that does not resolve to an account is HELD for coding, never posted to
suspense and never guessed.

Measured when the law was written (USMCA, live): 726 of 726 money rows carry a load. The open hole
is the truck — 52 fuel purchases carry a load and a driver and no unit. CC-3 owns it as T-22.


