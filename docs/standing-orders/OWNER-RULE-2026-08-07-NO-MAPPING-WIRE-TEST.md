# OWNER RULE — 2026-08-07 (LOCKED by Jorge): FINISH THE SOFTWARE — USMCA, WIRE + TEST

**Owner decision. This is the priority. No approval gates, no CPA, no "locked law" ceremony —
the owner decides. Auto-load and obey.**

## THE priority (always has been)
**Finish the software — wiring, connectivity, linkage, functionality, expenses — end to end.**
Do it in **USMCA**, transactions **from zero**, and drive every Scenario Tracker dot green on real
USMCA data.

## Same fleet as transportation (carried over, not rebuilt)
- **Transportation (TRANSP) ceases operating completely in a few weeks.** The operation continues
  under **USMCA**.
- USMCA uses the **SAME driver + truck + GPS/Samsara tracking database** as transportation —
  **shared / carried over**, so the day TRANSP goes dark USMCA already runs the real fleet.
  **Do NOT rebuild a separate USMCA fleet. Do NOT split the driver/truck/tracking data.**
- What stays USMCA's own = the **books**: USMCA's journal entries, invoices, settlements, expenses,
  GL. The money is USMCA's; the trucks, drivers, and tracking are the shared real fleet.

## No QuickBooks, no mapping
- **USMCA has no QuickBooks.** QBO is fully out of scope: no sync, no reconcile, no QBO mapping.
- **Ignore TRANSP's books and QBO.** TRK is a lease company.
- Stop all account/entity/QBO/historical **mapping**. It is not the job.

## Account creation (owner-authorized)
- Choosing which account a JE debits/credits is **wiring** — it continues.
- Need a chart-of-accounts / catalog account that doesn't exist? **CREATE IT** — additive, sensible
  default. Do NOT stop to ask or map. **Owner edits later. Never block a wire or a test on naming.**

## One-line version for the loop
> Finish the software in USMCA. Use the same driver/truck/tracking DB as transportation (carried
> over — TRANSP is closing). USMCA keeps its own books. No QBO, no mapping. Need an account? Create
> it, owner edits later. Wire and test every scenario green on real USMCA data.


## METHOD (LAW-2026-08-07-VERTICAL-METHOD) — owner-locked, permanent
METHOD = VERTICAL SWEEP BY CLASS (vertical coding), NOT module-by-module: pick one defect class, sweep it globally across every module and prod, classify origin, fix the root cause once, ship one mutation-proven guard. Never the old block/module-by-module way.

## NEVER PAUSE (continuous loop) — owner-locked 2026-08-07
Every coder works non-stop: finish a task -> immediately pull the next create-surface / class / board item -> keep going. No idling, no waiting for approval, no stopping to ask. The only stop is a genuine owner business decision. Fix your own red PRs first, then continue. The orchestrator (Claude desktop) keeps everyone working and MERGES green PRs + FIXES or ROUTES conflicting PRs so the pipeline never stalls.

## PROD-WRITE SAFETY (owner-lane law, 2026-08-07 — from CC-3 live finding)
mdata.drivers (and other identity-scoped tables) RLS keys on USER IDENTITY, not app.operating_company_id. The MCP/app role alternates neondb_owner / ih35_app. A write as ih35_app WITHOUT `SET LOCAL app.bypass_rls='lucia'` in the SAME transaction silently affects ZERO rows and RETURNS SUCCESS. Therefore: every prod write must (a) set the bypass the policies actually read, in the same transaction, and (b) carry a visibility/row-count control (RETURNING or a same-tx re-count) — or the write is UNVERIFIED. A 0-row UPDATE that "succeeded" is the false-success trap.
