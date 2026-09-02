# Design — Stop → Location Catalog (address validation / consistency)

> **SUPERSEDED (2026-09-02, GO-24, owner ruling via INBOX-CC-3).** This doc proposed a NEW
> `catalogs.locations` table (§2 below) as design-only, never built. **The real thing already
> existed the whole time as `mdata.locations`** (27 rows live, 9 for USMCA) with `location_type`,
> `linked_customer_id`/`linked_vendor_id`, geocoding fields, contacts, and a live FK already on
> `mdata.load_stops.location_id` — none of which needed this doc's proposed schema or an owner
> migration ceremony. `GET`/`POST /api/v1/mdata/locations` (`apps/backend/src/mdata/locations.routes.ts`)
> was already mounted, unused by any picker. GO-24 wired the actual Book Load stop picker against
> `mdata.locations` (see `LocationPicker.tsx`, PR #19661) — **never create `catalogs.locations`.**
> Kept below, never-delete, for historical reference only — do not build against §2's schema.

**Block covered:** 0251-gap21 (link stops to a location catalog for address validation/consistency).
**Status:** DESIGN ONLY. **Classification:** dispatch/operational in nature, but needs a new
`catalogs.*`/`mdata.*` table + an FK on `mdata.load_stops` → migration → gated (§1.3). tier-3.
Owner ceremony required before the migration is applied.

## 1. Verified current state (repo, 2026-07-11 — prod UNVERIFIED, needs live check)
- `mdata.load_stops` holds stop addresses inline (free-typed per stop). No location/place catalog
  table found in `db/migrations/`; stops are not de-duplicated or validated against a canonical place.
- Result: the same physical facility is re-typed per load (inconsistent naming, no geocode reuse,
  no validation).

## 2. Proposed schema (idempotent, RLS-forced, grant-complete — owner applies)
```sql
CREATE TABLE IF NOT EXISTS catalogs.locations (
  id                    uuid PRIMARY KEY DEFAULT uuidv7(),
  operating_company_id  uuid NOT NULL REFERENCES org.companies(id),
  name                  text NOT NULL,
  address_line1         text, city text, state text, postal_code text, country text,
  latitude              numeric(9,6), longitude numeric(9,6),
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, name, postal_code)
);
-- additive: ALTER TABLE mdata.load_stops ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES catalogs.locations(id);
-- RLS FORCE + operating_company_id policy + GRANTs (0065) + audit trigger.
```
- Validation rule: on stop create, offer catalog match; inline "+ Add new location" at the end of the
  dropdown (§7 reference-dropdown pattern) opens a mini-create without closing the parent panel.

## 3. Linkage matrix (§10-d)
- locations → org.companies. load_stops → locations (`location_id`). Reverse: a location detail view
  lists loads/stops that used it (read-only drill-through). Non-financial module (dispatch), so the
  financial-primitive leg is `N/A → deferred` (a stop location has no direct money leg).

## 4. acceptance[]
- `table` catalogs.locations on prod; `column` mdata.load_stops.location_id; `fk` → catalogs.locations;
  `rls` forced; `route` catalog CRUD + inline-create mounted; `guard` verify-*.mjs (table/FK/RLS).

## 5. Why HOLD
New catalog table + `mdata.load_stops` FK = schema change (§1.3). Build requires owner ceremony.
