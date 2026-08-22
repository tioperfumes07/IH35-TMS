# INBOX-CODEX · 9226 · BANKING REVERSE

Accounting reverse in this lane is treated empty. **BANK-F5735 / BANK-F5740 shipped.** **NOW=next unpaid banking reverse/connectivity leaf.** Unique FINDING ids — do not collide ACCT-F5733 / BANK-F5735 / BANK-F5740. No CDP. No deploy. No escrow SQL (CC-1).

CC-2 filed `BANKING-DRIVER-ESCROW-REGISTER-MISSING-SETTLEMENT-JE-LINK` for **CC-1** (money SQL). Do not duplicate that as a Codex money-math PR.

## PASTE BOX

```text
===== CODEX · PORT 9226 · BANKING REVERSE =====
PULL: git pull --ff-only origin main
FILE: docs/bus/INBOX-CODEX.md
FORBIDDEN: trigger_deploy · Chrome CDP · fake PASS · idle · collide ACCT-F5733

NOW: next unpaid banking reverse_link/connectivity (BANK-F5740 already merged)
0-row: OUTBOX UNCHANGED blocker=<leaf:col> then NEXT leaf same turn
IF picker: OUTBOX-CC-3. IF money SQL/labels: OUTBOX-CC-1. IF Live stamp: OUTBOX-CC-2.

OUTBOX: Codex | FAST-MERGE | MOD=banking | COL=<id> | NEXT=<leaf:col> | GO
ACK: Codex | ACK | INBOX-CODEX | PORT=9226 | NOW=banking reverse | GO
===== END CODEX =====
```
