# IH35 Security Model

Canonical security boundaries for IH35 TMS. When portal or tenant isolation behavior conflicts with other docs, **this file wins for security semantics**.

## Office (internal) authentication

- **Session cookie:** `ih35_session` (Lucia)
- **Identity store:** `identity.users` + `identity.sessions`
- **Scope:** Full TMS API under `/api/v1/*` except explicitly public or alternate-auth routes
- **Password hashing:** Argon2id via `oslo/password` (office login + identity password reset)

## Shipper portal authentication (Block 18)

- **Session cookie:** `portal_session` (separate from Lucia)
- **Identity store:** `shipper_portal.portal_users` linked to exactly one `mdata.customers.id`
- **Session store:** `shipper_portal.portal_sessions`
- **Scope:** `/api/v1/portal/*` only; every load query filters by `portal_user.customer_id`
- **Isolation rules:**
  - Internal `ih35_session` must **not** authorize portal routes (`403 internal_session_not_valid_for_portal`)
  - Portal `portal_session` must **not** authorize internal `/api/v1` routes (Lucia middleware ignores portal cookie)
  - Portal responses must omit internal-only fields (rate/cost/margin, dispatcher notes, driver pay)
- **RLS:** `shipper_portal.portal_users` and `shipper_portal.load_milestones` enforce `operating_company_id` via `app.operating_company_id`
- **Password hashing:** Argon2id via `oslo/password` (same library as office auth, separate credential store)

## Data exposure matrix (portal)

| Data class | Portal access |
| --- | --- |
| Load number, status, stops (address/city/state) | Allowed |
| GPS lat/lng + relative location text | Allowed (customer's loads only) |
| Milestones, POD/BOL download | Allowed (customer's loads only) |
| Rate, margin, driver pay, internal notes | **Denied** |

## Route registration

Portal routes register via `registerShipperPortalRoutes()` from `form-425c.routes.ts` bootstrap (Block 16 pattern). `apps/backend/src/index.ts` is not modified per block guardrails.

## Tile map deferral (Block 18.5)

Block 18 MVP intentionally excludes Leaflet/Mapbox/react-map dependencies. Map tiles and interactive map UI are deferred; server-side telematics powers text-based location display.
