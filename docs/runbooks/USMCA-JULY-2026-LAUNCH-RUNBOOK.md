# USMCA July 2026 Launch Runbook

**Version:** 1.0  
**Owner:** Jorge (Owner)  
**Go-live:** July 1, 2026 06:00 CST  
**Rollback plan:** [USMCA-ROLLBACK-PLAN.md](./USMCA-ROLLBACK-PLAN.md)

---

## T-7 days (June 24, 2026)

- [ ] Verify all 8 pre-soft-launch checklist items (items 1–8) complete in USMCA Activation Panel
- [ ] QBO USMCA subaccount has matching Chart of Accounts
- [ ] At least 1 truck officially transferred to USMCA carrier code in fleet tab
- [ ] Insurance binder showing USMCA LLC on file in Safety → Insurance
- [ ] FMCSA SAFER check run — green (no active violations)
- [ ] DOT number confirmed active with MC authority number on file

## T-3 days (June 28, 2026)

- [ ] Admin Panel → USMCA Activation → "Transition to soft_launch"
  - Requires checklist 1–8 complete + Owner sign-off
- [ ] Internal testing: dispatch a test load under USMCA carrier
- [ ] Verify invoice posts to QBO under USMCA entity (not TRANSP)
- [ ] Verify settlement appears in /payroll-integration with class UNIT-DRIVER
- [ ] Notify 2 USMCA admin users; have them log in and confirm access

## T-1 day (June 30, 2026)

- [ ] Items 9–12 (pilot checklist) complete: 1 driver, 1 customer, 1 E2E load, 1 test bill paid
- [ ] "Transition to pilot_drivers" in USMCA Activation Panel
- [ ] Send driver onboarding docs (EN + ES) to pilot drivers
- [ ] Confirm dispatch knows which loads to route through USMCA vs TRANSP
- [ ] Verify bank reconciliation is clear

## T-0 — July 1, 2026 (06:00 CST)

1. Owner logs in → Admin → USMCA Activation
2. Confirms all 16 checklist items complete
3. Clicks "Transition to full_active" — enters notes "Jorge GO July 1 2026"
4. Dispatchers begin routing new loads under USMCA carrier
5. Post in group chat: "USMCA is LIVE"

## T+1 hour (07:00 CST)

- [ ] Verify: /reports/settlement-summary shows USMCA loads
- [ ] Verify: /payroll-integration shows USMCA driver rows with UNIT-DRIVER class
- [ ] Verify: QBO has new USMCA invoices (spot-check 1)
- [ ] No alerts in /maintenance or /dispatch for USMCA loads

## T+24 hours (July 2, 2026)

- [ ] 24-hour stability check: no 5xx errors in Error Monitor for USMCA routes
- [ ] Bank feed updated: confirm USMCA transactions flowing to Plaid
- [ ] Call with accounting: confirm QBO USMCA mapping correct

## T+7 days (July 8, 2026)

- [ ] Pristine bank reconciliation check for USMCA entity
- [ ] IFTA: confirm USMCA loads appear in /reports/ifta jurisdiction table
- [ ] Jorge final review — decision to expand or cap at current load volume
