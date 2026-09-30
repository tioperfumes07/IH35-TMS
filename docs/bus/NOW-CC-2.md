# CC-2 — ROUND 303 (money paused; the Integrity Engine is your whole round)

Read 09-30-2026-ALL-SEATS-OWNER-SCOPE-CHANGE-MONEY-STOPS.md first.
B-38 matched side, B-40 Relay posting, B-41 posting statuses, the A/R chain, the escrow and
factoring GL gaps: ALL PAUSED. Your B-31 row-level work stays on the board as a finding.
The Faro remittance question is with the owner. Do not chase it.

## B-43 — THE INTEGRITY ENGINE, FINISHED (owner calls it essential; it is a driver-profile engine)
Owner, verbatim: "the integrity report is essential, the engine is supposed to let us know
based on mpg, etc if a driver is consuming too much fuel, he might steal and sell, if too many
tires damaged, if a driver has too many accidents."
You already built the halves: driver-attribution.ts (B-27), fuel-driver-scorecard.service.ts
(B-28), driver-damage-scorecard.service.ts (B-29), integrity.routes.ts (B-30).
FINISH IT. What is missing:
  1. B-29 returns 0 attributed drivers. Your own note names why: all 15 live work_orders
     reference 5 units with ZERO vehicle_driver_assignments coverage -- and I verified those 5
     units are CODER TEST ARTIFACTS. So the damage scorecard has never run against real data.
     Re-measure against the 16 REAL units and report the real numbers.
  2. 116 safety.integrity_findings exist and are attributed to no driver. 46 of 116 resolve
     through driverAtTimeSql; the other 70 are a telemetry coverage gap. Attribute the 46, and
     state the 70 as a coverage gap -- never attribute a finding you cannot place.
  3. ONE integrity score per driver, composed of named components with the arithmetic shown:
     fuel (MPG, gal/100mi vs fleet), damage per 100k miles, accidents, tire events, and
     complaints (see B-44). A score with no visible arithmetic is an accusation, not a metric.
  4. Every flag carries its EVIDENCE and its period. "Might be stealing fuel" must render as
     the actual fills, gallons, dates and unit. A driver's livelihood is downstream of this
     screen -- an unexplained red flag is unacceptable.
  5. NULL, never estimated, across an odometer gap. You already hold that line in B-28. Keep it.

## B-44 — COMPLAINTS AGAINST A DRIVER (new, owner asked for it directly)
Owner, verbatim: "IN THE KPIS COMPLAINTS AGAINST THE DRIVER, FOR LATENESS, ETC. BECAUSE DID NOT
WANT TO LEAVE ETC."
There is no complaints object today -- check before building, and if none exists, build it:
complaint against a driver, with source (customer / dispatcher / broker), category (lateness,
refused dispatch, conduct, damage), date, load and unit where applicable, free-text detail, and
who recorded it. Full linkage both ways: driver -> complaints, load -> complaints.
This feeds the integrity score as its own named component. It is NOT money.

## B-45 — re-read this file.
LANE: no apps/frontend, no money paths, no second integrity engine -- extend what you built.
