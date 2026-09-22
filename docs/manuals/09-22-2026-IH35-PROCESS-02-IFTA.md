# PROCESS & MAPPING 02 — IFTA
Issued 2026-09-22 · Lead · verified live. BINDING.
**IFTA IS GALLON-BASED PER JURISDICTION. NEVER DOLLAR-BASED. DEF/UREA IS NOT A MOTOR FUEL.**

## LIVE STATE
```
catalogs.ifta_states          0 ROWS     <-- EMPTY canonical catalog
reference.ifta_tax_rates     96 rows     populated
reports.ifta_filings          0 ROWS     <-- NO IFTA FILING HAS EVER BEEN PRODUCED
fuel rows with NO jurisdiction  118 txns / 12,537.778 gal
aggregator output            46,994.85 gal exact across 17 jurisdictions (was 23 before the fix)
```

## THE JURISDICTION GAP IS NOT UNRESOLVABLE — REOPENED BY OWNER RULING
It was closed as "genuinely unresolvable from the two named source documents." **That is wrong.
The state exists in THREE sources already gathered:**

| source | what it gives | join |
|---|---|---|
| `04-FUEL/09-22-2026-FUEL-CARD-PROVIDER-STATEMENT-0807-0921-PARSED.csv` | **397 rows, real `State` column** + City, Unit Number, Driver Name, Quantity | card number + transaction date + unit |
| `04-FUEL/09-05-2026-LOVES-604-STORES-SEED.csv` | **604 Love's stores, each with `state`**, + lat/lng | store number → state |
| **Relay transaction descriptions** | city AND state are already in the string: `Relay fuel · T176 · Love's · Mandeville, LA`, `Circle K Stores Inc · Hope Mills, NC` | parse `· <City>, <ST> ·` |

**Resolution order:** (1) the row's own `location_state`; (2) the Dreamline statement's `State`;
(3) the Love's store seed by store number; (4) the Relay description's `City, ST`;
(5) `location_lat`/`location_lng` reverse-lookup. **Only after all five may a row be reported as
residual — and then it is named, counted, and disclosed, never silently dropped.**

## AGGREGATOR — `apps/backend/src/ifta/ifta-state-gallons-aggregator.ts`
Single-scan, grouped by `state` + `source_kind`. Rules that must not regress:
- filters `operating_company_id`, `archived_at IS NULL`, `purchased_at` window
- `LOWER(fuel_type) IN ('diesel','gas')` — **DEF/urea excluded, permanently**
- `UPPER(COALESCE(NULLIF(TRIM(location_state),''),'UNKNOWN'))` — unknown is **surfaced**, never dropped
- `HAVING SUM(gallons) > 0`
- **never `DISTINCT ON (state)`** — that collapsed 23 jurisdictions to 17 and lost 7,736.61 gal
Guard: `verify-ifta-excludes-non-highway-fuel-types.mjs` (static shape guard, offline-skip declared).

## THE FILING CHAIN — NOT BUILT. `reports.ifta_filings` IS EMPTY.
```
fuel.fuel_transactions (gallons per jurisdiction, diesel/gas only)
        +
miles per jurisdiction  <-- FROM TELEMATICS / lane mileage, NOT from fuel
        v
  taxable gallons per jurisdiction = miles ÷ fleet MPG
        v
  net tax = (taxable gallons − tax-paid gallons) × reference.ifta_tax_rates
        v
  reports.ifta_filings  (quarter, jurisdiction, miles, gallons, rate, net)
```
`reference.non_ifta_jurisdictions` excludes non-IFTA territory. **`catalogs.ifta_states` must be
seeded or formally retired — an empty canonical catalog beside a populated
`reference.ifta_tax_rates` is the §8 shared-state trap.**

## MANDATORY LINKAGE
Every fuel row: `location_state` **and** `gallons` **and** `unit_id`. Every filing row cites the
quarter, the jurisdiction, the gallon total and the rate row it used. **No estimate, ever —
a jurisdiction with no miles is reported as zero with its reason, not omitted.**

## DoD
Gallons per jurisdiction before/after · residual count and gallons, **named** · the 118/12,537.778
worked through all five resolution steps · `catalogs.ifta_states` seeded or retired with a reason.
