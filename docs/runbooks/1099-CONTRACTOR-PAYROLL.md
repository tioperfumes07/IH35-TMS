# Runbook — 1099 Contractor Payroll (Driver Settlements)

**Owner:** Accounting / Driver Finance
**Frequency:** Per settlement cycle (typically weekly) + year-end 1099s
**Systems:** IH35 TMS (Drivers → Settlements, Driver Finance), QuickBooks Online

Pay owner-operator / contractor drivers via settlements and produce year-end
1099-NEC forms.

## Per-cycle steps

1. **Confirm delivered loads** for the cycle are ready to settle.
2. **Generate driver settlements** per the Driver Settlement layout (Migration 0138):
   - Gross pay lines (per-mile / percentage / flat).
   - Deductions (advances, escrow, fuel, insurance, chargebacks).
   - Reimbursements.
3. **Review each settlement** for accuracy; resolve disputes before release.
4. **Approve and release** settlements; drivers are notified.
5. **Record the payments** and confirm the bank debits reconcile.

## 1099 threshold tracking

6. **Track cumulative annual pay** per contractor against the **$600** 1099-NEC
   threshold. Any contractor paid ≥ $600 in the calendar year needs a 1099-NEC.
7. **Verify W-9 on file** (legal name, TIN, address) for every 1099 contractor.

## Year-end steps

8. **Generate 1099-NEC** forms for all qualifying contractors.
9. **Review totals** against settlement history and QBO vendor payments.
10. **Distribute to contractors** by Jan 31.
11. **File with the IRS** (and state where required) by the deadline.
12. **Archive** filed 1099s and confirmations to Docs.

## Verification

- [ ] All cycle settlements approved + reconciled.
- [ ] W-9 on file for every 1099 contractor.
- [ ] 1099-NEC issued to all contractors ≥ $600.
- [ ] Forms distributed by Jan 31 and filed with IRS.

## Escalation

Missing or mismatched TIN/W-9 data must be resolved before issuing a 1099 —
escalate to the Owner; do not file with placeholder TINs.
