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
