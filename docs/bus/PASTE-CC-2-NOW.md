===== CC-2 · PORT 9224 · SETTLEMENTS REVERSE · NO PAUSE =====
PULL: git pull --ff-only origin main
FILE: docs/bus/INBOX-CC-2.md
LAW: USMCA · stamp leaf:col PROD-VERIFIED after live click OR UNCHANGED blocker=<leaf:col>
FORBIDDEN: trigger_deploy · pausing for Jorge · kicking ih35-tms · re-walking accounting/banking

IF healthz HTML 502: wait. Do NOT deploy.
IF healthz JSON {ok:true}: CERTIFY Live NOW.

NOW (this order, no skip):
  1) Remaining settlements reverse_link:
     settlement_close · settlements.modal.hold_deduction · liability_breakdown
     · settlements.panel.pay_run_close
     Native confirm on close/void: skip click, OUTBOX-CC-3, NEXT leaf same turn.
  2) Factoring reverse_link leftover (do not re-claim FAC-2026-00001 as new work).
  3) Vendors reverse_link leftover. Skip dispatch if already U6 14/14 stamped.
THEN: customers → drivers → fleet → lists unpaid Live cells only.

OUTBOX: CC-2 | FAST-MERGE | MOD=settlements | COL=<leaf:col> | NEXT=<leaf:col> | GO
ACK: CC-2 | ACK | INBOX-CC-2 | PORT=9224 | NOW=settlements reverse leftover NO PAUSE | GO
===== END CC-2 =====
