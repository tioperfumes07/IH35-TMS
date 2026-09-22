# DATA SOURCE REGISTER
## READ THIS BEFORE SAYING ANY DATA IS MISSING, UNAVAILABLE OR UNRESOLVABLE.
Owner: *"NEED FOR YOU TO FIND A SOLUTION TO YOUR MEMORY ISSUES AND CODERS, ALL THIS DATA YOU
ALREADY KNOW AND YOU DISREGARD."*

**THE FIX IS THIS FILE.** The problem was never memory — it was that the knowledge lived in a
chat that ends. **It now lives in the repo.** Every source the owner has provided is registered
here with its path, its real columns and what it resolves.

### THE RULE — BINDING ON EVERY SEAT AND ON THE LEAD
1. **Before declaring anything missing, unavailable, unattributable or unresolvable, you read
   this file and try every source listed for that domain.** A "residual" declared without doing
   so is not a residual — it is an unfinished search.
2. **Before building an importer, resolver, catalog or generator, you grep for it.** Three things
   assigned this session already existed.
3. **When the owner provides a new file, it is registered here in the same round it arrives** —
   path, columns, row count, what it resolves. Not in chat. Here.
4. **A source document beats the app. Always.** Faro and AlwaysTrack are the source of truth.

---

## FUEL · IFTA · GEOFENCING

### `~/Downloads/09-22-2026-LOVES-604-GEOFENCE-SEED.csv` — **THE LOVE'S NETWORK. 604 STORES.**
Extracted 2026-09-22 from `~/Desktop/LOVES_PRICES_AND_LOCATIONS_WITH_COORDINATES.xlsx`
(605 rows × 26 columns). **604 unique stores, 0 rejected, 42 states, every row carrying valid
latitude and longitude.**
```
store_no | city | state | latitude | longitude | google_maps_link
billing_card_station_code | opis_rack_id | def_retail_price | best_discounted_price
state_taxes | effective_date
```
**RESOLVES:** truck-stop geofences · arrival detection · fuel-stop→location matching ·
IFTA jurisdiction by coordinate · DEF pricing · per-state fuel tax.
**The source workbook also carries** Federal Taxes, State Taxes, Other Taxes, Sales Tax, Freight
Fee, Pumping Fee, OPIS/NYMEX Rack, Retail and Discounted prices, Discounted Type Applied.
**Siblings on the Desktop, same 604 stores:** `LOVES PRICES AND LOCATIONS.xlsx` (24 cols, no
Coordinates/Maps columns), `LOVES_LOCATIONS_COORDINATES_CLEAN.xlsx` (26 cols),
`LOVES_LOCATIONS_COORDINATES.csv`, `loves 09-19-26 prices'.xlsx` (609 rows, newer prices).
**It has NO street-address column** — coordinates are the join key, not an address.

### `~/Downloads/IH35-MASTER-RECONCILIATION/04-FUEL/09-22-2026-FUEL-CARD-PROVIDER-STATEMENT-0807-0921-PARSED.csv`
Dreamline, 2026-08-07 → 2026-09-21. **397 rows.**
```
Transaction Date | Driver Name | Unit Number | Card Number | Location | City | State
Quantity | Unit Price | Gross | Discount | Amount | Fees
```
**`Location` is store-number form** — `LOVES #787 TRAVEL STOP` → MOSHEIM, TN. **86 distinct
values. It does NOT contain street addresses** (verified: 0 of 10 sampled street addresses from
the residual rows matched any of them).

### `integrations.relay_fuel_transactions` — **IN OUR OWN DATABASE. 1,707 rows.**
The full Relay payload. **USMCA's own operating_company_id holds only 76 rows because USMCA buys
on the TRANSPORTATION Relay account.**
```
location_address | location_city | location_state | location_zip_code
location_latitude | location_longitude | location_opis_id | location_timezone
merchant_id | merchant_name | merchant_number | location_id | location_name
transaction_id | relay_driver_* | matched_driver_id | matched_unit_id | raw_payload
```
**RESOLVES the 118 blank-jurisdiction fuel rows.** Measured 2026-09-22: 297 distinct staging
addresses carrying a state; **32 exact normalised address matches, 66 on a 12-char prefix**; and
117 of the 118 carry a `transaction_reference` that should join `transaction_id` directly.
**This is the third source. It was never joined.**

### Relay transaction descriptions
Every one already carries city and state: `Relay fuel · T176 · Love's · Mandeville, LA`,
`Relay fuel · T171 · Circle K Stores Inc · Hope Mills, NC`.

### `reference.ifta_tax_rates` — 96 rows, populated.
### `catalogs.ifta_states` — **0 rows.** Empty canonical catalog. Seed it or retire it.
### `reports.ifta_filings` — **0 rows. No IFTA filing has ever been produced.**

---

## FACTORING · FARO — `~/Downloads/IH35-MASTER-RECONCILIATION/01-FARO/`
| file | rows | what it gives |
|---|---|---|
| `PURCHASE REPORT ALL.csv` | 88 | Debtor · Date · **Inv #** · **PO** · Other Ref · Purchase · Escrow Rsv · Cash Rsv · Discount · Fees · Dispatch · Net Adv · Receipts · Sch Fee · ChgBack. Runs to 9/21/26, invoice #91+ |
| `PAYMENTS TO USMCA FROM FARO.csv` | 94 | Debtor · Inv · **PO/Ref** · Payment · Deposit · Date · Pmt Type · Pmt Ref |
| `RESERVE REPORT.csv` | — | the balance column pairs each deposit to its payable — **use it, do not sum the legs independently** |
| `faro_canonical_purchases.csv` / `.json` | 128 | inv · date · debtor · po · purchase · escrow_rsv · discount · fees · wire_fee · net_adv · chgback · src |
| `faro_load_map.json`, `faro_import_reconcile.csv`, `faro_daily_totals.csv`, `ACCOUNT SUMMARY.csv` | — | |
| `FARO-IH-35-Transportation-export-16/17/18.csv` | — | **TRANSPORTATION-Faro. USMCA ran on Transportation's accounts from 2026-08-07 — reconciliation spans BOTH.** |

**FARO'S KEY IS THE CUSTOMER REFERENCE — `PO` → `mdata.loads.customer_wo_number`, then
`customer_po_number`. NEVER the load number.** A load-number join returns zero, and that zero is
a bug in the query.

**THE IMPORTER ALREADY EXISTS:** `apps/backend/src/factoring/faro-csv-import.ts`
(`parseFaroCsv`:145, `commitFaroCsvImport`:530) behind `POST /api/v1/factoring/import/faro`
(role-gated), already setting `factoring_status='advanced'`:333. **Run it `preview_only` first.
Do not write a second one.**

### `~/Downloads/IH35-MASTER-RECONCILIATION/05-INVOICES-SELF-CARRIED/` — **the only true self-carried invoices**
`Invoice 009 FLS TRANSPORTATION` · `Invoice 010 SUPPLY CHAIN MANAGEMENT` ·
`Invoice 026 IM SPECIALIZED` · `Invoice 055 - 13555 2 EMS` · `Invoice 074-13593 ALIGATOR` ·
`Invoice_13471.pdf`. **5 invoices / $12,592.40.** Everything else marked `not_factored` was
bought by Faro and the status was never advanced.

---

## SETTLEMENTS — `~/Downloads/IH35-MASTER-RECONCILIATION/03-SETTLEMENTS/`
`company-pdf/` 86 · `driver-pdf/` 73 · `text/` **116 extracted text files**.
Parsed 2026-09-22 → **122 distinct loads, 13471..13611, and ALL 122 carry truck, trailer AND
driver.** Parser output `/tmp/settlement_loads.csv`; columns
`load_no, truck, trailer, driver, customer, pickup_date, pickup_place, deliver_date,
deliver_place, miles, rate, line_haul, invoiced, settlements`.

Each document gives, per load:
```
Load 13595
  Pickup   2026-09-10, Laredo, TX 78045    Trk: T148 / Trlr: 445 / Rafael Rogelio Rivero Reynoso
  Deliver  2026-09-11, BAYTOWN, TX 77523   Trk: T148 / Trlr: 445 / Rafael Rogelio Rivero Reynoso
  CUSTOMER CHARGES: Line Haul  377.2 mi @ 3.977 = 1,500.00
  DRIVER PAYMENT:   Loaded Miles 351.7, Picks, Drops
  REVENUE: Invoiced 1,500.00
```
**Measured against the database: 19 of the 122 loads DO NOT EXIST in our database.
9 unit-missing, 3 unit-wrong, 3 driver-missing among the 103 that do.**

**RESOLVES:** unit · trailer · driver · miles · rate · revenue · practical and short mileage per
lane. **These miles feed driver pay — every backfilled row cites its settlement document.**

---

## OTHER
`02-ALWAYSTRACK/` · `06-BANK-QBO/` · `07-RECONCILIATION-OUTPUT/` · `08-CODER-BOXES-AND-LAW/`
`~/Downloads/lane mileage seed_1.csv`, `~/Downloads/lane-mileage-reimport-source.csv`
`~/Downloads/2026-09-07-Cursor-IH35-Settlements-Parsed-BOTH-ENTITIES.xlsx`
`~/Downloads/IH35-BY-SETTLEMENT-BY-COMPANY-2026-09-02_1.xlsx`
`~/Desktop/IH35-CLAUDE-JOURNAL.md` — the standing journal.

---

## KNOWN-EMPTY TABLES — do not mistake empty for absent, and do not wire against the dead one
| table | rows | verdict |
|---|---|---|
| `catalogs.relay_accounts` | 0 | **DEAD** — live CRUD catalog wired to the Lists picker, **zero readers in the real posting pipeline**. Superseded by `integrations.relay_company_cards` / `catalogs.fuel_card_types`. **Do not seed it.** (CC-3, PR #22210) |
| `catalogs.ifta_states` | 0 | seed or retire |
| `reports.ifta_filings` | 0 | no filing ever produced |
| `geo.geofences` | **7 total, all companies, 0 Love's** | the 604 have never been loaded |
| `telematics.load_odometer_segments` | 0 | empty for every load and every status |
