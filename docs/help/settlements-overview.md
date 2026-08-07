# Driver settlements overview

Settlements turn completed work into driver pay: trip revenue, deductions, advances, and escrow moves for a pay period.

## Overview
- Settlements live under the finance / settlements surfaces (and related Dispatch hand-offs).
- Each settlement has a server-generated display id (e.g. `S-YYYY-NNNN`) — never invent one in the UI.
- Status moves through draft → review → approved/paid per your SOP; Owner may approve from privileged surfaces when enabled.

## Key tasks
- Build or open a settlement for the pay period and company.
- Review trip lines, deductions (including safety fines when linked), and cash advances.
- Resolve exceptions before approval (see *Settlement exceptions and disputes*).
- Confirm escrow and reserve impacts when the settlement touches held balances.

## Tips & gotchas
- Driver must be the same operating company as the settlement.
- Void — do not delete — if a settlement was issued in error.
- Cross-check Factoring / Accounting links when a trip was factored so pay and customer AR stay consistent.
