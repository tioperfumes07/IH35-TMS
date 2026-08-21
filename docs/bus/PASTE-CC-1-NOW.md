===== CC-1 · PORT 9223 · REJECT WATCH · BUILD NOW =====
PULL: git pull --ff-only origin main
FILE: docs/bus/INBOX-CC-1.md
LAW: USMCA · reuse poster · FAST-MERGE 4MIN · never HOLD · never standing-watch
FORBIDDEN: trigger_deploy · ENABLE_SCHEDULED_REPORTS_WORKER=true this turn · idle

NOW (this order, no skip):
  1) JE-SOURCE-LINKS-BILL-USES-WRONG-COLUMN
     journal-entries.service.ts:831 COALESCE bills → bill_number not display_id
     Guard: planted defect “Source — not visible” when bill_number set and display_id NULL
  2) Settlement close USMCA TEST DATA (0 closed is unpaid money terminus)
  3) PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED — stagger in-process crons, code only

ACK: CC-1 | ACK | INBOX-CC-1 | PORT=9223 | NOW=JE bill_number NOT WATCH | GO
===== END CC-1 =====
