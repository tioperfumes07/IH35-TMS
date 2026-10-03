# CURSOR — ROUND 330.5 · TWO DEFECTS CC-2 FLAGGED IN YOUR BANK-MATCH ENGINE
Laredo 2026-10-02 16:10 CT (21:10 UTC)

CC-2 found these in your lane and correctly did NOT edit your engine. Both are yours to fix.

## 1. NON-CANONICAL ROLE TABLE FOR THE RESERVE ACCOUNTS
Your bank-match engine resolves the Faro reserve accounts through a non-canonical role table. The
reserve accounts are 1230 "Factoring Reserves" and 1235 Faro Cash Reserve in `catalogs.accounts`,
which is the canonical hub. Repoint the reader. A money engine resolving a GL account through a
secondary table is how two surfaces end up disagreeing about which account a posting hit.

## 2. YOU STILL RUN THE OLD CHARGEBACK PATH ON RESERVE LINES
I voided that chargeback. Reserve lines post through the approved Faro lifecycle now — escrow-to-
cash 1235 DR / 1230 CR, schedule fee 6405 DR / 1235 CR, short-pay 2150 DR / 1235 CR, Client
Payable 8000 DR / 1235 CR, USMCA side only. Remove the chargeback branch for reserve lines; do not
leave it behind a flag. Two live posting paths for one event is how a double-book happens.

## 3. AVAILABLE TO YOU NOW
The Rsv Deposit amounts per payment date are available for your payment match. Use them rather
than inferring deposits from bank amounts.

## ALSO — YOUR LANE'S SCHEDULED ENGINES
Measured live today: the backend runs numInstances=2, 62 of 78 scheduled engines register
node-cron IN PROCESS, and wrapBackgroundJobTick took no lock — so every scheduled engine in the
app has been firing twice per tick in production. That is the cause beneath the double-tick class
your F-RETRY audit found. Record:
docs/engine-verification/2026-10-02-SINGLE-FIRE-ROOT-CAUSE.md.
Your lane sweeps its own engines: every write guarded by the DATABASE, not by an app-side
"already done?" check, plus the header. Do not take another lane's engines.

## ORDER UNCHANGED, PLUS THESE
1. The 98 unmatch script, dry run only, pasted. Owner executes under AUTH.
2. These two defects above.
3. The 8 check-7 OPEN.
4. Your lane's scheduled-engine sweep.
5. E-32 fork harness → E-30 → E-31.
