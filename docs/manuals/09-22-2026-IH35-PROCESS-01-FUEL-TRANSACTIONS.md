# PROCESS & MAPPING 01 — FUEL TRANSACTIONS
Issued 2026-09-22 · Lead · verified against live production + repo tip. BINDING.

## LIVE STATE — measured, `set_config('app.bypass_rls','lucia',FALSE)`
```
fuel.fuel_transactions, USMCA, archived_at IS NULL, by jurisdiction:
  TX      226 txns  15,516.440 gal      sources: import, manual, other
  (BLANK) 118 txns  12,537.778 gal      sources: import, manual      <-- THE GAP
  TN       65 txns   5,388.464 gal
  LA       53 txns   3,546.769 gal
  MS/AL/FL/GA ...
Linkage residual: 350 rows no driver -> 225 · 92 no unit -> 23 · 314 no load -> 313
                  152 / 625 fuel_card_id NULL (disclosed)
```

## CANONICAL TABLE — `fuel.fuel_transactions` (columns verified live)
```
id | operating_company_id | transaction_at | purchased_at
load_id | driver_id | unit_id | trailer_id | vendor_id | fuel_card_id
fuel_type | gallons | price_per_gallon | total_cost
gross_cost | discount_amount | fee_amount
location_city | location_state | location_lat | location_lng | pump_number
transaction_reference | source | source_row_hash | source_doc_id
qbo_expense_id | qbo_class_id
load_required | load_exemption_reason
overage_deduction_id | overage_event_id | overage_recovered_cents
archived_at | imported_at | notes
```

## THE TWO RAILS — never mix them
| rail | funding | draw posting | bank account | ledger |
|---|---|---|---|---|
| **DREAMLINE** | USMCA pays the card | `DR 5000 Fuel` / `CR 2510` | Dreamline Diesel Card | 2510 |
| **RELAY** | funded by **Amex-Scentsx** | `DR 5000 Fuel` / `CR 1295` | Relay Fuel Wallet | 1295 |
|  | `FUNDING: DR 1295 / CR 2500` | | | |

**Rail resolution is per row, from `fuel_card_id` against `catalogs.fuel_card_types.code`, in
`resolveCompanyDirectCreditPreference()`. It is CORRECT and stays pointed at 1295 for RELAY.
A card-signalled row whose rail cannot be identified FAILS CLOSED — it does not guess.**
**DEF / urea posts to `5010`, never `5000`, and is NOT a motor fuel for IFTA.**

## INGEST MAP
| source | path | key | writes |
|---|---|---|---|
| Relay API | `relay-fuel-ingest.cron.ts`, `0 7 * * *` America/Chicago, per company, gated on `RELAY_FUEL_INGEST_ENABLED` | `transaction_reference` | staging → canonical |
| Relay CSV | `relay-fuel-csv-import.routes.ts` | same | staging → canonical |
| Dreamline | `04-FUEL/09-22-2026-FUEL-CARD-PROVIDER-STATEMENT-0807-0921-PARSED.csv` — **397 rows, real `State` column** | card + date + unit | canonical |
| Love's network | `04-FUEL/09-05-2026-LOVES-604-STORES-SEED.csv` — **604 stores, each with `state`** | store number | jurisdiction |

**USMCA runs on the TRANSPORTATION Relay account** (owner ruling). `RELAY_API_KEY_TRANSP` exists
and works. The mapping is DECLARED where a live reader reads — `integrations.relay_company_cards`
/ `catalogs.fuel_card_types`. **`catalogs.relay_accounts` is 0 rows with ZERO pipeline readers
(CC-3 verdict) — do NOT resurrect it.**

## MANDATORY LINKAGE — a fuel row is not created without these
| field | required | source |
|---|---|---|
| `unit_id` | **YES** | card→unit, or the statement's Unit Number column |
| `driver_id` | **YES** | unit→driver at that date, or the statement's Driver Name |
| `load_id` | **YES unless** `load_required=false` with a written `load_exemption_reason` | date+unit vs the load's stops |
| `fuel_card_id` | **YES** | the card number on the statement |
| `vendor_id` → `mdata.vendors` | **YES** | never `mdata.qbo_vendors` |
| **`location_state`** | **YES — IFTA depends on it** | see PROCESS 02 |
| `gallons` | **YES, gallons not dollars** | |
| `source_row_hash` | **YES** | idempotency; re-ingest must never double-post |

## POSTING
Through the existing reused poster only — `maybe-post-from-fuel-transaction.service.ts` →
`reflushUnpostedFuelGlExpenses` / `flushFuelGlPostsAfterCommit`. **No new GL math.**
`accounting.expenses.source_fuel_transaction_id` links the expense back to the fuel row.
Every posting carries `source_transaction_type` + `source_transaction_id`.
**A fuel_event credit must never land on `2000 A/P control`** — guard
`verify-no-fuel-event-credits-ap-control.mjs`, carrying `reversed_by_je_id IS NULL`.

## DoD
Rows by rail before/after · linkage counts before/after · GL 5000 / 5010 / 2510 / 1295 **debits
and credits separately, never netted** · the guard on main with selftest RED→GREEN.
