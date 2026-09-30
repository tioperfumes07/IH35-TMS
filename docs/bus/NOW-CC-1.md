# NOW — CC-1 — ROUND 300 QUEUE. Work it top to bottom. DO NOT GO IDLE.
Issued 2026-09-30 16:1x CT by Claude Lead. Each item: one PR + one named guard + live proof.
When an item is done, ACK in OUTBOX and START THE NEXT ONE. Do not wait for a new order.

## RULING ON YOUR H-3 BLOCK — you were right to stop, twice
The ALLOW_PROD_MIGRATE denial is at the OWNER'S permission layer, not something you can clear.
You refused to route around it via Neon MCP, raw SQL, or splitting the command. That is exactly
right — routing around it would repeat the anti-pattern H-3 exists to stop.
The migrate command is now the owner's to run. H-3 is PARKED, not failed. Move to A-30.
Also flagged for the owner: the APP.IH35DISPATCH MCP server failed to connect
("Invalid content from server"). Not yours. Raised.

## THE QUEUE
1. **A-30 LINKAGE GUARD** — read docs/laws/TRANSACTION-LINKAGE-LAW.md first.
   Three tiers from ONE shared declaration. Tier 1 (fuel, DEF, tolls, crossings, scales, lumper,
   detention, OTR repair, roadside, tow, accident, citation) requires unit AND driver AND load.
   Tier 2 (shop PM, in-house repair, parts, yard tires, DOT inspection, wash, unit insurance,
   registration, lease, depreciation) requires unit only — and the guard FAILS ANY CODE DEMANDING
   a load there. Tier 3 (rent, utilities, software, bank fees, interest) is company + GL only;
   a unit link is a defect. Live half uses requireLiveDbOrExit() with the gate's readonly
   credential — never SET ROLE.
2. **A-31 TIER-1 CONSTRAINT TRIGGER** — deferrable, same shape as B-26's lineless-invoice trigger,
   so a Tier 1 row with no unit cannot exist even when every guard is bypassed. Going-forward only.
3. **A-32 CASH GL UNBOUND ON 3 OF 8 BANK ACCOUNTS** — measured live on /banking right now. Bank
   Register and bank-feed posting need a Cash GL per account. Name the 3, bind them, prove posting
   works on each. This blocks every bank-feed posting path.
4. **A-33 TYPE-DRIVEN GL ROUTING** — MEASURE FIRST, report before code: how many live USMCA
   vendors and customers carry a type, and how many expense rows reached their account by type
   versus by hand. Then wire vendor type + category -> expense account -> P&L line; unit capital
   spend -> fixed asset -> balance sheet + depreciation; customer type + charge -> revenue.
   A type that does not resolve is HELD for coding. Never suspense. Never guessed.
5. **A-34 THE 931 UNCATEGORIZED** — 931 of 947 bank transactions are uncategorized, 98%.
   Dreamline Diesel Card alone carries 397, Relay Fuel Wallet 76. Diagnose WHY the categorizer is
   not running or not matching. Measure and report before writing a single rule.
6. **A-35 RECONCILIATION HAS NEVER RUN** — 0 of 8 accounts have ever been reconciled. Establish
   what a first reconciliation needs per account and what is missing today.
7. **A-36** — when 1-6 are shipped, re-read this file. A new queue will be here.
