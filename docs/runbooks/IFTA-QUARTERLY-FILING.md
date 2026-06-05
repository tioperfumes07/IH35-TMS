# Runbook — IFTA Quarterly Filing

**Owner:** Accounting / Compliance
**Frequency:** Quarterly (due by the last day of the month following quarter end)
**Systems:** IH35 TMS (Reports → IFTA, Fuel, Safety/Samsara), QuickBooks Online

File the International Fuel Tax Agreement return for the quarter, reconciled to
odometer/GPS miles and fuel-card purchases.

## Filing deadlines

- Q1 (Jan–Mar): Apr 30
- Q2 (Apr–Jun): Jul 31
- Q3 (Jul–Sep): Oct 31
- Q4 (Oct–Dec): Jan 31

## Steps

1. **Pull the IFTA-by-state report.** Reports → `/reports/ifta` for the quarter.
2. **Validate miles against Samsara/odometer rolls.** Confirm per-jurisdiction
   miles reconcile to telematics and trip data; investigate large gaps.
3. **Confirm fuel reconciles to imported fuel cards.** Cross-check gallons by
   jurisdiction against fuel-card imports (see [FUEL-CARD-IMPORT.md](./FUEL-CARD-IMPORT.md)).
4. **Resolve exceptions** — unmatched fuel stops, missing miles for any unit, or
   jurisdictions with fuel but no miles (or vice versa).
5. **Compute net tax** per jurisdiction (taxable gallons × rate − tax-paid gallons).
6. **File with each state** (or via your IFTA filing service / base-state portal).
7. **Pay deficit / record credit** as applicable.
8. **Record the JE in QBO** for IFTA payable/receivable for the quarter.
9. **Archive** the filed return and confirmation to Docs.

## Verification

- [ ] Per-jurisdiction miles reconcile to Samsara/odometer.
- [ ] Gallons reconcile to fuel-card imports.
- [ ] Return filed before the deadline; confirmation saved.
- [ ] QBO IFTA payable/receivable JE posted.

## Escalation

If telematics miles and trip miles diverge beyond tolerance, stop and reconcile
with Safety before filing — filing on bad mileage triggers audits.
