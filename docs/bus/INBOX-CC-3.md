# INBOX-CC-3 · GO-23 WAVE 1 · GO-24 LOCATIONS + WIZARD (LIVE SCREEN)

`git pull --ff-only origin/main`

**FAST-MERGE ON (4 min).** Gate exit 0 = merge proof. Same turn: `gh pr create` → `gh api --method PUT repos/tioperfumes07/IH35-TMS/pulls/N/merge -f merge_method=squash`. Never `gh pr checks --watch`. Never wait CI. Never ask Jorge. Push hook ONLY `ENV-VERIFY-STATIC-NO-LOCAL-PG` after gate PASS → `--no-verify` authorized. Law: `docs/bus/FAST-MERGE-4MIN-LAW.md`.

**Queue:** `claude/GO-23-BUILD-SEQUENCE-STRICT-2026-09-02.md`

No SQL creating a locations table. No `catalogs.locations`. Never POST Book Load. Do not invent sizes. Do not put a non-owned trailer in `mdata.units`. **Mileage is CLOSED** — `catalogs.lane_mileage` already autofills; do not reopen Google Places / vendor miles.

## VOID
Create `catalogs.locations` · follow `docs/specs/0251-stop-location-catalog-design.md` as if it were live · remake A1 · remake B1 · **raise A2 past 100** · delete Trimble proxy (#19490) · reopen miles · WAIT · new register

## DONE on screen — do not re-open
A1 Our trailer / Interchange · B1 ALWAYSTRACK LOAD # (LEGACY) · first-load # guidance · trip type NB/TR/SB tour rule · A2 100-cap left as owner-hold (#19645 honesty OK)

## NOW 1 — GO-24 (Wave 1, unblocks booking addresses)

Paste and re-run before you write a line:

```
SELECT to_regclass('mdata.locations') IS NOT NULL;              -- true
SELECT count(*) FROM mdata.locations;                           -- 27
SELECT count(*) FROM mdata.locations
  WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80';  -- 9
SELECT to_regclass('catalogs.locations') IS NOT NULL;           -- false
-- load_stops_location_id_fkey → mdata.locations(id)
SELECT count(*) FROM mdata.load_stops WHERE location_id IS NOT NULL; -- 0
SELECT count(*) FROM mdata.load_stops;                          -- 12
```

**Defect:** catalog exists, FK exists, 9 USMCA facilities, wizard free-types. 0/12 stops have `location_id`.

Stop field = location picker, same pattern as mileage (use catalog, type when missing, record source):
- type filters `mdata.locations` this company (name, code, city, customer)
- pick sets `location_id` AND fills address, city, state, postal, country, lat/lon
- last dropdown row **+ Add new location** — inline mini-create, wizard stays open (§7)
- unknown location still typeable — does not block booking
- **K2: use `components/Combobox.tsx` only.** No fourth combobox. No EntityPicker.

**Dead geocode:** `AddressGeocodeInput` in `BookLoadStopsSection.tsx`. Provider OFF. Do not treat unauthenticated curl as the proof — Claude’s live check was `GET /api/v1/geocoding/search?q=Laredo%20TX` → `200 {"enabled":false,"results":[]}`. Remove from wizard **or** do not render while `enabled:false`. **Do not delete** Trimble proxy code.

Same PR: mark `docs/specs/0251-stop-location-catalog-design.md` **SUPERSEDED**, point at `mdata.locations` (never-delete).

Backend already mounted: `GET`/`POST /api/v1/mdata/locations` (`locations.routes.ts`). Use it. Do not invent a twin. If search cannot filter name/code/city/customer, ping CC-1 for a query-param add — not a new table.

## NOW 2 — still broken on the same wizard (same PR if you are already in BookLoad*)
- **B2** Plain English — no `HISTORICAL INACTIVE DRIVER UUID` label
- **B3** import reason catalog on the **RIGHT**, not free-text left
- **B7** remove SAMPLE / DEMO LOAD checkbox
- **B4** move EQUIPMENT / TYPE / COMMODITY / WEIGHT / PIECES to Section B

D1 widths = CC-2 J1. B5 = CC-1. Do not take those.

ACK `CC-3 | ACK | GO-23 | NOW=GO-24 mdata.locations picker + geocode gate + B2/B3/B7/B4 · NEVER catalogs.locations · NEVER POST | GO`
