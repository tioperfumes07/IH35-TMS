# ONE-ITEM INSTRUCTIONS — ALL SEATS — 2026-09-05 22:45Z
**Owner rulings 22:40Z: "i need instructions for each" · "you are lead again."**
Claude Lead = registrar + auditor + deployer from this line. Cursor = builder on its own vertical only.
Method unchanged (LAW §0d): one item per seat, strictly serial, done bar below, no Chrome until the module checklist is empty.

**DONE BAR for every item:** schema exists AND migration applied on prod · endpoint returns real USMCA rows on the scoped predicate (count + predicate pasted) · FE reads the field (file:line) · both-way linkage declared · ONE guard `scripts/verify-*.mjs` with `--selftest`, wired in `scripts/verify-steps/`, runs in CI on the PR · merged sha · UTC deadline · surrender seat · auditor re-measures before ✔.
**DONE LINE (the only accepted report):** `SEAT | <ITEM> DONE | <merge sha> | <guard> --selftest N/N | <the measured numbers, now passing> | NEXT <item>`
**Deploys:** Claude Lead triggers API + FE within 20 minutes of any merged code PR. Seats never deploy. Post "DEPLOY-REQUEST" on your OUTBOX if 20 minutes pass.

---

## CURSOR — item CUR-1 · deploy timer post-mortem + banner measurement (own vertical only)
- **Measured:** API live sat on `d988cd31` from 19:37Z to 22:40Z; FE on `4730d5ac` from 21:08Z. Merged and undeployed in that window: #20724 M.3, #20727 #41, #20738/#20748 driver-vendor, #20740 DP2, #20741/42/45/46 K.4–K.7. Your 20-minute deploy law (LAW §0b, your own file) did not fire for 3 h 03 m. Lead deployed both at 22:40Z (dep-dae9ktn40ujc73ece7hg, dep-dae9kvuq1p3s738fftn0).
- **Required:** (1) a written post-mortem on OUTBOX-CURSOR: what the timer is (cron? manual loop? which process), why it stopped, with the log line or its absence. No narrative beyond that. (2) You no longer deploy; remove/disable your timer so two deployers cannot collide. (3) Row 51 — top banner: measure `TopStatusBar.tsx` + `ModuleHeader.tsx` rendered heights in px on the live FE after this deploy vs the spec (26 px top bar / 22 px module banner) and the Dispatch Board Preview PDF; post the numbers only. No fix until the numbers are on the bus.
- **Guard:** none for (1)(2); (3) is a measurement.
- **Deadline:** 23:30Z. **Surrender:** none — measurement only.

## CC-1 — item ACC-49 · Journal entry Debit / Credit columns + totals
- **Measured:** `apps/frontend/src/pages/accounting/journal-entries/JournalEntryDetailPage.tsx:224-233` renders a "Side" text column (`posting.debit_or_credit`) and one "Amount" column. No Debit column, no Credit column, no footer totals, no balance indicator. Source rows: `accounting.journal_entry_postings` (`account_id`, `debit_or_credit`, `amount_cents`). Live: 556 USMCA journal entries.
- **Rule:** QuickBooks/NetSuite GL presentation; owner 21:5xZ "debit and credit side on the correct column and totals".
- **Required value:** columns Account · Description · Class · **Debit** · **Credit** (money right-aligned, tabular-nums, the opposite side blank — never "0.00"); footer row **Total Debits / Total Credits / Difference**; Difference must equal 0.00 and render red with the words "OUT OF BALANCE" otherwise; totals equal `journal_entries.debit_total_cents` / `credit_total_cents`. Extract the grid as `components/accounting/PostingGrid.tsx` and mount the SAME component on the Journal tab of Expense, Bill and Invoice detail pages (read model: postings by `source_transaction_type` + `source_transaction_id`). Remove nothing; the "Side" column may stay hidden-by-default.
- **Guard:** `scripts/verify-je-debit-credit-columns.mjs` — asserts PostingGrid renders Debit and Credit columns and a totals footer; `--selftest` mutates the component to drop the Credit column and must fail; live mode: for every USMCA JE, sum(debit)=sum(credit)=debit_total_cents.
- **Linkage:** accounting.journal_entry_postings ↔ catalogs.accounts ↔ source documents (expenses/bills/invoices) ↔ mdata.loads.
- **One PR.** **Deadline 00:45Z.** **Surrender:** Cursor.

## CC-2 — item DSP-48 · Google reference miles per leg in Book Load §C
- **Measured:** Owner 19:4xZ ruling in LAW §2 row "Google distance = REFERENCE ONLY". Routes API enabled on the owner's key 19:39Z (same `GOOGLE_PLACES_API_KEY`). Wizard §C today shows Practical / Short / Empty miles only (`BookLoadStopsSection.tsx` miles strip); no reference figure. Stops now carry lat/lng on pick (Place Details, live since 18:19Z).
- **Required value:** backend `POST /api/v1/geocoding/route-reference` in `integrations/google/` — body `{legs:[{from:{lat,lng},to:{lat,lng}}]}` → Google Routes `computeRoutes` (travelMode DRIVE, `X-Goog-FieldMask: routes.distanceMeters,routes.duration`), one call per leg, returns miles (1 decimal) + minutes; server-side key; 5-minute in-memory cache by rounded coords. Wizard §C: under each of Practical / Short / Empty miles a grey read-only line `Google ref 1,214.3 mi · 18 h 40 m` computed from yard→pickup (Empty), pickup→…→delivery (Practical & Short reference is the same Google figure), never editable, never copied into the inputs, never in pay/RPM/settlement. Persist per leg on save: `mdata.load_stop_legs.google_reference_miles numeric(9,1)`, `google_reference_fetched_at timestamptz` (migration, CC-1 lane rule: you draft, CC-1 applies in its lane if it is not your lane — say so in the PR). Nightly job NULLs rows older than 30 days (Google terms). Label on hover: "Google car routing — reference only".
- **Guard:** `scripts/verify-google-reference-miles.mjs` — asserts the miles inputs are never written by the reference code path (grep + component test), asserts expiry job exists; `--selftest` plants a write into `miles_practical` and must fail.
- **Linkage:** mdata.load_stops (lat/lng) → load_stop_legs (reference) ↔ mdata.loads. No money linkage by design.
- **One PR.** **Deadline 01:00Z.** **Surrender:** Cursor.

## CC-3 — item SET-RATE · settlement detail rate source + no fake zeros
- **Measured live (FE 25eeb90b, 15:3xZ, settlement of driver on load 13526):** Earnings row shows `1,610.0 mi · $0.6000 · $724.50` — $724.50 / 1,610.0 = **$0.4500**, so the displayed rate is not the rate that produced the amount; load 13567 shows `$0.4700` vs implied `$0.4500`. Empty Miles rows show `0.0 / $0.0000 / $0.00`.
- **Rule:** LAW §8 "Zero is a claim"; §2 driver pay = short miles × rate card, two lines always (loaded + empty).
- **Required value:** the rate column reads the SAME source the amount was computed from — `driver_finance.settlement_lines.rate_cents_per_mile` written at line creation from the driver's rate card (`rate_loaded_per_mile_cents` / `rate_empty_per_mile_cents`); if the line predates the column, backfill `rate = amount_cents / miles` only when miles > 0 and flag `rate_source='derived'`. When miles are unknown the row renders `—` and a reason ("no telematics miles for this leg"), never 0.0 / $0.0000 / $0.00. Display 4 decimals for rate, 1 for miles.
- **Guard:** `scripts/verify-settlement-line-rate-consistency.mjs` — live: for every USMCA settlement line with miles > 0, |amount − miles×rate| ≤ 1 cent; no line renders a zero triple; `--selftest` plants a mismatched rate and must fail.
- **Linkage:** driver_finance.settlement_lines ↔ driver_finance.driver_bills ↔ mdata.loads ↔ mdata.drivers (rate card) ↔ accounting.journal_entries.
- **One PR.** **Deadline 00:45Z.** **Surrender:** CC-1.
- Boarded, not yours to fix now: duplicate drivers Hugo Gaytan / Genaro Guerrero — lead places it after SET-RATE.

## CODEX — item TEL-39 · Samsara driver mirror: deactivated drivers + resync
- **Measured (Neon 19:1xZ):** `integrations.samsara_drivers` 78 rows, all `active`, `max(updated_at)` = 2026-05-31 23:12Z. Samsara live (owner session 15:0xZ): 30 active + 727 deactivated = 757. Your #20656/#20664 shipped roster status + freshness code (merged, deploying now) — the COLLECTOR has still not pulled deactivated drivers.
- **Required value:** collector calls `GET /fleet/drivers?driverActivationStatus=deactivated` (paginated, `after` cursor) in addition to active; upsert by `samsara_driver_id`, keep `raw_payload`, set `driver_activation_status`; link to `mdata.drivers` by license number then exact name, never create duplicates; run on the existing `5 */12 * * *` schedule AND once now via `POST /api/v1/integrations/samsara/drivers/resync` (admin). After the run: rows ≥ 757, 0 rows with `driver_activation_status IS NULL`, `max(updated_at)` today. The roster page you built shows Active / Deactivated / All from this mirror.
- **Guard:** `scripts/verify-samsara-driver-mirror-complete.mjs` — live: count ≥ 757, null-status = 0, freshness < 24 h; `--selftest` plants an active-only fetch and must fail.
- **Linkage:** integrations.samsara_drivers ↔ mdata.drivers ↔ mdata.units (current assignment) ↔ safety.
- **One PR.** **Deadline 01:00Z.** **Surrender:** CC-3.

## CASCADE / DEVIN — item LST-DUP · duplicate master-records report (Lists/Reports)
- **Measured (READ-FIRST §6, live 09-03; CC-3 today):** `mdata.drivers` 264 rows with duplicates ANGEL ALFONSO SOSA ×3, Raul Esmeregildo Perez ×3, Armando Perez ×3, Ruben Pedro Perez Garcia ×2; CC-3 22:2xZ: Hugo Gaytan and Genaro Guerrero duplicated with one open/unposted settlement and no vendor on the shadow row. No screen lists duplicates today.
- **Required value:** `GET /api/v1/reports/duplicate-masters?entity=drivers|customers|vendors` — groups by normalized name (upper, accents stripped, whitespace collapsed) + secondary key (license no. / MC# / EIN when present), returns group, row ids, which row has money (bills, settlements, invoices, vendor rows), which is newest. Report page under `pages/reports/DuplicateMastersReport.tsx` with entity switch, CSV + Print (your existing parity), row click → the record. Read-only; merging/voiding is NOT in this item.
- **Guard:** `scripts/verify-duplicate-masters-report.mjs` — live: drivers report returns ≥ 4 groups today (the four named + Gaytan/Guerrero); `--selftest` plants a case-sensitive grouping bug and must fail.
- **Linkage:** mdata.drivers / customers / vendors ↔ driver_finance.driver_bills ↔ accounting.invoices/bills.
- **One PR.** **Deadline 01:00Z.** **Surrender:** Codex.

---
Lead audits each DONE line on Neon + tip + live within 30 minutes; ✔/✗ posted on OUTBOX-<SEAT>. A PR outside your item is closed unmerged.


---
# ROUND 2 — issued 23:15Z

## CODEX — item TEL-40 · geocode the stops, build our geofences (no Samsara push yet) — deadline 2026-09-06 02:30Z
- **Measured (Neon 19:1xZ, re-read 23:1xZ):** active USMCA loads 78 → 156 stops, **0 with latitude/longitude**, `address_line1` NULL on the seeded stops (city/state/zip present); `geo.geofences` **2 rows** in the whole database; `mdata.locations` 10 USMCA rows; `geo.geofence_events` 0. Load 13526 stops: Uhrichsville OH 44683 / Mesquite TX 75149, lat/lng NULL.
- **Required value:** a service-layer job `telematics/stops-geocode-backfill.service.ts` that, for every active USMCA stop with NULL lat/lng, calls the existing geocoding path (`/geocoding` client → Google Text Search/Geocoding, city+state+zip when address is NULL), writes `load_stops.latitude/longitude` + `geocode_source` + `geocode_confidence`, and creates/links `mdata.locations` (dedupe by normalized address) and one `geo.geofences` row per location (enter 0.25 mi / exit 0.5 mi, LAW §2 hysteresis) keyed to the per-vehicle state table. Runs once now (admin `POST /api/v1/telematics/stops/geocode-backfill`) and on every new stop insert (hook in the stop service, not the HTTP route). Stops that cannot geocode are listed with the reason — never written as 0,0. **No Samsara `POST /places` in this item** (rows 40–43 await owner confirmation).
- **Guard:** `scripts/verify-stops-geocoded.mjs` — live: active USMCA stops with NULL lat/lng = 0 or each has `geocode_failure_reason`; geofences ≥ distinct locations; no (0,0) coordinates; `--selftest` plants a 0,0 write → FAIL.
- **Linkage:** mdata.load_stops ↔ mdata.locations ↔ geo.geofences ↔ geo.geofence_vehicle_state ↔ mdata.loads.
- **One PR.** **Surrender:** CC-3. (Moves R48c off Cursor's Dispatch list — Cursor keeps LDT-0…7.)
DONE LINE: CODEX | TEL-40 DONE | <sha> | verify-stops-geocoded --selftest N/N | stops null lat/lng <n> · geofences <n> · locations <n> | NEXT await lead

## CASCADE / DEVIN — item LST-LOC · Locations list (Lists module) — deadline 2026-09-06 02:30Z
- **Measured:** `mdata.locations` 10 USMCA rows; 156 active stops, 0 geocoded; `load_stops.location_id` set on ~1 of 114 (09-05 15:xxZ read). There is no Lists page for locations — dispatchers cannot see which places exist, which have a geofence, or which loads used them.
- **Required value:** `pages/lists/LocationsListPage.tsx` + `GET /api/v1/lists/locations` (USMCA-scoped): columns Name · Address · City · ST · ZIP · Lat/Lng (or "not geocoded") · Geofence (yes/no, radii) · Landmarks (count) · Loads using it (count, click → filtered load board) · Last used · Source (Google / Samsara / manual). Inline filter bar visible on load (Search · State · Geocoded yes/no · Geofence yes/no · Source), CSV + Print (your parity), row click → location detail drawer (read-only; edit goes through the Book Load picker path). No creation here.
- **Guard:** `scripts/verify-locations-list.mjs` — route mounted, columns present, filters inline (≥5 controls, 0 clicks), USMCA predicate in the query; `--selftest` removes the company predicate → FAIL.
- **Linkage:** mdata.locations ↔ mdata.load_stops ↔ geo.geofences ↔ mdata.loads.
- **One PR between you.** **Surrender:** Codex.
DONE LINE: CASCADE | LST-LOC DONE | <sha> | verify-locations-list --selftest N/N | locations <n> · geocoded <n> · with geofence <n> | NEXT await lead
