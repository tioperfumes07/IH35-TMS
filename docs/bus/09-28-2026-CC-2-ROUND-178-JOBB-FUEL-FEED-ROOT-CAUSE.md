# ROUND 178 JOB B — fuel feed stopped 09-24: root cause named, catch-up source doesn't exist yet on this machine

"Find out why — Relay or Loves API, a scheduled job that is not running, or a manual export
nobody has pulled. Name the cause, fix it, and import the gap. If the source has no data for
those days either, say so plainly; do not paper over it." Done, in that order. Mid tier, by hand,
no forks. USMCA `5c854333-6ea5-4faa-af31-67cb272fef80`, `SET LOCAL ROLE neondb_owner; SET LOCAL
app.bypass_rls='lucia';`.

## It is NONE of the three named candidates

**Not the Relay API.** `integrations.relay_fuel_transactions` (the raw Relay staging table) has
live data through **2026-09-27** — 8/10/13 rows landed on 09-24/09-25/09-26 respectively, fresh.
The Relay integration is working; Relay is not the gap.

**Not a crashed scheduled job.** Checked whether the code that would move Relay data into the
canonical `fuel.fuel_transactions` table is broken. It doesn't exist as a live path at all: grepped
the full backend for every call site of `bridgeRelayFuelToCanonical()` (the only function that does
this) — zero call sites outside its own file and tests. It is dead code by design, not a crash.
Its own file explains why (`relay-fuel-ingest.service.ts:299-305`, unmodified, owner-ruled): *"ROUND
43 FOLLOW-UP item 2: no fuel.fuel_transactions bridge, no GL candidate. ... bridging it into
fuel.fuel_transactions unconditionally is what manufactured this round's 39 confirmed duplicate
fuel rows (FUEL-DEDUPE-01/02/03/04) against Dreamline's own real statement rows."* Re-wiring it
would reintroduce a defect the owner already had fixed. Not touched.

## The real cause: `fuel.fuel_transactions` has never been a live feed

```sql
SELECT source, COUNT(*), MAX(transaction_at)
FROM fuel.fuel_transactions
WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
GROUP BY source;
-- source='import', count=450, max=2026-09-24T12:09:39Z. Every single row, no exceptions.
```

Grepped every INSERT INTO `fuel.fuel_transactions` in the codebase: all real writers are
**scripted settlement-document/card-statement imports** —
`scripts/feed/feed-settlement-day.mts`, `feed-day-{817,818,821,831}-*-faro.mts`,
`close-faro-day.mts`, `scripts/ops/absorption-b1-fuel-ingest.mjs` — not a cron, not a live API
poll. There is no scheduled job to be "not running." Someone runs a feed script per settlement
batch as documents come in; **the last batch fed covered through 2026-09-24, and nobody has fed
one for anything after that yet.** That's the actual mechanism, named precisely rather than
guessed at.

## Catch-up: the source data for the gap does not exist on this machine yet — said plainly, per instruction

Checked `~/Downloads` for anything covering 09-22 onward for the bulk diesel fuel-card feed:
`09-22-2026-FUEL-CARD-PROVIDER-STATEMENT-0807-0921-PARSED.csv` is the newest fuel-card statement
present, and its own filename states its range ends **09-21** — before the gap even starts.
Checked the 4 xlsx files named in this round's own JOB A: `09-25-26-DRIVER CARRIER
EXPENSES.xlsx`'s own `Item` categories are `Fuel-DEF-Diesel Exhaust Fluid`, `Fuel-Reefer Diesel`,
lumper/scale/tire/misc — **no plain bulk-diesel fuel-card line at all**. Those two DEF/reefer-diesel
rows dated 09-25 and 09-27 in that file are a real but small, different category (already
in scope for JOB A's expense import, not this table). The bulk $216,277.80 / 450-row population in
`fuel.fuel_transactions` is fed from settlement/card-statement documents, and no such document
covering 09-22-today has landed on this machine yet.

**Not importing anything for the gap.** There is nothing real to import — fabricating fuel
purchases to fill the date range is exactly what the standing law forbids. The honest state: the
gap is real, its cause is identified precisely (feed cadence, not a broken system), and closing it
needs the next settlement/card-statement batch to actually exist first.

— CC-2, tier: mid (Sonnet-class) — code/DB investigation, not money-moving logic (nothing written)
and not an unfound root cause once traced (each step had a direct, checkable answer).
