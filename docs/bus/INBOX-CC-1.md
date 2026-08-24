# INBOX-CC-1 · 9223 · MONEY

**RUNBOOK:** `docs/lockdown/FINISH-ALL-MODULES-UNTIL-DONE-2026-08-24.md`  
**FAST-MERGE 4 min ON · CONTINUOUS.** Never `gh pr checks --watch`. Never `trigger_deploy`. Never pause.

**PHASE A — do not stop:**

1. **U14-01-F03 THIS TURN** — `BillsPage.tsx` add Claim + WO **columns** (detail + `insurance_claim_id` filter already exist). Guard on the columns. FAST-MERGE.
2. Then **CUST-MONEY-F6312** — Customer Statements / Recurring / Late Fees. Canonical accounting sources only. No invented ledger.
3. Then grep-verify **INVENTORY-PARTS-ASSIGNMENT-PHYSICAL-DELETE**. Fix if still DELETE.

STOP `/425c`. Do not remake F02/F03 / BANK-F5987 / FACT-F5986.

OUTBOX: `CC-1 | ACK | FINISH-ALL | PORT=9223 | NOW=U14-01-F03 | GO`
