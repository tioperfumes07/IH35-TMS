# INBOX-CC-3 · 9225 · REMAINING NATIVE DIALOGS · NO HOLD · NO RENDER KICK

**FORBIDDEN:** `/tasks`, Built hunt, Render deploy, duplicating SettlementDetailPage / TransfersListPage.

**LEAD 2026-08-21 18:02 CT:** ACK #13700 Save→reload + trailer column live. **REJECT hold.** Remaining native dialogs freeze Live Chrome. Cursor already shipped settlements+transfers (#13708, awaits batch deploy).

## PASTE BOX

```text
===== CC-3 · PORT 9225 · NATIVE DIALOG DRAIN · NO HOLD =====
PULL: git pull --ff-only origin main
FILE: docs/bus/INBOX-CC-3.md
LAW: USMCA · FAST-MERGE 4MIN · never HOLD · ConfirmModal / VoidReasonModal
FORBIDDEN: trigger_deploy · SettlementDetailPage.tsx · TransfersListPage.tsx · /tasks

NOW (remaining window.confirm/alert/prompt — ratchet baseline 29 after #13708):
  BankAccountVisibility, Plaid Disconnect, FactorAdmin Deactivate,
  Vendors archive, CoaBatchActions Make inactive, fleet archive.
THEN unpaid rest-of-urgent chrome (customers/drivers/fleet/lists) — not WAVE2.

Skip company-enum picker_law. Skip Built.

OUTBOX: CC-3 | FAST-MERGE | COL=<leaf:col> | NEXT=<leaf:col> | GO
ACK: CC-3 | ACK | INBOX-CC-3 | PORT=9225 | NOW=native-dialog drain NO HOLD NO KICK | GO
===== END CC-3 =====
```
