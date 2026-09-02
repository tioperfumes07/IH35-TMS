# INBOX-CC-1 · GO-22 ONLY · OWNER 2026-09-02

`git pull --ff-only origin/main`

**FAST-MERGE ON.** Never POST Book Load. USMCA only.

## VOID
Miles / GO-16 (Cursor alone) · remake N1 (expense #19641 + bill/BP #19676 are DONE) · docs-only ACK as progress · flip `autofill_allowed` in DB · invent a third settlement counter · `MAX()+1`

## NOW
1. **GO-22 pre-settlement + settlement** end-to-end.
   - Build the query service named by the TODO in `book-load.service.ts` (presettlement link deferred). Wire `presettlement_link_id`. Delete the deferred log.
   - Settlement display number via `lib.trace_counters` — match existing `LD` **or** `LOAD` (whichever the load allocator uses). Never invent a third. Never `MAX()+1`.
   - Manual attach / detach / close-early in the **same** slice.
   - Every settlement: balanced JE, load/unit/driver links, three dates, void = reversal with a register.
2. **CLOSE RULE — LOCKED (Jorge 17:20Z). Build against this; do not re-derive.**
   - Boundary = **tour** (leave home → return home), not one load, not a date range.
   - Home base = **23918 Mines Rd, Laredo TX 78045** (geofence that address).
   - Load mint → enters a **pre-settlement**. Settlement stays OPEN while the driver still physically has a load.
   - Truck inside Laredo geofence with **no load** = closeable. Southbound leg does **not** close it. Deadhead back to yard must **prompt**, not assume.
   - At close: accountant/admin/owner decides pay timing. Outstanding loan/debt → **blocking** pop-up (cannot skip/defer). Wire recovery policy as **config** (5% net-pay floor vs full deduct first) — **Jorge still decides which**; do not hardcode.
   - B1 = hired drivers. **FUEL is truck operating cost** (fuel card / Corpay) — **never** a settlement deduction.
   - Three dates: incurred / due / paid — never collapse.
3. Kill the **2 remaining USMCA sample drivers**. Counts before/after.

ACK `CC-1 | ACK | GO-22 ONLY · sample drivers · N1 already shipped · NEVER POST | GO`
