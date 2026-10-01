# OWNER LAW 2026-10-01 — THE MONEY PAUSE IS LIFTED. EVERY SEAT BUILDS EVERYTHING, FULLY.

**Supersedes in full:** `docs/bus/2026-09-30-OWNER-SCOPE-CHANGE-MONEY-STOPS-ALL-SEATS.md`,
`docs/bus/PASTE-ALL-SEATS-HARD-WAKE-2026-09-30-ROUND-303.md` (the "money paused" lines), and every
"money paused" / "money and paused" / "A/R A/P GL QBO bank-feed settlements stay paused" line in any
ORDERS, OUTBOX, ROUND or RULING file. If you can read "paused" next to a money item anywhere on this
bus, that line is dead. This file wins.

## Owner, verbatim, 2026-10-01

> "i need all accounting, money, economic engines fully done, complete and live."

> "all coders are to build completely fully economics, financial, mechanical money, etc., full
> linkage etc."

> "fix all issues at root, we do not patch, nor defer, we fix permanently. instruct the coders the
> same."

## What this means for every seat, no interpretation

1. **Every engine assigned to you is in scope — money included.** Accounting, settlements, driver
   pay, deductions, invoices, bills, expenses posting, A/R, A/P, GL, bank register, reconciliation,
   QBO, cost per mile, PM cost, escrow, factoring, fuel cost — all of it. Build the engine end to end:
   migration (own band), backend writer, screen, guard, and the two-way linkage declaration per
   `docs/laws/TRANSACTION-LINKAGE-LAW.md`. A block with no linkage declaration is not done.
2. **Nothing is paused.** The only standing holds are these two, and they are not pauses on building:
   - **No seeding.** Owner: "once fully and complete all engines we will seed." Do not create
     sample/test/demo records in USMCA. Build the engine; the owner seeds through the app.
   - **No handoffs.** `docs/bus/2026-10-01-LEAD-RULING-EACH-SEAT-BUILDS-ITS-ENGINE-END-TO-END.md`
     stands: you build your own engine's migration, backend, screen and guard yourself.
3. **Root fixes only.** When a guard, a test, a constraint, a stale baseline or another seat's leftover
   blocks you: fix the cause in the same PR and finish the job. No skip flags, no baseline bumps that
   hide a real drift, no `// TODO later`, no "deferred to the Lead", no "paused". If the root cause is
   a prod data defect, write the ops script with dry-run + `--apply` + audit row, open an AUTH block,
   and run it — same session.
4. **"Done" is the live screen.** Merge SHA is not done. Live row, live screen, live query — pasted in
   OUTBOX-<you>.md with the PR number.

## Seat-specific, effective now

- **CC-1:** E-15 PM cost per mile is NOT paused. Build it now, fully: real-driven miles from
  `telematics.vehicle_locations.odometer_mi` (never practical/short miles), PM cost from
  `maintenance.work_orders` → `accounting.bills` lines, per unit and per period, with the linkage
  declaration and the guard. Then every other row in `ORDERS-2026-10-01-CC-1.md` that you parked as
  "money". The Neon branch sweep (89 branches) stays yours.
- **CC-2:** fuel cost posting, Relay/fuel-card GL routing, fuel fraud → expense dispute chain — build
  the money side too, not only the integrity signal.
- **CC-3:** driver profile money tabs (pay, deductions, advances, escrow), settlement preview per
  driver, the odometer-cost linkage — build them, with E-09 retirement when readers = 0.
- **Cursor:** queue stands — Maintenance → Banking register set (B-1..B-5 per
  `ORDERS-2026-10-01-BANKING-REGISTER-SET-CURSOR.md` and `docs/design/2026-10-01-QBO-REGISTER-MECHANISM-SPEC.md`)
  → Driver profile → Customers → Vendors. The register set is money and it is ON.
- **Lead:** E-03, E-25, then the Reclassify Transactions engine (spec §24), end to end.

## Precedence

Owner Law > this file > every older ORDERS/RULING/ROUND file. The 2026-09-30 scope change was the
owner's order on 2026-09-30; this is the owner's order on 2026-10-01. The newer one governs.
