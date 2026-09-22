# LEAD RULING — 2026-09-22 — **THE RECONCILER**
## Every defect today has ONE generative cause. This is it, and this is the fix.

Owner: *"THE BILLS ARE SUPPOSED TO BE AUTO CREATED FROM THE DRIVER. YOU NEED TO STOP AND THINK
DEEPLY AND FIND A SOLUTION TO ALL THE ISSUES, LINKAGE, BECAUSE YOU ARE FAILING... YOU ASKED THE
CODERS TO FIX THE ENGINE, IT SHOULD BE DONE AUTOMATICALLY. IF I NEED TO KEEP TRACK MYSELF, WHAT
IS THE SOFTWARE FOR?"*

**He is right. I have been issuing one fix per symptom. There is one cause.**

---

## THE CAUSE — measured three separate ways, same shape every time

| capability | where it fires | what happens when that path is not taken |
|---|---|---|
| `latchOnDeliveryEvidence` | 5 in-app paths (`driver/loads.routes.ts:711`, `dispatch/stop-stamp.service.ts:125`, `dispatch/loads.routes.ts:2057`, `dispatch/loads-bulk.routes.ts:198`, `mdata/loads.routes.ts`) — **0 feed paths** | never fires; no revenue latch, no auto-factor, no tour-close posting |
| driver bill creation | **`dispatch/book-load.service.ts:984` and `:1070` ONLY** | never created; nothing notices |
| fuel → load match | once, at ingest | writes `load_exemption_reason`, **never retries** |
| settlement → load status | **nowhere** (`settlements.routes.ts` 955 / 1080 / 1273 write nothing to `mdata.loads`) | status stays stale forever |

**Every automation in this app is a one-shot, event-time, best-effort, swallow-and-log side
effect.** If the event never fires, fires before its precondition is true, or fires and fails
quietly — **nothing ever asks again.** There is no process that answers *"what should exist by
now that does not?"*

**That is why the owner is keeping track himself. Nothing else is.**

That is also precisely what QuickBooks, NetSuite and McLeod do differently. They do not assume
every event lands. They continuously reconcile state toward what it must be, and surface what
they cannot resolve. **The guarantee is a loop, not a callback.**

---

## THE FIX — **ONE RECONCILER. INVARIANTS, REPAIR, EXCEPTION QUEUE.**

Not a fix per symptom. One engine that asserts the whole dispatch-to-cash chain on a schedule
**and** on the events that change the answer, repairs what it can **through the existing
engines**, and files an exception for everything it cannot.

### The three rules that make it safe
1. **REPAIR ONLY THROUGH EXISTING ENGINES.** The reconciler contains no business logic and no GL
   math. It calls `latchOnDeliveryEvidence`, the driver-bill creator, `postSourceTransaction`,
   `autoSubmitDeliveredLoadToFactor`, the fuel re-match, `voidDocument`. It is a caller, never an
   implementation. **If an engine does not exist, the reconciler files an exception — it does not
   invent one.**
2. **IDEMPOTENT, ALWAYS.** Every repair must be safe to run a thousand times. The engines it calls
   already are (`latchOnDeliveryEvidence` is documented "own connection, idempotent,
   swallow-and-log" and returns `"skipped"` when it does not apply).
3. **NOTHING IS EVER SILENT.** Every run writes: repaired, unchanged, or **exception with a
   reason**. A swallowed error is the defect we are removing — it must not be the mechanism we
   remove it with.

### The invariants — each one is a defect we found today
```
I1  a load with an assigned driver HAS a driver bill
      today: created ONLY in book-load.service.ts:984/:1070. All 5 open loads have ZERO.
I2  a delivered load HAS an invoice
      today: fed loads never latched, so no invoice was ever raised
I3  an invoice that is 'sent' whose customer is factor-assigned HAS a factoring submission
      today: the 4 pre-settlement invoices sit at 'proforma', so auto-submit correctly no-ops
I4  a fuel transaction whose unit and purchase time fall inside a load's stop window HAS load_id
      today: 93 rows / ~9,997 gal / ~$54,615 unlinked on the active trucks alone
I5  a load whose settlement is finalized HAS an advanced status
      today: 24 loads settled + driver-billed + expensed, still reading dispatched/delivered
I6  a voided document HAS NO live postings
      today: 207 docs / $350,234.69
I7  every posting HAS source_transaction_type AND source_transaction_id
      today: 440 live lines / $315,323.20 carry NULL — invisible to every document-keyed sweep
I8  a dispatched load HAS unit, trailer, driver and a customer reference
      today: 3 of 5 no unit, 0 of 5 a trailer, 4 of 5 no customer reference
      -> and without a reference the load CANNOT BE FACTORED AT ALL
```

### When it runs
- **On a schedule** — hourly for the live window, daily for the full sweep.
- **On the events that change the answer** — a load created or fed, a status advanced, stops
  stamped, a unit or driver assigned, an invoice sent, a settlement finalized, a fuel batch
  ingested. **Event-driven for latency, scheduled for truth.** The schedule is what makes a
  missed event survivable, which is the entire point.

### The exception queue — **this is what replaces the owner keeping track**
One table. One screen. Every invariant breach the reconciler could not repair, with the load or
document, the invariant, the reason, and the age. **A load missing a customer reference is an
exception, not a silent skip.** `load_exemption_reason` becomes an exception row with a
last-attempted timestamp, so *"we tried on 09-14"* can never again read as *"we tried today."*

**The owner's screen becomes: how many exceptions, how old, whose lane.** Not a spreadsheet he
maintains.

---

## WHY THIS IS THE COMPLETE FIX AND NOT ANOTHER PATCH
Feed parity (task 49) fixes the two feed paths that bypass the latch — **and a third feed source
added next month would bypass it again.** The shared ingest entry point makes that harder. **The
reconciler makes it not matter**, because the sweep catches whatever the entry point missed.

Same for every other item: fuel re-match, driver bills, invoicing, status advance. Each one
becomes **one invariant** in a loop that already runs, instead of one more callback someone has to
remember to wire.

**This is the property the owner keeps naming. The software keeps track. He does not.**

---

## BUILD ORDER — nothing here is new code that does not already exist as an engine
1. **CC-1** — the reconciler skeleton + the exception queue table + I5, I6, I7 (his lane).
   The runner, the schedule, the event hooks, the exception writer. **Ships empty-but-running
   first**, then invariants land one at a time.
2. **CC-3** — I1 driver bills · I4 fuel re-match (he has already written the matcher) ·
   I8 linkage from the 122-load settlement parse.
3. **CC-2** — I2 invoicing · I3 factoring submission (the importer and auto-submit both exist).
4. **Every invariant ships with its own guard** and a count that must shrink. The exception queue
   is the ratchet — it is allowed to grow only when the owner adds trucks, never when we add bugs.

**Deadline for the skeleton + exception queue + one invariant proven end to end:
2026-09-23 18:00 UTC.**

**The reconciler is registered in `capability-registry.json` the day it lands. Nobody builds a
second one.**
