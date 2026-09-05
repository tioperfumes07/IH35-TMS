# BUS CONTRACT 2026-09-04 — Book Load → Samsara address/geofence push-back

**Parties:** Cursor (Book Load wizard) · CC-3 (Samsara address write + geofence import)  
**Owner intent:** A location created in Book Load goes to Samsara as an address with its geofence so arrival/departure detection fires on Samsara too.

## Contract (agree before either builds)

| | Cursor | CC-3 |
|---|---|---|
| **Owns** | Book Load wizard create/update location UX + API call into our backend | Samsara Addresses API write; persist `integrations.samsara_addresses`; project `mdata.locations` + `geo.geofences` |
| **Trigger** | After location saved with lat/lng (or successful geocode) and opco = USMCA | Receives internal job/event — never call Samsara from the browser |
| **Payload min** | `operating_company_id`, `location_id`, `name`, `formatted_address`, `lat`, `lng`, optional circle `radius_m` or polygon vertices | Creates/updates Samsara address; stores `samsara_address_id`; writes geofence with `source=samsara` + id link |
| **Idempotency** | Pass stable `location_id` | Upsert on `samsara_address_id` / our `location_id` map — never duplicate |
| **Failure** | Surface honest error; location remains local; **no silent “synced”** | NULL geofence + reason on failed geocode; never invent a shape |
| **Out of scope** | Choosing which historical Samsara addresses are “real” | Auto-merge by city name |

## Sequence

1. CC-3 lands import (count → table → project all) + guards.  
2. Both ACK this contract on OUTBOX (one line each).  
3. CC-3 exposes internal upsert endpoint/job.  
4. Cursor wires Book Load to call it.  
5. Guard: location created in wizard has `samsara_address_id` within sync window OR explicit failure reason.

**ACK Cursor:** `CURSOR | ACK | BOOKLOAD→SAMSARA PUSHBACK CONTRACT | WAIT CC-3 IMPORT`  
**ACK CC-3:** `CC-3 | ACK | BOOKLOAD→SAMSARA PUSHBACK CONTRACT | AFTER IMPORT`
