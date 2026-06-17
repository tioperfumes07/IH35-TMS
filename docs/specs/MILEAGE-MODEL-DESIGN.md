# Mileage Model — Design & Grounding Spec

**Status:** Design / Docs only (no code, no DDL, no migration, no money path).
**Audience:** Engineering + Jorge (owner) + accountant/IFTA reviewer.
**Purpose:** Ground the mileage build blocks (E-3 odometer history → load mileage fields → actual miles → IFTA + reports → PC\*Miler). Jorge reviews before any code. Mirrors the rigor of `docs/specs/DRIVER-ESCROW-RESEARCH.md` and the A3 capped-recovery preflight.
**Date:** 2026-06-14

---

## 0. Executive summary

A trucking TMS must keep **three different mileage numbers** for the same trip, from **three different sources**, used for **three different purposes** — and must never conflate them:

| Mileage type | Source | Primary use |
|---|---|---|
| **Short / Shortest (HHG)** | PC\*Miler "Shortest"/Household-Goods (manual in Phase 1) | **Driver pay** |
| **Practical** | PC\*Miler "Practical" (manual in Phase 1) | **Customer invoicing** (rate-per-mile) |
| **Actual** | **Samsara** (ECU odometer; GPS fallback) | **True profitability** — MPG, cost-per-mile, pay/bill gap |

Plus a fourth, jurisdictional view derived from the same telematics: **IFTA per-state miles** (Samsara jurisdiction data, ECU-prioritized, GPS fallback), aggregated **per unit, per jurisdiction, per quarter**, paired with **fuel gallons by state** for the quarterly IFTA return. **Mexico miles are non-IFTA** (tracked, but excluded from the return — routing supports USA / MEX / CAN).

---

## 0.1 🔒 LOCKED RULE — the mileage two-number rule (governs PC\*Miler routing + Settlements)

**Status: LOCKED** — same standing as entity-independence and the Block-20 cash/accrual decisions. Given by Jorge; do not re-litigate, do not substitute one number for the other.

Every load computes and stores **two distinct truck-mile numbers**, feeding **two different consumers**:

| Number | Consumer | Rule |
|---|---|---|
| **`practical_miles`** | **CUSTOMER INVOICE** | Customer RPM shown on the invoice = **negotiated linehaul ÷ practical_miles**, with a **minimum floor of $3.00/mi**. The rate is negotiated (e.g. $6,450); practical miles set the *displayed* RPM; if the computed RPM falls below **$3.00/mi**, flag/warn and enforce the floor. Practical miles are the **customer-billing basis**. |
| **`shortest_miles`** (a.k.a. `short_miles` / HHG) | **DRIVER PAY** | Driver settlement pay is computed on **shortest miles, never practical**. |

**Both are stored per load** (`loads.practical_miles` + `loads.short_miles`, each with its `*_source`; per-entity TRANSP). They are different values for different purposes — **never use practical where shortest belongs, or vice-versa.**

**Cross-reference (so a future agent wires the correct number):**
- **PC\*Miler routing block (`PCMILER-ROUTING`)** must compute BOTH (RouteType=Practical and RouteType=Shortest), store both, surface `practical_miles` + computed RPM (with the $3/mi floor) to the **invoice** side, and expose `shortest_miles` as the mileage input to the **settlement** side.
- **Settlements Tier-1 chain** consumes **`shortest_miles`** for driver pay — coordinate, do not double-write the mileage.
- **Dispatch / Book Load** (`DISPATCH-MODULE-SPEC.md`) captures the stops these miles route from; the §C address is the geocode source (`PCMILER-GEOCODE`).

The split itself (practical→invoicing, shortest→driver pay) is also reflected in the §0 table above and §2 / §6A below; this callout adds the **$3.00/mi customer-RPM floor** and the explicit consumer cross-reference so the rule survives between agents.

**This is already half-modeled in the repo.** Migration `0019_cust_driver_fields.sql` defines `mdata.miles_basis AS ENUM ('short_miles','practical_miles')` and stamps the *basis choice* on each party: `mdata.customers.default_billing_miles_basis` (default `practical_miles`) and `mdata.drivers.pay_basis` (default `short_miles`). What is missing is the **actual mile numbers per load**, the **source of each number**, the **actual/odometer feed**, and the **IFTA + profitability rollups**. This doc specifies those.

**PC\*Miler is phased (decision LOCKED — Jorge is in talks to acquire the Trimble/PC\*Miler API):**
- **Phase 1 (build now):** `practical_miles` and `short_miles` are **manually entered, editable, audited** fields on the load.
- **Phase 2 (after API acquired):** a PC\*Miler integration auto-fills the *same* fields from the stop list + route setting; the manual override remains (audited).
- **The schema is identical in both phases — only the `source` changes.** Every mileage number carries a `source` (`MANUAL | PCMILER | SAMSARA`) so its origin is tracked and auditable.

**Proof point / UX model:** AllWays Track (Jorge's current TMS) exposes a **Rate Calculator** — a stop-by-stop *city / state / zip / country* grid with a **Route toggle {Practical, Shortest}** → **Total Miles** → ×Rate → **Amount**. We replicate this UX so Jorge keeps his workflow; in Phase 1 the operator types the miles, in Phase 2 PC\*Miler fills them from the same stop grid.

---

## 1. Data model

All distances are **integer miles** (whole miles; matches PC\*Miler/IFTA reporting granularity). Cents stay cents elsewhere. Nothing here posts to the GL — these are operational + reporting facts that *feed* pay (drivers) and billing (invoices), which already have their own posting paths.

### 1.1 Per-load mileage (extends `mdata.loads`, migration 0034)

Add three nullable mile numbers, **each with its own source**:

| Column | Type | Notes |
|---|---|---|
| `short_miles` | `int NULL` | HHG/shortest; drives **driver pay** (with `drivers.pay_basis`) |
| `short_miles_source` | `mdata.mileage_source NULL` | `MANUAL` now → `PCMILER` later |
| `practical_miles` | `int NULL` | drives **customer billing** (with `customers.default_billing_miles_basis`) |
| `practical_miles_source` | `mdata.mileage_source NULL` | `MANUAL` now → `PCMILER` later |
| `actual_miles` | `int NULL` | from Samsara; drives **profitability/MPG/CPM** |
| `actual_miles_source` | `mdata.mileage_source NULL` | `SAMSARA` (ECU) or `SAMSARA_GPS` fallback |
| `mileage_route_setting` | `text NULL` | `practical | shortest` — the AllWays "Route toggle" used when the manual/PC\*Miler number was produced |

New enum (additive): `CREATE TYPE mdata.mileage_source AS ENUM ('MANUAL','PCMILER','SAMSARA','SAMSARA_GPS')`.

**Why per-field source (not one load-level source):** the three numbers come from different systems and can disagree by design (that disagreement *is* the pay/bill-vs-actual insight). The source must be answerable per number for audit ("who/what produced practical_miles = 612?").

**Audit (locked accounting principle — every mileage edit logged, admin/owner only):** edits to `short_miles` / `practical_miles` (Phase-1 manual entry and Phase-2 overrides) emit an append-only audit row to the existing `audit.audit_events` spine (`event_class = 'load.mileage_edited'`, payload: load_id, field, old, new, source, actor). This is the same audit spine used across the app — no new audit table. Role-gate the edit endpoint to Owner/Administrator/Accountant.

### 1.2 Per-unit odometer history (the **E-3 table**)

The authoritative feed for **actual miles** and for **maintenance service intervals** (Block E/AO). Append-only, never updated:

`telematics.unit_odometer_readings`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `operating_company_id` | `uuid NOT NULL` | RLS-scoped |
| `unit_id` | `uuid NOT NULL` | → `mdata.units` |
| `samsara_vehicle_id` | `text NULL` | provenance |
| `reading_mi` | `int NOT NULL` | odometer value in miles |
| `source` | `text NOT NULL` | `SAMSARA_ECU | SAMSARA_GPS | MANUAL` |
| `captured_at` | `timestamptz NOT NULL` | reading time (from Samsara) |
| `ingested_at` | `timestamptz DEFAULT now()` | |

The odometer is **already live** in `integrations.samsara_vehicles.raw_payload` (kept fresh by the existing Samsara master-sync / positions / webhook-projection crons; see `apps/backend/src/mdata/unit-aggregate.service.ts` which already parses `raw_payload`). The E-3 table is a **typed, append-only projection** of that value so trips can be measured by odometer delta and service intervals can read a clean series instead of re-parsing `raw_payload` each time. (This is the "E-2/E-3" option from the mileage-cron decision: persist a typed odometer series rather than read raw live.)

### 1.3 Per-load fuel + repair linkage (for cost-per-mile)

Cost-per-mile = (fuel + repairs + pay) ÷ **actual_miles**. The numerator components already exist; this section defines how they attach to a load/unit/period for the report:

- **Fuel:** fuel-card transactions (Love's/Relay/Comdata feeds) carry unit/driver + timestamp + **state**; attribute to a load by (unit, time-window overlapping the load's dispatch→delivery) or by an explicit `load_id` when present. The fuel-posting path already exists (`apps/backend/src/accounting/fuel-posting/poster.service.ts`).
- **Repairs:** maintenance Work Orders / parts costs by unit + date (maintenance module); attribute by unit + period.
- **Pay:** the driver settlement amount for the load (already computed via `drivers.pay_basis × short_miles`).

No new posting — the report **reads** these existing facts and divides by `actual_miles`.

### 1.4 Per-unit / per-jurisdiction / per-quarter IFTA miles

`telematics.ifta_jurisdiction_miles`
| Column | Type | Notes |
|---|---|---|
| `operating_company_id` | `uuid NOT NULL` | RLS |
| `unit_id` | `uuid NOT NULL` | |
| `jurisdiction` | `text NOT NULL` | US state / CA province code |
| `country` | `text NOT NULL` | `US | CA | MX` |
| `quarter` | `text NOT NULL` | e.g. `2026-Q2` |
| `miles` | `int NOT NULL` | from Samsara jurisdiction data (ECU-priority, GPS fallback) |
| `source` | `text NOT NULL` | `SAMSARA_ECU | SAMSARA_GPS` |
| `PRIMARY KEY (operating_company_id, unit_id, jurisdiction, quarter)` | | upsert per tick |

Paired at report time with **fuel gallons by state** from the existing `apps/backend/src/ifta/ifta-state-gallons-aggregator.ts`. **Mexico rows are stored but flagged `country='MX'` and excluded** from the IFTA return (no IFTA reciprocity with Mexico).

---

## 1A. Load mileage lifecycle — CORRECTED & LOCKED (2026-06-14)

**Correction to §1/§2 (Jorge's exact workflow):** the three mile numbers are **NOT all entered on one screen** — they fire at **different points in the load lifecycle** and drive **different documents at different times**.

| Lifecycle event | Mile number | Drives | When |
|---|---|---|---|
| **Load wizard** (dispatcher creates load + addresses) | practical (+ short) captured | — | Phase 2 PC\*Miler auto-fills **practical + short** from the addresses; Phase 1 manual entry |
| **Confirm load + assign driver** | **SHORT** | **VENDOR BILL** (driver-as-vendor = driver pay) | the moment the driver is assigned |
| **Load closed + delivered** | **PRACTICAL** | **CUSTOMER INVOICE** (billing / rate-per-mile) | at delivery |
| Continuous telematics | **ACTUAL** (Samsara ECU/GPS) | profitability only — **NOT entered, NOT invoiced** | streams in |

**Key corrections vs the earlier preview:**
- The load screen is **NOT** "enter all three numbers." On the LOAD, the dispatcher's mileage input is for **invoicing (practical)**. **SHORT** miles drive the **driver-settlement side** (the **vendor bill at assignment**). **ACTUAL** is automatic (Samsara).
- **Timing matters:** short → **vendor bill at ASSIGNMENT**; practical → **customer invoice at DELIVERY**. Build the triggers at those **two lifecycle events — not as one save**.

**True-profitability view (Jorge's analysis lens):** on the load/trip, surface (for Jorge, not invoiced) **charged practical miles vs actually-driven Samsara miles**, and the resulting **true $/actual-mile vs quoted $/practical-mile** — how Jorge sees real per-trip profit and real charge-per-mile.

→ This refines §2's source table (the *timing* column below) and §7 build-step 2 (load mileage fields acquire the two lifecycle triggers: short→bill@assign, practical→invoice@deliver).

---

## 2. Source of each number (the single most important table)

| Number | Phase 1 source | Phase 2 source | Stored where | Use |
|---|---|---|---|---|
| **short_miles** | **MANUAL** (load field, audited) | **PCMILER** (Shortest/HHG) | `loads.short_miles` (+source) | Driver pay |
| **practical_miles** | **MANUAL** (load field, audited) | **PCMILER** (Practical) | `loads.practical_miles` (+source) | Customer invoicing |
| **actual_miles** | **SAMSARA** (ECU odometer delta; GPS fallback) | SAMSARA (unchanged) | `loads.actual_miles` (+source), derived from `unit_odometer_readings` | Profitability / MPG / CPM |
| **IFTA per-state miles** | **SAMSARA** jurisdiction data (ECU-priority, GPS fallback) | SAMSARA (unchanged) | `ifta_jurisdiction_miles` | IFTA return |
| **Fuel gallons by state** | Fuel-card feed (state per txn) → `ifta-state-gallons-aggregator` | same | existing fuel posting + aggregator | IFTA + MPG |
| **MPG** | **Computed** = gallons ÷ actual_miles | same | report-time | Efficiency |
| **Cost-per-mile** | **Computed** = (fuel + repairs + pay) ÷ actual_miles | same | report-time | Profitability |
| **Pay/bill gap** | **Computed** = (short or practical, quoted) − actual | same | report-time | Leakage detection |

**Invariant:** PC\*Miler (Phase 2) only ever writes `short_miles` / `practical_miles` with `source='PCMILER'`. It **never** touches `actual_miles` (that is always Samsara) — the whole point is to compare quoted (PC\*Miler/manual) vs driven (Samsara).

---

## 3. Actual-miles derivation — odometer-delta vs Samsara Trip API

Two ways to get `actual_miles` for a load from Samsara:

**Option A — ECU odometer delta (RECOMMENDED as primary).**
`actual_miles = odometer_at(delivery_time) − odometer_at(dispatch_time)` for the assigned unit, read from `unit_odometer_readings` (ECU source). 
- ✅ ECU odometer is the **legal/audit-grade** distance source (the same number IFTA auditors accept); matches the truck's dash.
- ✅ Already flowing into `samsara_vehicles.raw_payload`; the E-3 table makes the delta a simple windowed query.
- ⚠️ Requires a reading near each of the two timestamps; needs a unit-swap guard (if the load changed trucks mid-haul, sum per-unit segments).

**Option B — Samsara Trips / Distance API (RECOMMENDED as fallback / cross-check).**
Samsara exposes trip distance (GPS-derived) per vehicle over a time range.
- ✅ Works even when discrete odometer readings are sparse.
- ⚠️ GPS-derived → can drift vs ECU; not the IFTA-preferred basis.

**Recommendation:** **odometer-delta primary, Trip-API fallback.** Compute `actual_miles` from the ECU odometer delta; if either endpoint reading is missing or a unit swap breaks the delta, fall back to the Trips/Distance API and stamp `actual_miles_source = 'SAMSARA_GPS'`. This mirrors the IFTA rule hierarchy (ECU/odometer preferred; GPS acceptable as a documented fallback).

---

## 4. Report targets — match AllWays Track's catalog

Replicate Jorge's existing report set so he keeps his reporting muscle memory. Each report is **read-only** over the facts above (no new posting). Columns:

**4.1 Miles & Fuel per State** (per quarter, fleet)
`Jurisdiction | Country | Total Miles | Taxable Miles | Gallons | MPG | (source flags)`

**4.2 Miles & Fuel per State per Truck**
`Truck | Jurisdiction | Total Miles | Gallons | MPG | source`

**4.3 IFTA Audit** (defensible trail)
`Unit | Quarter | Jurisdiction | Miles | Miles source (ECU/GPS) | Gallons | Gallons source (card) | Exceptions (missing readings, GPS fallback, MX excluded)`

**4.4 Miles & Gallons per Truck**
`Truck | Period | Actual Miles | Gallons | MPG`

**4.5 Fuel Card MPG Analysis**
`Card / Driver / Truck | Gallons | Actual Miles | MPG | vs fleet avg | outliers`

**4.6 Revenue & Cost — By Truck**
`Truck | Revenue | Fuel | Repairs | Driver Pay | Actual Miles | Cost/mile | Revenue/mile | Margin $ | Margin %`

**4.7 Revenue & Cost — By Customer**
`Customer | Loads | Practical Miles (billed) | Revenue | Allocated Cost | Margin $ | Margin % | Revenue/practical-mile`

---

## 5. IFTA rollup

- **Grain:** per **unit × jurisdiction × quarter** miles (`ifta_jurisdiction_miles`) + **gallons by state** (`ifta-state-gallons-aggregator`).
- **Quarterly return shape (per jurisdiction):** `Total Miles · Taxable Miles · Taxable Gallons (= taxable miles ÷ fleet MPG) · Tax-Paid Gallons (fuel bought in-state) · Net Taxable Gallons · Tax Rate · Tax Due/Credit`.
- **Fleet MPG basis:** total fleet actual miles ÷ total fleet gallons for the quarter (IFTA computes taxable gallons from the average fleet MPG, not per-truck).
- **Base jurisdiction:** **Texas (TX)** — the carrier's IFTA base; the return is filed with TX and apportioned across travelled jurisdictions.
- **Mexico:** miles tracked (`country='MX'`) but **excluded** from the IFTA return (no IFTA reciprocity); surfaced separately for total-operations visibility.
- **Periods:** calendar quarters (Q1 Jan–Mar, Q2 Apr–Jun, Q3 Jul–Sep, Q4 Oct–Dec); filing due end of month following quarter-end.

---

## 6. Answered — decisions LOCKED (2026-06-14)

All six open questions are resolved by Jorge. These are binding for the build sequence (§7).

1. **Actual miles → ECU odometer-delta PRIMARY, Samsara GPS Trip-API FALLBACK.** Stamp `actual_miles_source` = `SAMSARA` (ECU delta) vs `SAMSARA_GPS` (trip-API fallback). *(accepted rec — §3.)*
2. **Fuel-by-state → AUTOMATIC from fuel-card feeds.** Relay and any card carries purchase **location/address/state**, so `ifta-state-gallons-aggregator` reads the state per transaction automatically. **ALSO (new, from now on):** the fuel **state/location** is a **REQUIRED captured field at point of entry** — on **diesel-code approval** AND any **fuel expense**. This is a **SHARED data point with the Relay-internal-bank design** — build the captured field ONCE; both IFTA (gallons-by-state) and Relay reconciliation read it. *(Build task: confirm/point the aggregator's input feed at this captured field.)*
3. **IFTA base jurisdiction = TEXAS (TX).** Confirmed.
4. **Manual entry → simple editable load fields as the v1 MVP.** The AllWays-style stop-list mini-tool (city/state/zip/country grid + Practical/Shortest toggle → Total Miles) is a **later follow-up** (also feeds per-stop jurisdictions). *(accepted rec.)* **[PC\*Miler access RESOLVED — phased manual → API.]**
5. **Unit-swap on a single load → SUPPORTED in v1.** When a load changes trucks mid-haul, **sum per-unit odometer segments** for `actual_miles`.
6. **Per-load basis override → ALLOWED in v1.** A load may override `drivers.pay_basis` / `customers.default_billing_miles_basis`; the override is **audited** (`load.mileage_basis_overridden` event).

> **CROSS-LINK:** the fuel **location/state capture** (answer 2) is shared with the **Relay-internal-bank design** (diesel-code approval / fuel expense carry load/driver/(reefer-hours)/STATE+LOCATION). Build the captured field once; used by both IFTA and Relay reconciliation.

---

## 7. Proposed build sequence (document, do NOT build)

1. **E-3 odometer history** — `telematics.unit_odometer_readings` + a projector that writes ECU/GPS odometer from `samsara_vehicles.raw_payload` (reuses the existing Samsara sync; also unblocks Block E/AO service intervals).
2. **Load mileage fields + the lifecycle triggers (§1A) + manual entry + source tracking** — `loads.{short,practical,actual}_miles` (+ `*_source`, `mileage_route_setting`), audited edit endpoint (Owner/Admin/Accountant). Wire the two lifecycle triggers, NOT one save: **short → vendor bill at driver assignment**, **practical → customer invoice at delivery**. *(Phase-1 manual entry; practical entered in the load wizard.)*
3. **Actual miles from Samsara** — odometer-delta per load (Trip-API fallback) → `loads.actual_miles`.
4. **IFTA rollup + reports** — `ifta_jurisdiction_miles` + gallons-by-state → the §4 report catalog + the §5 quarterly return.
5. **PC\*Miler integration** (when API acquired) — auto-fills `short_miles`/`practical_miles` from the stop list + route toggle, flips their `source` to `PCMILER`; manual override stays (audited). **Schema unchanged from step 2.**

Each step is its own block/PR under the standing rules (fresh branch, migration conventions, audit spine, never self-merge). Steps 1–4 are operational/reporting (no GL posting); pay and billing continue to consume `short_miles`/`practical_miles` through their existing posting paths.

---

## 8. Sources

- In-repo ground truth: `db/migrations/0019_cust_driver_fields.sql` (`mdata.miles_basis` ENUM; `customers.default_billing_miles_basis`; `drivers.pay_basis`), `db/migrations/0034_loads_schema.sql` (`mdata.loads`), `apps/backend/src/ifta/ifta-state-gallons-aggregator.ts`, `apps/backend/src/mdata/unit-aggregate.service.ts` (parses `samsara_vehicles.raw_payload`), `apps/backend/src/accounting/fuel-posting/poster.service.ts`.
- AllWays Track (Jorge's current TMS) — Rate Calculator (stop-by-stop city/state/zip/country grid + Practical/Shortest route toggle → Total Miles → ×Rate → Amount) and report catalog (Miles & Fuel per State, …, Revenue & Cost by Truck/Customer). *(Verified in-product this session.)*
- Trimble / PC\*Miler — Practical vs Shortest vs Household-Goods (HHG) mileage types; ALK/PC\*Miler API for routing + mileage: https://www.pcmiler.com/ · https://developer.trimblemaps.com/
- Samsara API — vehicle stats (odometer: `gatewayOdometerMeters` / `obdOdometerMeters`), trips/distance, and IFTA jurisdiction mileage report: https://developers.samsara.com/ · IFTA report: https://www.samsara.com/products/telematics/ifta/
- IFTA, Inc. — International Fuel Tax Agreement (per-jurisdiction miles + gallons, quarterly returns, average-fleet-MPG taxable-gallons method): https://www.iftach.org/
- FMCSA / Household Goods Mileage Guide (HHG / "short" miles basis for owner-operator and driver pay): https://www.fmcsa.dot.gov/
- Industry model corroboration — McLeod LoadMaster and Alvys both keep distinct billed vs paid vs actual mileage and IFTA jurisdiction rollups: https://www.mcleodsoftware.com/ · https://alvys.com/

---

*Prepared as grounding for the IH35 Dispatch mileage build blocks. No application code, schema, or DDL is implied or authorized by this document; it informs later design/spec blocks under Jorge's standing rules (audit spine on every mileage edit, migration conventions, never self-merge). PC\*Miler is phased manual → API with an identical schema; every mileage number carries its source.*
