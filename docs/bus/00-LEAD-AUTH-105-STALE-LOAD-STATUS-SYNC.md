# CC-3 — AUTH-105 — GRANTED, WITH ONE CONDITION. TAKE OPTION 1.
2026-09-28, Laredo Central. Lead. Verified live before granting — not taken on your word.

## VERIFICATION — LEAD MEASURED IT INDEPENDENTLY
`SET LOCAL ROLE neondb_owner` + `SET LOCAL app.bypass_rls='lucia'`:

| Load | load status | USMCA | invoice | inv status | total | driver bills | settled |
|---|---|---|---|---|---|---|---|
| 13503 | completed_docs_received | yes | INV-2026-00001 | sent | $4,900.00 | 1 | **1** |
| 13504 | completed_docs_received | yes | INV-2026-00002 | sent | $4,900.00 | 1 | **1** |
| 13509 | completed_docs_received | yes | INV-2026-00003 | sent | $4,400.00 | 1 | **1** |
| 13539 | completed_docs_received | yes | INV-2026-00005 | sent | $4,860.00 | 1 | **1** |

All four: USMCA, invoice **sent**, driver bill **settled into a settlement**, load status never
advanced. Your finding is correct and the guard is right to fire. This is a real stale-status defect,
not a false positive like the one in Round 176.

## AUTH-105 — GRANTED
**Scope:** run the existing `syncLoadStatusToBilling()` one-shot against **exactly these four load
ids and no others**: 13503, 13504, 13509, 13539.
**Why it is safe:** it walks status forward only through already-allowed transitions. It invents no
data, creates no document, moves no money, and it is the same sanctioned engine
`scripts/ops/2026-09-26-lead-r205-close-funded-loads.ts` used for the identical defect two days ago.
**Not authorized:** any load outside those four, any status transition the engine does not already
permit, any hand-written status UPDATE. If the engine refuses a load, report it — do not force it.

Add the AUTH-105 text to `docs/bus/OWNER-AUTHORIZATIONS.md` with these four load numbers named.

## THE CONDITION — AND IT IS NOT OPTIONAL
**This is the second time in three days.** R205 did the same one-shot on 2026-09-26 for the same
defect class. Running it a third time is patching, and the owner's law is no patching.

**In the same PR, find and fix the root cause: closing a settlement and sending an invoice does not
advance `mdata.loads.status`.** Something in that chain either never calls the sync, calls it before
the invoice is sent, or swallows a failure. Read the settlement-close and invoice-send paths, name
the exact file and line where the status advance should happen and does not, and wire it.

Then guard it: **`verify-settlement-close-advances-load-status.mjs`** — closing a settlement with a
sent invoice must leave the load's status advanced, asserted at close time, not swept up later by a
one-shot. That guard is what makes AUTH-105 the last one of these.

If the root cause turns out to be bigger than this PR can safely carry, say so with the evidence and
Lead will scope it separately — but **you must name it before you push**, not defer it unnamed.

## SCOPE DISCIPLINE — DO NOT LET THIS GROW
Fix the four, fix the cause, guard it, push. Your Round 176 guard predicate and your Round 177 Truck
Line jobs are still owed and unchanged: the status dropdown that will not close, the moved Truck Line
design, Truck / Tour-Presettlement / Load as separate columns, the out-of-proportion
dispatch→delivered timeline, HOS in List view (MINUTES, not hours), pre-settlements rendering
PENDING, the 48-row dash, the itemization ParityTables fuel-first, and print + PDF for driver and
company settlements.

## PROOF
The four loads' status before and after, pasted live. The named root cause with file and line. The
new guard exit 0. The full push gate green. Mid tier.
