
---

# OWNER ORDER — 2026-10-02 — PRESERVE WHAT CANNOT BE REBUILT, THEN BUILD EVERY MODULE END TO END
Claude Lead. This is the forward plan. It is all build. No seat touches data.

## THE OWNER'S WORDS, VERBATIM

> "ONCE THEY ARE FULLY AND COMPLETELY DONE I DECIDE. BUT WHAT IS GOING TO END UP HAPPENING IS THAT I
> WANT ALL GEOCODED DATA, FUEL STOPS DATA, FUEL PURCHASE DATA STORED IN THE APP AND IN AN EXCEL FILE.
> BECAUSE I WILL PROBABLY NEED TO DELETE EVERY SINGLE TRANSACTION CREATED DOCUMENT FROM THE LOADS AND
> DELETE THE LOADS AS WELL SO I CAN START OFF AGAIN THE APP WITH NO SINGLE POSTED TRANSACTION
> REGISTER JOURNAL ENTRY IN THE APP, FROM 0 COMPLETELY. GET THE CODERS TO FULLY CODE AND BUILD MY
> ENGINES, ALL THE VISUAL DESIGNS, THE REMOVALS, THE ADDITIONS. CUSTOMERS, VENDORS, DRIVER PROFILE
> MODULE. DISPATCH MODULE, MAINTENANCE MODULE, FACTORING, BANKING, LEGAL, CASH FLOW, SETTLEMENTS."

## THE ENGINEERING FACT THAT DRIVES THE WHOLE PLAN

Most of what is in USMCA can be re-fed: loads, invoices, bills, settlements, expenses, journal
entries. The owner has the source documents.

**Three things cannot be re-fed, ever:**
1. **Geocoded and telematics data** — GPS positions, geofence events, stop events, odometer captures,
   load odometer segments, real driven miles, Samsara addresses. These were observed from a truck at
   a moment in time. Samsara's retention window closes. Delete them and they are gone for good.
2. **Fuel purchase data** — card fills from Dreamline, Relay and the statement imports. The gallons,
   the price per gallon, the discount, the merchant, the timestamp.
3. **Fuel stop data** — where the truck actually stopped to buy fuel, with its geocode.

If a load is deleted and that data hangs off the load by foreign key, it dies with the load. That is
the risk, and it is the reason this order exists **before** any reset engine is built.

## THE DESIGN LAW FOR PRESERVATION: NATURAL KEYS, NEVER UUIDs

A preservation record that stores `load_id` as a UUID is worthless after the reset — the UUID will
not exist. Every preserved row keys on facts that survive a purge and come back identically on
re-feed:

- **unit number** (T152), never `unit_id`
- **load number** (13639), never `load_id`
- **driver name and CDL**, never `driver_id`
- **the UTC timestamp** of the observation
- **the odometer reading**
- **the card number's last four** and the merchant's own reference / invoice number
- **latitude and longitude**, and the geocoded address as resolved at the time

Store the original UUIDs alongside as dead reference, clearly marked as pre-reset. They are history,
not join keys.

The preserved rows live in their own tables with **no foreign key to loads, invoices, settlements or
any purgeable record.** A purge must be unable to cascade into them. State that in the migration and
guard it.

## TWO NEW ENGINES — EACH ONE COMPLETE, ONE SEAT EACH, NO SPLITTING

**CC-3 — TELEMATICS AND GEOCODE PRESERVATION ENGINE.** Everything observed from the trucks:
`telematics.vehicle_locations`, `geo.geofences` and `geo.geofence_events`,
`telematics.unit_stop_events`, `telematics.geofence_odometer_captures`,
`telematics.load_odometer_segments`, `telematics.odometer_readings`,
`integrations.samsara_addresses`, `integrations.samsara_route_stop_progress`, DVIR and HOS
snapshots. Preserved on natural keys per the law above, plus an Excel export the owner can open and
keep.

**CC-2 — FUEL PRESERVATION ENGINE.** Every fuel fact: `fuel.fuel_transactions`,
`integrations.relay_fuel_transactions`, the Dreamline card and statement imports, gallons, retail
price, discount and savings, merchant, card last four, and the fuel stop with its geocode. Same
natural-key law, plus its own Excel export.

Both engines: **export is a first-class output, not an afterthought.** One command, one .xlsx, every
preserved row, column headers a human reads, money and gallons as numbers not text, written where
the owner can reach it. Both engines are **read-and-write-forward only** — they create preservation
rows and a file. They delete nothing, they modify no source row.

**Guard, one per engine:** fails if any preserved table carries a foreign key to a purgeable record,
fails if a preserved row is missing its natural key, and fails if a source table exists whose rows
the engine does not cover.

## THE ZERO-RESET ENGINE — CC-1 BUILDS IT, NOBODY RUNS IT

Built, tested on a throwaway branch, and **left unrun.** The owner decides when, and only after the
preservation engines are done and he has the Excel files in hand.

What it must do: delete every created document and every posting from the loads, then the loads, so
the app starts with **zero posted transactions, zero register entries, zero journal entries** — and
prove it, by assertion in code, not by a query someone pastes. It discovers its own dependent tables
rather than carrying a hand list; it refuses to run if the preservation engines have not recorded
their rows; it refuses to run if any preserved table would be touched; and it is one transaction that
either completes or leaves nothing changed.

**Hard order: this engine is not run on production by any seat, under any AUTH, for any reason,
including a dry run that someone then applies. The owner runs it himself when he decides.**

## EVERY MODULE, END TO END, ONE SEAT EACH

Engines, visual designs to the boards in `docs/design/boards/`, removals and additions — **one seat
owns a module completely.** No seat builds an engine for a screen another seat builds. That is the
no-handoff law applied to modules.

| Seat | Modules owned end to end |
|---|---|
| **CC-1** | Maintenance · Settlements · Cash Flow · the zero-reset engine |
| **CC-2** | Banking · Factoring · Fuel (incl. the fuel preservation engine) |
| **CC-3** | Customers · Vendors · Driver Profile · Dispatch · (incl. the telematics/geocode preservation engine) |
| **CURSOR** | Legal |

For each module the seat delivers: every engine correct and the competing-engine audit done (the
standing order — Poster A / Poster B is the pattern, find yours); the screens identical to the boards
under `docs/design/boards/` per `docs/design/00-OWNER-DESIGN-LAW-READ-BEFORE-ANY-SCREEN.md` and
`ih35-design-tokens.css`; the filter audit applied; every removal and addition the owner has named;
the linkage declaration both directions; and one named guard per engine.

Nothing is "done" because it merged. It is done when the engine is correct in code, the screen
matches the board, the guard holds, and the deploy is live on **both** services.

## STANDING, UNCHANGED
Build only. No seeding, feeding, matching, categorizing, live verification, backfilling, repointing,
purging or reposting by any seat — not under an AUTH, not as proof. The data's current state is not a
work queue. The owner purges, re-feeds and verifies himself, in Chrome, when every engine is fully
and completely built, and he decides when that is. No handoffs. Orders cite files, call sites and
rulings — never row counts or balances.
