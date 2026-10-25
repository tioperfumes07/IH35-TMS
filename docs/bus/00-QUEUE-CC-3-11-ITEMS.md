# CC-3 — NUMBERED QUEUE — 11 ITEMS — 2026-10-02
Claude Lead. Modules owned end to end: **Customers · Vendors · Driver Profile · Dispatch.**
**Item 1 is the owner's first priority for the whole project and it runs before the purge.**
Each item fully complete before the next. Permanent fixes with guards. No seeding, feeding, live
verification or reposting. No handoffs.

---

**1 of 11 — REMOVE THE DUPLICATES. THE OWNER'S WORDS: "I HAD ALREADY INSTRUCTED THIS, I TOLD YOU, YOU
DO NOT DO AS I SAY."** He is right and the fault is the Lead's, not yours — you rehearsed it and
reported it correctly.
**22 duplicate customer groups and 2 vendor groups in USMCA.** Rehearsed clean on throwaway branch
`br-empty-lake-akqooohs` with A/R $374,134.12 and A/P $566.35 unchanged to the cent in both
directions.
**This runs BEFORE the purge** — master data survives the purge, so what survives must already be
clean, or the owner creates settlements against duplicate customer rows.
**OWNER RULING: LOVES and LOVES TRAVEL STOPS are one vendor.** They do not normalize equal
(`LOVES` vs `LOVESTRAVELSTOPS`), so record it as a **named owner exception**, never by loosening the
normalizer — a looser normalizer would start merging vendors he never approved. LOVES is 95.7% of
every vendor dollar, so this one matters.
Keep the row carrying the transactions; the other becomes an alias. Never write `mdata.qbo_vendors`.
Repoint every loose `customer_(id|uuid)` / `vendor_(id|uuid)` column discovered at run time —
including the five your own root-cause found missing from the old hand list: `bills.vendor_id`,
`bill_payments.vendor_id`, `lease_contract.lessor_vendor_id`, `equipment_loans.lender_vendor_id`,
`bank_transaction_splits.vendor_id`. A/R and A/P unchanged to the cent, both numbers pasted.
Reversible, with the merge audit row. **Needs the owner's AUTH — request it in your OUTBOX.**

**2 of 11 — COMPETING-ENGINE AUDIT, YOUR MODULES.** Read code, query nothing. Telematics and odometer
writers, the canonical customer and vendor engines, dispatch status setters, mileage sources. For each
pair: file and line, which the live path calls, which is correct, the repoint, the guard. Findings are
added to this queue and renumbered.

**3 of 11 — CUSTOMERS MODULE, END TO END.** Canonical engine plus the profile surface — AR aging,
credit limit and exposure, open loads, payment history, factoring eligibility, documents, contacts,
rate history. Screen identical to `docs/design/boards/driver-customers-vendors/Customers.dc.html`.
**Opens on With transactions 65**, carrying Open balance 61 · Factored 1,223 · All 1,249. Today it
opens on Active 1229 with `$0.00` and `No history` first and no with-transactions tab exists at all.

**4 of 11 — VENDORS MODULE, END TO END.** `mdata.vendors` is canonical; `mdata.qbo_vendors` is NOT and
is never written. Profile: AP aging, open bills, 1099 status, insurance and authority with expiry,
work orders, fuel, lanes, terms, history. Screen identical to `Vendors.dc.html`. **Opens on With
transactions 34**, carrying Open bills 0 · All 623.

**5 of 11 — DRIVER PROFILE, END TO END.** Your #23960 engine is good — 17 blocks, every one a value or
a stated reason, 0 malformed across 18 drivers. **It has never been live on the web.** Verify it
against the live `ih35-tms-web` deploy, then build the screen identical to
`Main.dc.html` (Driver Hub Home) and `DriverDetail.dc.html`.
The board measures what is wrong today, in the owner's own Chrome: **593px of chrome before one byte
of driver data on a 1350px screen — 44% of the page gone**; the KPI block as **7 stacked bars over
216px** with figures pushed to x=2305 of 2381; six bands before any data; the list pane rendering
**zero rows**. The board puts data at **244px** with **one row of 6 KPI tiles at 78px**. Hit those
numbers.
Rafael is weekly salary — closed ruling, never re-ask.

**6 of 11 — DISPATCH MODULE, END TO END.** Engines and screens.

**7 of 11 — THE APP-WIDE FILTER AUDIT, YOUR SURFACES.** Status chips with **live** counts (a
hardcoded or stale count is a defect), 1px divider, multi-select chip wells with × and a faint
prompt, a type selector, 132px date boxes, search naming the whole set and saying hidden is not
missing, the Regular / Master-detail toggle in the same position and size on every list, the gear
opening a working column chooser. Drivers opens on **Active 19** of 130.

**8 of 11 — E-23 SAMSARA FUEL PUSH · E-30 DRIVER MESSAGING · E-31 SAMSARA ROUTES.** Flags were turned
on with d11f098 and **first-tick proof was never pasted**. A flag on with no tick is not built. Finish
each and paste its tick.

**9 of 11 — E-32 DOCUMENTS / FORMS BOL-POD.** Unbuilt. Against `docs.files`, both-direction linkage to
load, stop, driver, unit, customer.

**10 of 11 — E-03 unit_stop_events** — verify the engine fires and keeps firing, and **E-29 DOT-dwell /
border crossing** — verified end to end, not by row count.

**11 of 11 — THE TELEMATICS + GEOCODE PRESERVATION ENGINE + EXCEL.** This data **cannot ever be
re-fed** — it was observed from a truck at a moment in time and Samsara's retention window closes.
Preserve `telematics.vehicle_locations`, `geo.geofences` and `geo.geofence_events`,
`telematics.unit_stop_events`, `geofence_odometer_captures`, `load_odometer_segments`,
`odometer_readings`, `integrations.samsara_addresses`, `samsara_route_stop_progress`, DVIR and HOS
snapshots.
**Natural keys only** — unit number (T152), load number (13639), driver name and CDL, UTC timestamp,
odometer, latitude and longitude, and the address as geocoded at the time. **Never a UUID as a join
key**: UUIDs die with the purge. Store the old UUIDs alongside, marked pre-reset, as dead reference.
**No foreign key to loads, invoices, settlements or anything purgeable** — a purge must be unable to
cascade into it. Plus a one-command .xlsx the owner keeps.
**Also yours: your 4 ambient static failures** — `verify-ct-timezone-rendering`,
`verify-entity-picker-trailer-kind-sweep`, `verify-no-silent-list-caps`,
`verify-new-units-have-gps-or-deactivation-reason`. Fix the cause; never grow the baseline.
