# Phantom-Column Fix Backlog (found by verify:sql-column-existence)

**59 real phantom-column references** — a SQL query names a column absent from the prod schema-parity baseline. Each is a latent 500 (Postgres 42703) on that path; mocked tests hid them. Frozen in scripts/verify-sql-column-existence.allowlist.json as a RATCHET (guard BLOCKS any NEW phantom column on 16 curated tables). Fix each (verify correct column vs prod baseline — some unit-sensitive like gross_pay_cents vs gross_pay, some structural like load_stops has no operating_company_id), then remove its key from the allowlist.

## apps/backend/src/accounting/invoices.routes.ts
- [ ] `mdata.loads.invoice_id`

## apps/backend/src/accounting/payments/apply.service.ts
- [ ] `accounting.bills.customer_id`

## apps/backend/src/accounting/receipts.routes.ts
- [ ] `accounting.bills.vendor_name`

## apps/backend/src/accounting/role-home/accounting-home.service.ts
- [ ] `accounting.bills.payment_terms_id`

## apps/backend/src/banking/banking.routes.ts
- [ ] `banking.bank_transactions.mapped`
- [ ] `banking.bank_transactions.money`

## apps/backend/src/banking/integrity/account-company-audit.service.ts
- [ ] `banking.bank_accounts.bank_name`

## apps/backend/src/bill-payments/cc-payment.routes.ts
- [ ] `catalogs.accounts.active`

## apps/backend/src/border-crossing/border-crossing-history.routes.ts
- [ ] `mdata.vendors.name`

## apps/backend/src/border-crossing/border-crossing-wizard.routes.ts
- [ ] `mdata.vendors.name`

## apps/backend/src/cash-advances/cash-advances.routes.ts
- [ ] `driver_finance.settlement_lines.liability_id`

## apps/backend/src/dispatch/analytics/late-arrival.service.ts
- [ ] `mdata.load_stops.stop_sequence`

## apps/backend/src/dispatch/bol-generator.service.ts
- [ ] `mdata.customers.physical_address_line1`
- [ ] `mdata.load_stops.appointment_end`
- [ ] `mdata.load_stops.appointment_start`
- [ ] `mdata.loads.commodity_description`
- [ ] `mdata.loads.reference_number`
- [ ] `mdata.loads.weight_lbs`
- [ ] `mdata.units.display_id`

## apps/backend/src/dispatch/customer-notify.service.ts
- [ ] `mdata.loads.latest_eta_prediction`

## apps/backend/src/dispatch/detention.service.ts
- [ ] `mdata.load_stops.operating_company_id`

## apps/backend/src/dispatch/dispatch-sheet.routes.ts
- [ ] `mdata.drivers.cdl_expiration_date`
- [ ] `mdata.units.display_id`
- [ ] `mdata.units.model_year`
- [ ] `mdata.units.unit_type`

## apps/backend/src/dispatch/geofences/load-geofence-binding.service.ts
- [ ] `mdata.load_stops.lat`
- [ ] `mdata.load_stops.lng`
- [ ] `mdata.load_stops.sequence`

## apps/backend/src/dispatch/load-profitability.service.ts
- [ ] `mdata.loads.delivered_at`
- [ ] `mdata.units.operating_company_id`

## apps/backend/src/dispatch/planner.service.ts
- [ ] `mdata.units.operating_company_id`

## apps/backend/src/dispatcher-board/role-views/dispatcher.service.ts
- [ ] `mdata.loads.length`

## apps/backend/src/driver-finance/settlement-dispute.service.ts
- [ ] `catalogs.accounts.length`

## apps/backend/src/driver-finance/settlement-render.routes.ts
- [ ] `mdata.drivers.cdl_expiration_date`
- [ ] `mdata.drivers.display_id`

## apps/backend/src/driver-manager/role-views/dm-home.service.ts
- [ ] `mdata.drivers.active`

## apps/backend/src/drivers/messages.service.ts
- [ ] `mdata.drivers.read_at`

## apps/backend/src/insurance/policy-unit-fleet.service.ts
- [ ] `catalogs.accounts.length`

## apps/backend/src/integrations/samsara/geofences/reconciliation.service.ts
- [ ] `mdata.loads.delivered_at`
- [ ] `mdata.loads.uuid`

## apps/backend/src/integrity/anomaly-detector.service.ts
- [ ] `mdata.drivers.active`

## apps/backend/src/liabilities/liabilities.routes.ts
- [ ] `driver_finance.settlement_lines.liability_id`

## apps/backend/src/maintenance/road-service/tickets.routes.ts
- [ ] `mdata.units.display_id`

## apps/backend/src/maintenance/warranty.routes.ts
- [ ] `mdata.vendors.display_name`

## apps/backend/src/mdata/equipment-aggregate.service.ts
- [ ] `mdata.loads.assigned_primary_unit_id`

## apps/backend/src/payroll-integration/tms-settlements-pull.ts
- [ ] `driver_finance.driver_settlements.gross_pay_cents`
- [ ] `driver_finance.driver_settlements.net_pay_cents`
- [ ] `driver_finance.driver_settlements.total_deductions_cents`

## apps/backend/src/reports/form-425c/exhibits/exhibit-f-supporting-docs.ts
- [ ] `accounting.bills.soft_deleted_at`
- [ ] `accounting.bills.total_cents`
- [ ] `accounting.invoices.invoice_date`
- [ ] `accounting.invoices.soft_deleted_at`

## apps/backend/src/safety/driver-scoring/scoring.service.ts
- [ ] `mdata.drivers.active`

## apps/backend/src/safety/eld-audit-trail/viewer.service.ts
- [ ] `mdata.drivers.display_name`

## apps/backend/src/safety/fuel-gps-match.service.ts
- [ ] `mdata.load_stops.operating_company_id`

## apps/backend/src/search/universal/indexer.service.ts
- [ ] `mdata.drivers.driver_code`

## apps/backend/src/settlements/trip-link.engine.ts
- [ ] `mdata.loads.delivery_appointment_end`
- [ ] `mdata.loads.delivery_appointment_start`
- [ ] `mdata.loads.pickup_appointment_start`

