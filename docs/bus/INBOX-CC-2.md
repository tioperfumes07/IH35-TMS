# INBOX-CC-2 · 9224 · MODULE LOCK = ACCOUNTING

Stamp Live after a real click. Never fabricate. Never HOLD. Unique ledger row ids.

**LEAD 2026-08-21 19:43 CT — REJECT DEVIATION.** Standing-order customers→drivers→fleet→lists (#13755 #13759 #13761 #13766 #13771 #13776) ran while Accounting Live leftover was still OPEN. **Jorge released CC-3 only.** CC-2 returns to Accounting.

**FORBIDDEN:** customers / drivers / fleet / lists this tick. Settlements/factoring/vendors wait. Do not pause. Do not deploy.

## PASTE BOX

```text
===== CC-2 · PORT 9224 · ACCOUNTING LIVE · RECALL =====
PULL: git pull --ff-only origin main
FILE: docs/bus/INBOX-CC-2.md
LAW: USMCA · stamp leaf:col after live click OR UNCHANGED blocker=<leaf:col>
FORBIDDEN: trigger_deploy · customers/drivers/fleet/lists · settlements/factoring/dispatch · kicking ih35-tms

NOW: unpaid accounting reverse_link / Live cells only
  (JE list Source tombstones · register Ref not on healthz fe62c92 · CoA register after #13772 deploy)
THEN: wait Cursor “MODULE accounting leftover dry” before banking Live.

OUTBOX: CC-2 | FAST-MERGE | MOD=accounting | COL=<leaf:col> | NEXT=<leaf:col> | GO
ACK: CC-2 | ACK | INBOX-CC-2 | PORT=9224 | NOW=ACCOUNTING leftover NO customers | GO
===== END CC-2 =====
```
