# BILLS CARRY NO TRUCK, NO TRAILER, NO WORK ORDER — AND 68 OF 93 ARE DERIVABLE TODAY. → CC-1

Owner: *"FULL LINKAGE AND WIRING AND CONNECTIVITY ... TO CUSTOMERS, VENDORS, DRIVERS, TRUCKS, TRAILERS,
LOAD, SETTLEMENT, EXPENSE, BILLS, BILL PAYMENTS."* Measured live on prod, USMCA, voided excluded.

## MEASURED

    accounting.bills — 93 live
      unit_id                  NULL on 93 of 93   100%
      trailer_id               NULL on 93 of 93   100%
      linked_work_order_uuid   NULL on 93 of 93   100%
      load_id                  NULL on 25 of 93
      vendor_uuid              NULL on  0 of 93   clean
      driver_id                NULL on  3 of 93

    68 of the 93 carry load_id, and ALL 68 of those loads carry BOTH
      mdata.loads.assigned_unit_id            -> the truck
      mdata.loads.load_trailer_equipment_id   -> the trailer

**The unit and the trailer are one join away on 68 of 93 bills. The writer never copies them.**
The columns exist. The data exists. Nothing connects them.

    accounting.expenses — 550 live, for contrast
      load_id     NULL on   1   (549 linked)
      vendor_uuid NULL on  10
      unit_id     NULL on 215
      driver_uuid NULL on 204
      trailer_id  NULL on 255
      NO link at all: 0

    accounting.invoices — 110 live: source_load_id NULL on 1, customer_id NULL on 0. Clean.

## WHY IT MATTERS
A repair bill that carries no `unit_id` cannot be attributed to a truck, so **cost-per-truck is
unbuildable** — and unit-level cost is the baseline in McLeod and Alvys, not an extra. 100% of bills are
in that state today.

Separately: **0 of 93 bills link a work order**, while **A4-D5 is locked — "require a Work Order on every
repair."** Repair bills are bypassing that requirement entirely.

## BUILD — ONE PR
1. **Derive on write.** In the bill writer (`bills.service.ts` / `bill-gl.service.ts`), when `load_id` is
   present, populate `unit_id` from `mdata.loads.assigned_unit_id` and `trailer_id` from
   `load_trailer_equipment_id`, **in the same transaction as the bill insert.** Never a later job.
2. **Explicit when not derivable.** For a bill with no load — the other 25 — `unit_id` is required when
   the bill's category is a vehicle cost. Refuse the write otherwise; do not silently leave NULL.
3. **Work order on repairs (A4-D5).** A bill whose category is a repair requires
   `linked_work_order_uuid`. Refuse without it. Then `unit_id` derives from the work order as a second
   source, ahead of the load.
4. **Do not backfill the 93.** Purge population. Fix writers, not rows.
5. Guard `verify-bills-carry-their-unit`: zero live bills with a `load_id` and no `unit_id`; zero repair
   bills with no work order. Ceiling **0**. Baseline **committed** — a gitignored self-written baseline is
   not a ratchet.

PROOF: a bill created from a load on a fork, `unit_id` and `trailer_id` populated from that load in the
same transaction · a repair bill refused without a work order · the guard at 0 · trial balance still
**2,178,029.25 / 2,178,029.25 / .00 / 7,909 postings**.
