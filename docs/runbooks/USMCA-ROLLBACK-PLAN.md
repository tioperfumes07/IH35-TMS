# USMCA Rollback Plan

**Version:** 1.0  
**Owner:** Jorge (Owner)

---

## When to Rollback

Trigger emergency rollback if ANY of the following occur post-launch:

- QBO entries posting to TRANSP instead of USMCA entity (wrong class)
- Driver settlements showing negative or zero amounts for USMCA loads
- Factoring company rejects USMCA invoices (missing MC authority on invoice)
- FMCSA audit triggered within 72 hours of launch
- Bank reconciliation mismatch > $500 within first week
- IT security incident on USMCA user accounts

## How to Rollback (UI)

1. Log in as Owner
2. Admin → USMCA Activation
3. Red "Emergency Rollback" section at bottom of panel
4. Type `DEACTIVATE` in confirm box
5. Click "Rollback" button
6. State transitions: `full_active → rollback`
7. Immediately notify dispatch: "Pause all new USMCA loads — routing to TRANSP"

## DB Script (emergency, if UI unavailable)

```sql
BEGIN;
UPDATE usmca_ops.activation_state
  SET state = 'rollback', rollback_at = now(), updated_at = now()
  WHERE state != 'rollback';
INSERT INTO usmca_ops.activation_audit (from_state, to_state, notes)
  SELECT 'full_active', 'rollback', 'Emergency rollback via SQL — UI unavailable'
  WHERE NOT EXISTS (SELECT 1 FROM usmca_ops.activation_audit WHERE to_state = 'rollback' AND created_at > now() - interval '5 minutes');
COMMIT;
```

## Communication Plan

| Audience | Message | Channel |
|----------|---------|---------|
| Dispatchers | "Route all loads through TRANSP until further notice" | Group chat + email |
| Drivers | "Your loads will use TRANSP carrier code today — no action needed" | SMS via TMS |
| Customers | "Brief transition to TRANSP while USMCA stabilizes — invoices unaffected" | Email (accounting sends) |
| Factoring (Faro) | "Pause USMCA carrier invoices — revert to TRANSP until notified" | Phone + email |

## QBO State Restoration

1. In QBO: journal entry reversing any incorrect USMCA class postings (accounting to execute)
2. Re-run settlements under TRANSP for any loads incorrectly routed
3. Verify bank reconciliation matches after re-routing
4. Schedule debrief with accounting team within 48 hours

## Re-launch Criteria

After rollback, restart from `rollback → hidden` state via Activation Panel.  
Minimum 7-day stabilization window before re-attempting launch.
