# Factoring

The Factoring module manages the carrier’s relationship with its factor — advances against customer invoices, reserve held back, chargebacks/fees, and statement reconciliation.

## Overview
Open **Factoring** from the left rail. The home shows KPI cards for the **active factor**, reserve balance, chargeback balance, and recourse days (sourced from `factoring.factor` / factoring summary views).

Architectural sub-tabs include:
- **Recourse Pipeline** — invoices approaching recourse expiry.
- **Chargebacks & Fees** — fee and chargeback activity.
- **Statements & Settings** — statement month summaries and settings.

Also available from Factoring home: **Submit to Factor**, reserve tracker surfaces, Faro CSV import, and the **active factor profile** panel (advance / fee / reserve rates).

## Key tasks
- Confirm the **active factor** (today: Faro Factoring Full Recourse V1 on TRANSP when configured).
- Edit **factor rates and remittance** on Factoring → Edit factoring profile — values save to `factoring.factor` columns (`advance_rate`, `fee_rate`, `reserve_rate`, `remittance_details`). Do **not** edit factor rates on a Vendor profile notes field.
- Submit invoices / batches to the factor and track reserve releases.
- Import Faro daily CSV and reconcile against expected advances and reserve.

## Tips & gotchas
- KPI “Active Factor” and the profile panel must describe the same `factoring.factor` row — if they disagree, that is a dual-path bug; report it.
- Reserve accounts on the chart of accounts are owner-created manually — agents do not invent reserve GL accounts.
- Factoring virtual bank balances are excluded from Form 425C main bank totals (DIP).
- Vendor detail links to Factoring for rate schedule; saving a vendor no longer writes factor rates into notes.
