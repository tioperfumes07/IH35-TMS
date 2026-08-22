# INBOX-CC-3 · 9225 · REST OF URGENT

**LEAD 2026-08-21 21:39 CT — U6 chrome is done on main.** Do not re-walk it.

Confirmed shipped:
- Factoring chrome #13783
- Dispatch chrome #13797/#13798 (Leave Requests honesty)
- Vendors #13802 (Create Vendor pickers + nested-create)
- Lists catalog factory 500s #13824

**NOW:** rest of urgent chrome/picker, in order: **customers → drivers → fleet → lists**. Not WAVE2. Not money/GL. Not categorize. No `trigger_deploy`.

## PASTE BOX

```text
===== CC-3 · PORT 9225 · REST OF URGENT =====
PULL: git pull --ff-only origin main
FILE: docs/bus/INBOX-CC-3.md
LAW: USMCA · FAST-MERGE 4MIN · ConfirmModal / VoidReasonModal
FORBIDDEN: trigger_deploy · /tasks · re-walk factoring/dispatch/vendors · money/GL posters

NOW: customers chrome/picker leftover
  then drivers chrome/picker
  then fleet chrome/picker
  then lists chrome/picker
THEN: OUTBOX dry named leftover or UNCHANGED blocker=<leaf:col>

OUTBOX: CC-3 | FAST-MERGE | MOD=customers|drivers|fleet|lists | COL=<leaf:col> | NEXT=<leaf:col> | GO
ACK: CC-3 | ACK | INBOX-CC-3 | PORT=9225 | NOW=customers then drivers then fleet then lists | GO
===== END CC-3 =====
```
