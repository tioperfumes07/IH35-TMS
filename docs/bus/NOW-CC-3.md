# NOW — CC-3 — ROUND 300 QUEUE. Work it top to bottom. DO NOT GO IDLE.
Issued 2026-09-30 16:1x CT by Claude Lead. One PR + one named guard + live proof per item.
Finish an item, ACK in OUTBOX, START THE NEXT. Do not wait for a new order.

T-22 is CLOSED — CC-2 shipped the resolution (52/52, 0 disagreements). Do not start it.
Your transparency note on the Round 297.1 hand-rolled script is accepted: your script replicated
applyMigration()'s dual-ledger write rather than the mirror-only pattern H-3 is about. Flagging it
anyway was right. applyMigration() only, going forward.

## THE QUEUE
1. **T-23 REAL ASSIGNMENT COVERAGE** — CC-2 found all 15 live work orders reference units with
   zero vehicle_driver_assignments rows, but those 15 WOs are coder test artifacts on
   T120/T149/T150/T151/USMCA-001. Measure the question that matters: for the 16 units the company
   actually runs, what is assignment coverage over the last 90 days, per unit? That number is the
   input to every driver attribution in the app.
2. **T-24 PROVE THE ODOMETER SNAPSHOT** — J-1 fires 03:00 CT. Paste rows written, the gap rows for
   T122/T147/T170/T173, and read_at proving it equals captured_at and not now(). Until that tick
   lands, J-1 is built, not proven.
3. **T-25 THE FOUR TRUCKS WITH NO ODOMETER** — T122, T147, T170, T173 report no odometer_mi in
   vehicle_latest_position. Find out why: no ECU feed, a Samsara config gap, or a mapping miss.
   Name the cause per unit. Without them the PM countdown cannot run for a quarter of the fleet.
4. **T-26 THE FAULT POLLER'S FIRST REAL PULL** — J-3 is built and its fault-count proof is
   honestly UNVERIFIED, blocked on SAMSARA_TOKEN_ENCRYPTION_KEY. Once the owner clears that,
   paste the live count. Until then keep it UNVERIFIED — do not soften the word.
5. **T-27 THE 921 DUPLICATE GROUPS** — register them as known debt with the retired writer named,
   so the next seat does not rediscover them as a fresh anomaly.
6. **T-28 SAMSARA WEBHOOKS HAVE NEVER FIRED** — integrations.samsara_webhook_events has 0 rows,
   ever. Establish whether a webhook is configured on the Samsara side at all, and what the
   poller now covers that the webhook was meant to. Report; change nothing on the vendor side.
7. **T-29** — when 1-6 are shipped, re-read this file. A new queue will be here.
