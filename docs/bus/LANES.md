# LANES — seat ownership. Enforced by `scripts/verify-lane-ownership.mjs` in the merge gate.
Owner-ruled 2026-09-22 after CC-1 and CC-3 both wrote settlement rows 5805/5806 inside the same hour.

A seat may only change paths in its own lane plus SHARED. A PR touching another seat's lane fails
the gate. To cross a lane: post to that seat's OUTBOX, get the Lead's written ruling, and add the
ruling's filename to the PR body under `LANE-CROSS:`.

## CC-1 — schema, gates, hygiene
db/migrations/**
scripts/verify-*.mjs
scripts/verify-*.baseline.json
scripts/money-pr-local-gate.mjs
scripts/lib/**
apps/backend/src/identity/**
apps/backend/src/accounting/company-settlements**
apps/backend/src/mdata/drivers**
apps/backend/src/mdata/loads.routes.ts
**/*.db.test.ts
TABLES: accounting.company_settlements · driver_finance.driver_bills · mdata.drivers · identity.*

## CC-2 — money in and out
apps/backend/src/factoring/**
apps/backend/src/banking/**
apps/backend/src/accounting/invoices**
apps/backend/src/accounting/daily-close**
TABLES: factor.* · banking.* · accounting.factoring_reserve_movements · accounting.invoices
        accounting.reconciliation_runs

## CC-3 — settlements and fuel
apps/backend/src/settlements/**
apps/backend/src/fuel/**
apps/backend/src/driver-finance/**
scripts/alwaystrack/**
TABLES: driver_finance.settlement_lines · driver_finance.driver_settlements
        fuel.fuel_transactions · catalogs.fuel_card_types · catalogs.relay_accounts

## LEAD — rulings and CI pipeline only
docs/bus/**
.github/workflows/**
TABLES: none. The Lead owns no module code and no tables. Anything else the Lead touches is a lane
        cross and needs a written ruling, same as every other seat.

## SHARED — any seat, but say so in the PR body
docs/**
scripts/ops/**            (one-shot ops scripts, named for the round)
apps/frontend/**          (declare the screen in the PR body)
.github/workflows/**      (CI is infrastructure every seat depends on — declare the job in the PR body)

## FORBIDDEN TO EVERY SEAT
Any write to: payroll.* · settlement.* · accounting.qbo_* · bank.* · maint.*
              mdata.qbo_vendors · catalogs.cancellation_reasons
Any row in any TRANSPORTATION or TRUCKING operating company.
Any row with is_sample_data = true in USMCA.
Editing an already-applied migration.
