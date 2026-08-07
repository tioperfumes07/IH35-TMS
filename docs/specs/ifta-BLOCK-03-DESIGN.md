# BLOCK-03 — IFTA Quarterly Fuel-Tax Engine v2 — Design Spec (DESIGN-ONLY / BUILD-AND-SHIP)

> **HOLD LANGUAGE SUPERSEDED — OWNER LAW 2026-08-03 / owner directive 2026-08-06.** There are NO holds and no approval gate. All owner questions are asked-and-answered. Coders build, apply on Neon, and MERGE ON GREEN with proof. Any "build-and-hold", "Jorge merges", "never self-merge" or "wait for approval" wording below is HISTORICAL RECORD ONLY and must not be followed.

**Status:** Design / docs only. No code, no DDL, no migration, no posting. Behind a feature flag,
default **OFF**. Never self-merged; this doc is a HOLD-FOR-JORGE artifact per the Tier-1 lane rule.
**Audience:** Jorge (owner/filer) + accountant/IFTA preparer + next building agent.
**Date:** 2026-07-05.
**Locked inputs (Jorge, 2026-07-05):** build in-house; model how AllwaysTrack/McLeod/Alvys do it;
apportion on TRIP/practical miles (not shortest); discount personal-conveyance miles; quarterly, per
jurisdiction, US states + Mexico for the Laredo↔Mexico cross-border leg; Jorge/company files (not an
auto-e-file integration).

---

## 0. STOP — drift flag (read this before building anything)

**IFTA is not greenfield in this repo.** A working v1 already exists under **GAP-42** (P6-T2/T3). Before
this doc's v2 proposal is built, Jorge must decide: **extend v1 additively (recommended) or replace it.**
This is exactly the "two files disagree" case in `CLAUDE.md` §9 — flagging per that rule rather than
silently picking a schema.

| | **v1 — already built (GAP-42)** | **BLOCK-03 ask (this doc)** |
|---|---|---|
| Schema | `ifta.quarterly_preparations`, `ifta.state_miles_by_quarter`, `ifta.state_gallons_by_quarter`, `ifta.state_tax_by_quarter`, `reports.ifta_filings`, `samsara.vehicle_state_miles` | `ifta_quarter`, `ifta_jurisdiction_miles`, `ifta_fuel_by_jurisdiction`, `ifta_return` (named in the task) |
| Miles source | `samsara.vehicle_state_miles` (Samsara jurisdiction-crossing feed, ECU-priority/GPS-fallback) — **US states only** | "TRIP miles = PRACTICAL (not shortest)" + Mexico |
| Personal conveyance | Not excluded | Must be discounted |
| Fuel-by-jurisdiction | `ifta.state_gallons_by_quarter` (`source: mixed`, `source_records` jsonb — fuel-card/bill derived) | Relay ingest (`relay_fuel_transactions`, not yet built) + fuel bills |
| Tax rates | Static repo JSON `apps/backend/src/ifta/ifta-tax-rates.json`, freshness enforced by `scripts/verify-ifta-tax-rates-current.mjs` | DB catalog `reference.ifta_tax_rates` |
| Calc method | Fleet-average-MPG method (`ifta-tax-calculator.ts`) — **this matches the real IFTA method**, keep it | Same method, extended jurisdiction set |
| Output | CSV only (`ifta-csv-generator.ts` → R2) | PDF (Jorge's tax-doc rule, §7) |
| UI | 4-step wizard `/reports/ifta-preparer`, owner-approve + WF-064 2-step confirm | Same UX pattern, extended |
| CI guard | `verify-ifta-quarterly-preparer.mjs`, `verify-ifta-aggregator-determinism.mjs`, `verify-ifta-tax-rates-current.mjs` | New guards for jurisdiction-rate catalog + PC discount + Mexico-exclusion |

**Recommendation (for Jorge to confirm, not self-authorized here):** treat BLOCK-03 as a **v2 additive
extension of the existing `ifta.*` schema**, not a parallel set of tables under different names. Concretely:
add MX-jurisdiction rows + a `country` column + a `personal_conveyance_miles` column to
`ifta.state_miles_by_quarter` (rename-in-place is out per additive-only §7, so this would be new nullable
columns), add a `reference.ifta_tax_rates` catalog that the existing `ifta-tax-calculator.ts` reads instead
of the static JSON, and add a PDF renderer next to the existing CSV one. This reuses the already-built,
tested, RLS'd, CI-guarded engine instead of standing up a second one. The table names given in the task
(`ifta_quarter` etc.) are kept below as the **conceptual model** — §5 maps each to its concrete home in the
existing `ifta.*` schema, with the net-new-schema alternative also shown so Jorge can pick.

---

## 1. Real-world grounding (verified this session, not from memory)

- **IFTA total miles** = all miles operated by the qualified motor vehicle in the reporting period, in all
  jurisdictions (IFTA and non-IFTA), including trip-permit miles. **Taxable miles** = total miles minus each
  jurisdiction's own nontaxable/exempt miles. The existing fleet-average-MPG method
  (`taxable_gallons = jurisdiction_miles / fleet_MPG`) is the standard IFTA computation and is already
  correctly implemented in `ifta-tax-calculator.ts` — keep it, don't reinvent it. [IFTA Inc.](https://www.iftach.org/) ·
  [TruckLogics — What is IFTA](https://www.trucklogics.com/what-is-ifta)
- **IFTA member jurisdictions = the 48 contiguous US states + 10 Canadian provinces (58 total). Mexico is
  NOT an IFTA member.** This is a factual correction to the "US states + Mexican provinces" framing in the
  task: there is no IFTA jurisdiction to apportion Mexican miles/fuel into, and no IFTA reciprocity with
  Mexico. This matches the already-LOCKED rule in `docs/specs/MILEAGE-MODEL-DESIGN.md` §1.4/§5 ("Mexico rows
  stored but flagged `country='MX'` and excluded from the return"). BLOCK-03 tracks Mexico miles/fuel for
  cross-border operational visibility (cost-per-mile, driver dispatch, customs-crossing reporting) but they
  **do not appear on the filed IFTA return** — they are a separate non-IFTA report. [IFTA Inc. — Carrier
  Info](https://www.iftach.org/Carriers/) · [Geotab — What is IFTA](https://www.geotab.com/blog/what-is-ifta/)
- **Personal conveyance — genuinely mixed guidance, flagged rather than guessed.** The IFTA Procedures
  Manual's literal "total miles" definition is vehicle-based (all miles the qualified vehicle traveled,
  regardless of the driver's duty status), which would argue for **including** PC miles in total miles.
  ELD-vendor guidance (Samsara, Motive, AtoB) commonly treats personal-conveyance segments as a
  data-quality/reconciliation item to review weekly, and several carriers exclude short off-duty PC
  movements (hotel↔restaurant, truck-to-home) from jurisdiction totals on the theory those miles are not
  part of the qualified vehicle's commercial operation in that jurisdiction. **No source found states PC is
  a codified IFTA exemption line the way, say, a state's own PTO/reefer fuel exemption is.** Given this,
  BLOCK-03 implements the mechanism to identify and optionally discount PC miles (Jorge's explicit
  instruction) but does so as a **visible, audited adjustment** — never a silent subtraction — so the filed
  return and its backing audit trail show exactly what was excluded and why, and the carrier's actual filing
  preparer/CPA can confirm or override the treatment per return. [AtoB — Non-IFTA
  Miles](https://www.atob.com/blog/what-are-non-ifta-miles) · [Samsara — Personal Conveyance
  (PC)](https://kb.samsara.com/hc/en-us/articles/360059924612-Personal-Conveyance-PC) · [Samsara — IFTA
  Report](https://kb.samsara.com/hc/en-us/articles/360046354291-IFTA-Report)
- **Filing calendar (already correctly documented in this repo's compliance skill/reference):** Q1 due
  Apr 30, Q2 due Jul 31, Q3 due Oct 31, Q4 due Jan 31 (following year); the reporting quarter is the quarter
  of travel, not the filing month.
- **How McLeod / Alvys / AllwaysTrack actually do jurisdiction miles:** all three source jurisdiction miles
  from **ELD/telematics odometer or GPS crossing data** (ECU-priority, GPS-fallback) — never from a routing
  engine's "practical route" estimate — and apply the **fleet-average-MPG** method for taxable gallons. This
  is exactly what `samsara.vehicle_state_miles` / `ifta-state-miles-aggregator.ts` already do. This resolves
  the task's "apportion on TRIP miles = PRACTICAL miles (not shortest)" phrasing: read literally against
  IH35's own locked vocabulary, **`practical_miles`** is a specific PC\*Miler **customer-billing** field
  (`docs/specs/MILEAGE-MODEL-DESIGN.md` §0.1/§2), distinct from **`actual_miles`** (Samsara telematics,
  already the correct IFTA basis) — using the billing `practical_miles` field for IFTA would be wrong (it's
  a routing-engine estimate, not what the truck actually drove, and real carriers/software never file IFTA
  off a routing estimate). **Recommendation: "TRIP/practical miles" in the task means "real, as-driven trip
  miles" (i.e. `actual_miles`/telematics), not the billing `practical_miles` field — confirm with Jorge, flag
  resolved this way in the doc rather than silently building against the wrong column.**

---

## 2. Data sources (verified against `db/migrations/`)

| Source | Table / field | Status |
|---|---|---|
| Jurisdiction-crossing miles | `samsara.vehicle_state_miles` (`0372`) — `unit_id → mdata.units`, `state`, `miles`, `period_start/end`, `source` | **Built.** US states only today; add `country` + MX rows. |
| Per-quarter miles rollup | `ifta.state_miles_by_quarter` (`0372`) — `preparation_id → ifta.quarterly_preparations`, `state`, `miles`, `override_miles` | **Built.** No `country`/PC columns yet. |
| Per-quarter fuel gallons rollup | `ifta.state_gallons_by_quarter` (`0372`) — `preparation_id`, `state`, `gallons`, `source`, `source_records` jsonb, `override_gallons` | **Built.** `source_records` is where a future `relay_fuel_transactions` feed plugs in. |
| Relay fuel ingest | `relay_fuel_transactions` | **NOT YET BUILT.** Per `docs/specs/RELAY-INTERNAL-BANK-DESIGN.md`, Relay is the pre-funded fuel/expense wallet (diesel codes); the shared **STATE + LOCATION** field captured at diesel-code approval is designed to feed both Relay reconciliation and IFTA gallons-by-state (§20/§118 of that doc) but the dedicated `relay_fuel_transactions` table itself has not shipped. Until it exists, `ifta.state_gallons_by_quarter.source_records` should read fuel **bills** (`accounting.bills` fuel-category lines with a captured state/location) as the interim source, then add Relay as a second `source_records` provenance once it lands — do not block BLOCK-03 on Relay shipping. |
| HOS / personal-conveyance | `hos.duty_status_events` (`0219`) — append-only; `duty_status` enum includes `'personal_conveyance'`; `unit_id`, `driver_id`, `started_at`/`ended_at`, `odometer_mi` | **Built.** This is the exclusion source: sum odometer delta (or GPS-segment distance) for `duty_status = 'personal_conveyance'` windows, per unit/jurisdiction/quarter, to compute a `personal_conveyance_miles` figure to subtract per §1's audited-adjustment approach. |
| Tax rates | `apps/backend/src/ifta/ifta-tax-rates.json` (static, sourced from iftach.org, freshness CI-guarded) | **Built, proposed replacement:** `reference.ifta_tax_rates` catalog (§4). |
| Filing lifecycle | `reports.ifta_filings` (`202606080205`) — draft→review→owner_approved→filed, `filing_data` jsonb | **Built.** Overlaps conceptually with `ifta.quarterly_preparations` (`202606080205` vs `0372`/`0373` — two lifecycle tables were built close together; reconcile which is canonical when this block is picked up, do not add a third). |
| Units / entity scope | `mdata.units` (`owner_company_id` / `currently_leased_to_company_id`) | Existing landmine (§4 root CLAUDE.md): IFTA rows must scope by the **operating carrier that dispatched the unit for the quarter**, not unit ownership — TRK owns trucks but TRANSP/USMCA file their own IFTA returns for units they operate. |

---

## 3. The calculation (per jurisdiction, per quarter)

1. **Total jurisdiction miles** = `Σ actual/telematics miles` for the unit(s) in that jurisdiction for the
   quarter (`samsara.vehicle_state_miles`, ECU-priority/GPS-fallback — already correct per §1).
2. **Personal-conveyance miles** = `Σ` odometer/GPS-segment miles where `hos.duty_status_events.duty_status =
   'personal_conveyance'` overlaps that jurisdiction/quarter window.
3. **Taxable miles** = total jurisdiction miles − personal-conveyance miles (the audited discount, §1) −
   any other jurisdiction-specific exempt miles (none configured today; extensible).
4. **Fleet MPG** = `Σ actual miles (all jurisdictions)` ÷ `Σ gallons purchased (all jurisdictions)` for the
   quarter — the standard IFTA fleet-average method, unchanged from the existing `ifta-tax-calculator.ts`.
5. **Taxable gallons** = taxable miles ÷ fleet MPG.
6. **Tax-paid gallons** = gallons actually purchased in that jurisdiction (from fuel bills / Relay once built).
7. **Net taxable gallons** = taxable gallons − tax-paid gallons.
8. **Tax owed/credit** = net taxable gallons × that jurisdiction's rate for the quarter (`reference.ifta_tax_rates`,
   §4). Negative = credit.
9. **Roll up** every jurisdiction's row into the quarterly return total (`ifta_return` / `reports.ifta_filings`).
10. **Mexico rows** are computed identically (miles + fuel) for operational reporting but are **excluded from
    the summed return total** and rendered on a separate "non-IFTA / Mexico operations" section of the PDF
    (§7) — never blended into the filed jurisdiction list (§1 factual correction).

This is additive to, not a rewrite of, `calculateStateTaxes()` in `ifta-tax-calculator.ts` — it needs three
new inputs (personal-conveyance miles, MX rows flagged non-filing, rates from a table instead of the JSON)
layered onto the same function shape.

---

## 4. Reference data — `reference.ifta_tax_rates` catalog (proposed, replaces static JSON)

Matches the existing repo pattern for quarterly/versioned reference catalogs (`0342_reference_oem_parts.sql`,
`0340_reference_driver_lookups.sql` — `reference.*` schema, not entity-scoped since tax rates are public data,
not tenant data).

```
reference.ifta_tax_rates
  id                uuid PK
  jurisdiction_code  text NOT NULL        -- 'TX', 'CA', ... (US) / 'ON', 'QC', ... (CA provinces)
  jurisdiction_country text NOT NULL CHECK (jurisdiction_country IN ('US','CA'))  -- MX intentionally excluded, see §1
  quarter            smallint NOT NULL CHECK (quarter BETWEEN 1 AND 4)
  year               smallint NOT NULL
  rate_per_gallon    numeric(8,4) NOT NULL
  fuel_type          text NOT NULL DEFAULT 'diesel'
  source_url         text NOT NULL DEFAULT 'https://www.iftach.org/taxmatrix4/'
  effective_at       timestamptz NOT NULL DEFAULT now()
  is_active          boolean NOT NULL DEFAULT true
  created_at         timestamptz NOT NULL DEFAULT now()
  UNIQUE (jurisdiction_code, jurisdiction_country, quarter, year, fuel_type)
```

- **Quarterly-updated:** the existing `scripts/verify-ifta-tax-rates-current.mjs` freshness check (current +
  prior quarter must be present) is the pattern to keep — port it to assert the DB row-count instead of the
  JSON key, same CI guard shape.
- **Not entity-scoped / no RLS needed** — public IFTA rate data is the same across every operating company;
  scope by nothing but `(jurisdiction, quarter, year)`.
- **Seed migration** would import the existing `ifta-tax-rates.json` content as the first rows (data-only
  migration, per the financial-migrations idempotent pattern), then future quarters are inserted the same
  way the JSON is edited today — just as DB rows instead of a committed file, giving an audit trail of rate
  changes (`created_at`) the static JSON never had.

---

## 5. Schema proposal — reconciling the task's names with the existing `ifta.*` schema

The task named four conceptual tables. Two paths, Jorge picks (drift flag, §0):

**Option A — extend existing schema (recommended):**

| Task's conceptual name | Concrete home |
|---|---|
| `ifta_quarter` | `ifta.quarterly_preparations` (already has quarter/year/status lifecycle) — add nothing, or add a `filing_pdf_url` column (§7) |
| `ifta_jurisdiction_miles` | `ifta.state_miles_by_quarter` — add `jurisdiction_country text NOT NULL DEFAULT 'US'` (values `US`/`CA`/`MX`), `personal_conveyance_miles numeric(12,3) NOT NULL DEFAULT 0`, `personal_conveyance_source text` |
| `ifta_fuel_by_jurisdiction` | `ifta.state_gallons_by_quarter` — add `jurisdiction_country`; extend `source` check to include `'relay'` once `relay_fuel_transactions` ships |
| `ifta_return` | `reports.ifta_filings` (reconcile vs `ifta.quarterly_preparations` per §2's noted overlap) — add `pdf_url text`, `mexico_operations_summary jsonb` |

**Option B — net-new v2 schema (`ifta_v2.*` or the literal names given), if Jorge decides v1 should be
retired instead of extended:** stand up `ifta_quarter`, `ifta_jurisdiction_miles`,
`ifta_fuel_by_jurisdiction`, `ifta_return` exactly as named, each `operating_company_id uuid NOT NULL
REFERENCES org.companies(id)` + FORCE RLS (`identity.is_lucia_bypass() OR operating_company_id::text =
current_setting('app.operating_company_id', true)`) + `is_active` + audit-spine rows on every write, void-not-
delete (`voided_at`), UUIDv7 PKs — the standard §2 pattern. This duplicates working, tested infrastructure and
is **not** the default recommendation, but is specified here in case Jorge wants a clean v2 cutover rather than
incremental columns on v1.

Either path: **new schema/columns need GRANTs** (root CLAUDE.md §2 / migration `0065` pattern) or the runtime
role 500s.

---

## 6. Mexico cross-border tracking (non-IFTA, operational only)

Per §1's factual correction, Mexico legs are never part of the filed IFTA return. What BLOCK-03 should still
capture for Jorge's Laredo↔Mexico operational visibility:
- Miles driven in Mexico per unit/quarter (same `country='MX'` flagged row shape as `MILEAGE-MODEL-DESIGN.md`
  §1.4 already specifies) — sourced from Samsara GPS (no US-style ECU jurisdiction-crossing feed exists for
  Mexico, so this is GPS-only, flagged as such).
  Fuel purchased in Mexico (pesos, converted) — separate from the IFTA net-tax-paid-gallons calc entirely.
- Rendered as a distinct "Mexico Operations (non-IFTA)" section on the quarterly PDF (§7), never summed into
  the jurisdiction tax total, with a plain label explaining why (auditor-facing: "Mexico is not an IFTA
  member jurisdiction; tracked for operational reporting only").

---

## 7. Output — PDF requirement

Per Jorge's standing tax-document rule, **every tax document renders as PDF** for archive, mail, and email —
the existing v1 CSV output (`ifta-csv-generator.ts` → R2, matching the IFTA-required electronic filing format
many states accept) should be **kept** for e-file compatibility, and a **PDF renderer added alongside it**,
not instead of it:
- PDF layout: carrier IFTA #, quarter/year, per-jurisdiction table (state, total miles, taxable miles,
  taxable gallons, tax-paid gallons, net taxable gallons, rate, tax owed/credit), quarter total, the Mexico
  non-IFTA summary section (§6), owner-approval signature block (name/date, matching the existing WF-064
  2-step confirm), and a footer citing the rate source (`reference.ifta_tax_rates.source_url`).
- Stored in R2 next to the CSV (`ifta/quarterly/{operating_company_id}/{year}-Q{quarter}/...pdf`), URL on
  `reports.ifta_filings`/`ifta.quarterly_preparations`, downloadable + emailable from the existing 4-step
  wizard's final review step.
- Reuse whatever PDF-rendering utility already exists elsewhere in the repo for other tax/compliance
  documents (check for a shared PDF lib before adding a new dependency — additive-only, no new tooling if an
  existing one already renders a tabular PDF).

---

## 8. Feature flag + guardrails

- New flag, default **OFF**: `IFTA_V2_JURISDICTION_ENGINE_ENABLED` (or, if Option A/extend is chosen, this
  can gate just the new MX rows + PC-discount + PDF output on top of the already-live v1 preparer).
- **No money posting.** This block computes a filing amount for Jorge's own quarterly IFTA payment/credit —
  it does not post a GL entry. If/when tax-liability posting is wanted, that is a separate financial-cluster
  block (see `docs/specs/FH-6-TAX-MANAGER-DESIGN.md` §7, which explicitly says "surface IFTA here, don't
  duplicate the engine" — FH-6 is the right home for any future GL posting of the IFTA amount, not this
  engine).
- CI guards to add: extend `verify-ifta-aggregator-determinism.mjs` to cover PC-discount math and MX
  exclusion; a new `verify-ifta-tax-rates-catalog-current.mjs` (DB-row equivalent of the existing JSON
  freshness check) if `reference.ifta_tax_rates` is built; a guard asserting the PDF total always equals the
  CSV total (single source of truth, two renderings — never let them drift).
- Never build the GL-posting or e-file-submission side solo; this doc is preparation/filing-support only,
  matching Jorge's "Jorge/company files" instruction (no auto-submission to a state DOR).

---

## 9. Open questions for Jorge

1. **Schema path (§0/§5):** extend existing `ifta.*` v1 additively (recommended), or replace with the
   literal `ifta_quarter`/`ifta_jurisdiction_miles`/`ifta_fuel_by_jurisdiction`/`ifta_return` v2 schema?
2. **Lifecycle-table overlap:** `reports.ifta_filings` (`202606080205`) and `ifta.quarterly_preparations`
   (`0372`) both model a draft→filed lifecycle, built close together — which is canonical going forward?
3. **"Practical miles" terminology (§1):** confirmed reading is "real/as-driven trip miles" (`actual_miles` /
   telematics), not the PC\*Miler billing `practical_miles` field — confirm this is the intended basis.
4. **Personal-conveyance treatment (§1):** sources conflict on whether PC miles are a recognized IFTA
   exclusion or must be included in total miles per the literal Procedures Manual text. Proceeding with
   Jorge's instruction to discount them, but as a visible audited line, not a silent subtraction — confirm
   the actual filing preparer/CPA is comfortable with that treatment on the filed return.
5. **Relay fuel ingest timing:** `relay_fuel_transactions` doesn't exist yet — BLOCK-03's fuel-by-jurisdiction
   source is fuel bills in the interim. Confirm that's acceptable to start, with Relay wired in as a second
   source once it ships (no blocking dependency either direction).
6. **PDF template:** any existing shared PDF-rendering utility in the repo to reuse, or is this the first
   tax-document PDF (i.e., pick/introduce one library once, reuse everywhere per the standing tax-doc rule)?

---

## 10. Sources

- IFTA, Inc. — [Carrier Information](https://www.iftach.org/Carriers/), rate matrix
  (https://www.iftach.org/taxmatrix4/) — already the cited source in the existing
  `ifta-tax-rates.json`/verify script.
- [TruckLogics — What is IFTA and how does IFTA Fuel Tax Work](https://www.trucklogics.com/what-is-ifta)
- [Geotab — What is IFTA](https://www.geotab.com/blog/what-is-ifta/)
- [AtoB — What are Non-IFTA Miles](https://www.atob.com/blog/what-are-non-ifta-miles)
- [Samsara — IFTA Report](https://kb.samsara.com/hc/en-us/articles/360046354291-IFTA-Report) (ECU-priority/
  GPS-fallback standardized distance — matches this repo's existing aggregator design)
- [Samsara — Personal Conveyance (PC)](https://kb.samsara.com/hc/en-us/articles/360059924612-Personal-Conveyance-PC)
- In-repo ground truth: `db/migrations/0372_ifta_quarterly_preparation.sql`,
  `db/migrations/0373_ifta_tax_calculations.sql`, `db/migrations/202606080205_ifta_filings.sql`,
  `db/migrations/0219_cap11_hos_duty_status_events.sql`, `apps/backend/src/ifta/*`,
  `docs/specs/gap-42-ifta-quarterly-preparer.md`, `docs/specs/MILEAGE-MODEL-DESIGN.md` §0.1/§1.4/§5,
  `docs/specs/RELAY-INTERNAL-BANK-DESIGN.md` §20/§118, `docs/specs/FH-6-TAX-MANAGER-DESIGN.md` §7,
  `.claude/skills/ih35-fmcsa-compliance` (filing calendar).

---

*Design-only. No migration, no code, no posting authorized by this document. Build-and-ship per Jorge's
Tier-1 lane rule — the next building agent picks up §9's answers before writing any DDL, and must not
duplicate the already-working v1 preparer without an explicit decision on §0/§5.*
