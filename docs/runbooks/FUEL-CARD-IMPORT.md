# Runbook — Fuel Card Import

**Owner:** Accounting / Fuel
**Frequency:** Weekly
**Systems:** IH35 TMS (Fuel, Accounting), QuickBooks Online

Import fuel-card transactions, validate by jurisdiction, post the bill, and
allocate to drivers/units for IFTA and cost tracking.

## Steps

1. **Download the weekly card file** from each provider:
   - **Love's** card export (CSV).
   - **WEX** card export (CSV), if applicable.
2. **Import each file** via Fuel → import (Love's upload supported in-app).
3. **Validate against IFTA jurisdiction.** Confirm each transaction's state is
   captured for [IFTA-QUARTERLY-FILING.md](./IFTA-QUARTERLY-FILING.md).
4. **Resolve exceptions** — unmatched unit/driver, missing odometer, duplicate
   transactions, or out-of-pattern gallons/price.
5. **Post the QBO bill** for the card statement to the fuel expense account.
6. **Allocate to drivers/units** so fuel deductions flow to settlements and
   per-unit cost reports.
7. **Reconcile** the card payment in Banking when it clears.

## Verification

- [ ] All provider files imported for the week.
- [ ] Every transaction has a jurisdiction.
- [ ] Exceptions resolved (no orphan fuel stops).
- [ ] QBO bill posted; driver/unit allocation complete.
- [ ] Card payment reconciled.

## Escalation

Repeated unmatched cards for a driver/unit may indicate a card-assignment or
device-pairing problem — escalate to Dispatch/Safety.
