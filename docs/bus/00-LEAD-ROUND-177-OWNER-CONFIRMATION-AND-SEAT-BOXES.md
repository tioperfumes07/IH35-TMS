# ROUND 177 — OWNER ASKED FOR CONFIRMATION. THE ANSWER IS **NO, NOT YET.**
2026-09-28, Laredo Central. Lead. Measured live under `neondb_owner` + `bypass_rls`.

## WHAT IS CONFIRMED ✅
- **16 loads, 16 invoices, 1:1.** Every current load 13624–13639 carries a live non-void invoice.
- **Pre-invoices are dated to DELIVERY, exactly as ordered.** `issue_date = due_date = delivery date`
  on all 16. No net-30 anywhere. 13635 and 13637 carry 2026-10-01; 13630 and 13634 carry 2026-09-30.
  Cash flow will show them on the day we deliver and factor.
- **31 of 32 stops rooftop; 27 precise geofences live**; 19 dead 8,000 m city blobs deactivated.
- **Google shortest miles on all 16 loads**, deadhead on all 4 true tour legs.
- **Ledger square:** debits = credits = $2,978,744.96.

## WHAT IS **NOT** CONFIRMED — DO NOT TELL THE OWNER OTHERWISE ❌

### 1. DRIVER PAY IS NOT SEEDED. 14 OF 16 LOADS HAVE ZERO DRIVER BILLS.
Only **13631 ($644.64)** and **13634 ($656.64)** carry a driver bill. The other **fourteen have none.**
`13624, 13625, 13626, 13627, 13628, 13629, 13630, 13632, 13633, 13635, 13636, 13637, 13638, 13639` — zero.

### 2. ZERO EXPENSES ON ALL SIXTEEN LOADS.
`accounting.expenses` non-void count = **0** on every one of the 16.

Without those two, Load Costs is empty, pre-settlements have nothing to itemize, and company vs
driver settlement parity cannot be tested at all. **This is the single biggest open gap in the app.**

### 3. PDF PRINT FOR DRIVER AND COMPANY SETTLEMENTS — NOT BUILT, NOT VERIFIED.
Print/PDF buttons are CC-3's Round 173 JOB 5 and have not shipped.

### 4. COMPANY ↔ DRIVER SETTLEMENT PARITY — UNPROVEN.
Cannot be proven while 14 loads have no driver bill. No parity harness exists.

### 5. EVERY LOAD BOARD UI CLAIM — UNVERIFIED BY LEAD.
Lead has not opened the boards in Chrome. Anything said about them would be a guess. The owner has
reported four live defects on the Truck Line board that are **new and unfixed** (below).

---

# CC-3 — ROUND 177 — TRUCK LINE BOARD: FOUR OWNER-REPORTED DEFECTS
Owner, verbatim: *"I ASKED YOU TO FIX THE DROP DOWN FILTER BOX WHEN CHANGING THE STATUS. IT WAS DROP
DOWN, TYPE BOX, AND IT STILL IS NOT WORKING IF I CLICK ON ON TIME, AND DO NOT SELECT ANYTHING OR
CLICK ON ANOTHER PART OF THE PAGE, IT LEAVES IT OPEN. SOMEONE MOVED MY TRUCK LINE DESIGN AND IT IS
NOT AS IT WAS DESIGNED OR AS WE AGREED. COLUMNS ARE NOT SEPARATING TRUCK, TOUR/PRESETTLEMENT/LOAD
NUMBER. THE TRUCK IS NOT MOVING CORRECTLY. THE TIME LINE OR DISPATCH TO DELIVERED IS OUT OF
PROPORTION."*

**JOB 1 — Status dropdown stays open.** Click "On Time", select nothing, click elsewhere → it stays
open. Fix: close on outside click (pointerdown on document, not click), on Escape, and on blur; and
close on selection. Add focus-trap-free keyboard handling — Escape always closes and returns focus
to the trigger. This is the **second** time it has been reported. Write the regression test.

**JOB 2 — The Truck Line design was moved off the agreed layout.** Find the commit that changed it
(`git log -p` on the Truck Line component and its CSS), name it in your report, and restore the
agreed design. Do not re-design it from taste — restore what was agreed, then say what changed and who.

**JOB 3 — Columns are not separating.** **Truck**, **Tour / Pre-settlement number**, and **Load
number** must each be their own column. Not concatenated, not stacked in one cell. Related to the
`TourLegsCell.tsx:78-91` single-cell defect already in your Round 173 JOB 4.

**JOB 4 — The truck is not moving correctly and the dispatch→delivered timeline is out of
proportion.** The bar must be proportional to real elapsed time between the load's first pickup
`scheduled_arrival_at` and its last delivery `scheduled_arrival_at`, and the truck marker positioned
by actual progress, not by a fixed or index-based step. Live data to test against: **13635 runs
2026-09-25 → 2026-10-01 (6 days)** and **13626 ran 2026-09-24 → 2026-09-25 (1 day)**. Those two must
render visibly different lengths. If they look the same, the scale is wrong.

**JOB 5 — carry over, still owed:** HOS in List view (`*_hours_remaining` is **MINUTES**:
660/840/4200; `duty_status` empty on all 16 drivers), pre-settlements render **PENDING**, the 48-row
dash from `settlementNumber.ts`, the four itemization ParityTables fuel-first, **print + PDF buttons
for driver and company settlements**.

**PROOF: Chrome screenshots after deploy, one per job.** Owner's law — if he cannot open it and
click it, it is not done. Mid tier; free tier for screenshots.

---

# CC-2 — ROUND 177 — SEED DRIVER PAY ON THE 14 LOADS. THIS IS THE BIGGEST GAP.
You reported nothing queued. This is queued.

**JOB 1 — Driver bills for the 14 loads listed above.** Use the **existing tested driver-pay engine**
— the one built off the 2019-forward load history with NB, deadhead and return averages. Do not
write a second one. Do not invent a rate.

Inputs are now live and real, so the engine has what it needs:
- `mdata.loads.miles_shortest` — Google shortest, populated on all 16 (Round 174).
- `mdata.loads.deadhead_miles_to_pickup` — Google shortest on the 4 true tour legs; **null on the 12
  first-leg loads, and null means "deadhead from the truck's live position", not zero.** Do not
  coerce null to 0 to make the math run. If the engine needs a deadhead for a first-leg load, stop
  and report it rather than zeroing it.
- `driver_pay_rate_per_mile` on the load, and the driver's own rate where the engine reads it.

Cross-check before you write: **13631 = $644.64 and 13634 = $656.64** are the two bills that already
exist. Run the engine against those two first. **If it does not reproduce those two numbers, the
engine is wrong or the inputs are — stop and report. Do not write 14 bills off an engine that cannot
reproduce the 2 we already have.**

**JOB 2 — Load expenses.** `accounting.expenses` is zero on all 16. Determine what legitimately
belongs there now (fuel drawn, tolls, lumper, scale) versus what only exists after delivery. Seed
only what is real and documented. **Never fabricate an expense to make Load Costs look populated.**
Report what you seeded, what you could not, and why.

**JOB 3 — Company ↔ driver settlement parity harness.** A guard that proves, for any settlement, that
the company side and the driver side reconcile to the cent — same loads, same miles, same pay basis,
differences explained by named deductions only. **Scope to USMCA; exclude TRANSPORTATION loads;
keep all expense documents.** This is what the owner is actually asking for when he says "they will
always match." Name it `verify-company-driver-settlement-parity.mjs`.

Mid tier. Sequential. Query pasted, before and after counts pasted.

---

# CC-1 — ROUND 177 — PROVE THE BOARDS AGREE, AND CLOSE 13628
You reported JOB 1 closed. Next.

**JOB 1 — One load set, every view.** Build `verify-load-boards-agree.mjs`: the Truck Line board,
the List view, the Load Costs tab and the dispatch board must return **the same set of load numbers**
for the same filter, all from the **canonical active-load predicate**
(`apps/backend/src/dispatch/canonical-active-load-set.ts`) — not four separate queries that drift.
Today's expected set is the 16: **13624–13639**. The guard fails if any view returns a different set.
This is the permanent answer to *"all load board views showing the same loads."*

**JOB 2 — Close 13628's missing stop.** You correctly named it and correctly did not repair it inside
a register PR. Repair it now in its own PR: the Armstrong ratecon `4690712-1` (`loads_5654578.pdf`)
has **two** Secaucus pickups — White Toque Frozen Warehouse, **11 Enterprise Ave N**, and White Toque
Dry Warehouse, **1 County Rd**, both Secaucus NJ 07094. Insert the missing one in sequence and handle
the downstream you already identified: `stop_arrivals`, mileage-from-stamps, geofence. Also confirm
the ratecon rate **$4,875.00** against the invoice, which currently reads **$4,875.00** — verify it
is the same number for the same reason, not a coincidence.

**JOB 3 — Cash flow renders the pre-invoices on delivery date.** Prove it live: all 16 invoices have
`issue_date = due_date = delivery date`. Confirm the cash flow surface reads that date and not an
assumed net-30, and that the four October dates (13635, 13637 on 2026-10-01; 13630, 13634 on
2026-09-30) land in the right period. Guard it.

Mid tier.

---

## STANDING
Nobody re-measures a closed number. Nobody fabricates a row to make a screen look full. Highest ROUND
wins; a retraction outranks the box it retracts. Report shape: what I did · the proof it's real ·
what's next · which tier you used.
