# LEAD RULING — 2026-09-23 — LOAD-ACTIVE-SET-NO-CANONICAL-DEFINITION

**LANE-CROSS DOC.** Cite this filename under `LANE-CROSS:` in any PR that touches
`apps/backend/src/dispatch/**` or a second seat's copy of an active-load status list.

Owner, verbatim: *"LOAD COSTS IS STILL RENDERING OLDER LOADS THAT HAVE ALREADY BEEN SETTLED... ALL
LOAD BOARDS ARE STILL NOT RENDERING THE CORRECT DATA."* And, separately, as standing law:
*"ALL DATA IN THE DISPATCH MODULE SHOULD ONLY RENDER LIVE CURRENT DATA, NOT HISTORICAL. THERE ARE
REPORTS FOR THAT."*

He is right about all of them, it is one root cause, and it is measured below.

---

## THE ROOT CAUSE

**There is no canonical definition of "a live load." There are at least ten, each a private
constant or an inline SQL fragment in its own file, and no two of them agree.** Three of them
describe themselves in their own comments as "canonical."

So "which loads are live right now?" returns a different number depending on which screen you open.
That is not ten bugs. It is one missing definition, copied ten ways.

## MEASURED LIVE

USMCA (`5c854333-6ea5-4faa-af31-67cb272fef80`), `is_sample_data IS NOT TRUE`, read on Neon
`tiny-field-89581227` / `br-fancy-credit-akjnd07a` under `set_config('app.bypass_rls','lucia',FALSE)`.

**Population — 126 loads:**

```
status                   loads   issued invoice   on active settlement line
closed                      75         65                    70
dispatched                  19          0                    14
delivered                   11          0                     7
cancelled                   10          0                     6
invoiced                     6          6                     5
delivered_pending_docs       3          0                     3
draft                        2          0                     0
```

**Every definition in the codebase, scored against that population:**

| yields | definition | where |
|---|---|---|
| **116** | `l.status <> 'cancelled'` — and it is *named* `ACTIVE_LOAD_FILTER` | `cash-flow/cash-flow.service.ts:126` |
| **114** | `NOT IN ('draft','cancelled')` | `accounting/break-even.service.ts:118` |
| **114** | `<> 'draft'` + `<> 'cancelled'`, inline, no constant | `accounting/load-costs-board.routes.ts:357-358` |
| **33** | `NOT IN ('draft','invoiced','paid','closed','cancelled')` | `dispatch/loads.routes.ts:1699`, `accounting/invoices.routes.ts:574` |
| **22** | `DISPATCH_ACTIVE_LOAD_STATUSES` (6 statuses) | `dispatch/active-loads-count.ts:6` |
| **22** | `ACTIVE_STATUSES` (4 statuses, a different four) | `dispatcher-board/role-views/dispatcher.service.ts:62` |
| **22** | private `ACTIVE_LOAD_STATUSES` (6), copied three times | `telematics/fleet-location-hos.service.ts:7`, `dispatch/trip-pairing-board.service.ts:7`, `integrations/samsara/geofences/real-driven-miles.service.ts:23` |
| **19** | `DISPATCH_ON_LOAD_STATUSES` (5) | `dispatch/active-loads-count.ts:22` |
| **19** | `DISPATCH_ALERT_ACTIVE_STATUSES` (4) | `dispatch/dispatch-alert-statuses.ts:8` |
| **19** | `PLANNER_ACTIVE_LOAD_STATUSES` (4) | `dispatch/planner.service.ts:28` |

**Five different answers — 19, 22, 33, 114, 116 — to one question.**

## AND IT FAILS IN BOTH DIRECTIONS

The accounting boards show too much. **The dispatch boards hide live work**, which is the half
nobody has reported yet:

- Every status-enumerating constant keys on `at_pickup`, `in_transit`, `at_delivery` and
  `assigned_not_dispatched`. **All four hold ZERO rows in live USMCA.** The dispatch boards are
  keyed to a status vocabulary production does not emit.
- **Not one of them includes `delivered`.** Live USMCA has **11 `delivered` loads, 0 of them
  invoiced** — delivered, earned, uninvoiced, and invisible on every dispatch board that uses a
  status list.

So the same data set renders 81 finished loads on Load Costs and hides 11 unfinished ones on the
planner. Both are the same defect.

## THE RULING

**One definition. Reused. Never reinvented.** The correct active set already exists in the codebase
and is already correct — `dispatch/loads.routes.ts:1699` and `accounting/invoices.routes.ts:574`:

```
l.status NOT IN ('draft','invoiced','paid','closed','cancelled')
```

**33 loads** — `dispatched` 19 + `delivered` 11 + `delivered_pending_docs` 3. That is the number,
and it moves with real dispatch: never hard-code 33.

This matches law doc §2 exactly: *"The round trip is the unit of settlement. Open = pre-settlement
(live revenue and costs). Closed = settlement (frozen, posts to GL)."* A load leaves the live set
the moment it is invoiced, closed or paid, because at that point its numbers are frozen and belong
to the settlement. It does **not** leave when it is merely delivered — `delivered` and
`delivered_pending_docs` are still pre-settlement, which is why they must come back onto the boards.

### Execution

1. **Create the single definition.** One module, exporting the status set, an SQL fragment, and the
   demonstrably-finished predicate below. Every consumer imports it. `DISPATCH_ON_LOAD_STATUSES`,
   `DISPATCH_IN_TRANSIT_STATUSES` and `DISPATCH_ALERT_ACTIVE_STATUSES` are **narrower views for a
   named purpose and may stay** — but they must be derived from the canonical set in the same
   module, not declared independently, and each must carry the owner ruling that justifies it
   (`DISPATCH_ON_LOAD_STATUSES` already carries DSP-KPI-ON-LOAD, 2026-09-09 — keep it).
2. **Status alone is not sufficient.** It has already proven unreliable on this data. The canonical
   predicate also excludes any load that is **demonstrably finished** even where its status lags:
   it carries an invoice with `status NOT IN ('draft','proforma','void')` — the signal Load Costs
   already computes at line 246 and never applies to its outer WHERE.
3. **Delete every private copy**, including the three identical `ACTIVE_LOAD_STATUSES` and the
   misnamed `ACTIVE_LOAD_FILTER`, which is not a filter for active loads and must not keep that name.
4. **Guard it.** `scripts/verify-one-canonical-active-load-set.mjs` — fail any file outside the
   canonical module that declares a load-status list or inlines a `status NOT IN (...)` gate on
   `mdata.loads`. Seed a shrink-only baseline at the current count of offenders; four-arm ratchet
   (not-in-baseline+failing → FAIL; baseline-got-worse → FAIL; baseline-unchanged-or-better → PASS
   printed as debt; baseline-now-clean → FAIL "remove me"). Selftest must go **red against current
   code** before it goes green.
5. **Live proof in the DONE:** every board's rendered row count against production, before and
   after, as a table. Load Costs `114 → 33`. The planner and the alert queues gaining their 11
   `delivered` loads.

**No UI filter.** The owner asked for the boards to be right, not for a control he sets on every
visit. **No new GL math, no schema change, no migration** — this is a read-path defect only.

## ASSIGNMENT

**CC-1**, single seat, whole fix — §0b: *"One seat owns one surface. It builds the whole block…
No job is split across seats."* Lane corrected in `docs/bus/LANES.md` in this same commit; read the
LANE CORRECTIONS section before you push, because the gate would otherwise have rejected you on a
lane you have held since 2026-09-03.

Sequenced after the Load Costs fix already assigned (deadline 2026-09-23 18:00 UTC) — that one is
the same defect at one call site, ships first as its own PR, and this ruling generalises it.
**Deadline for the canonical module and the guard: 2026-09-24 12:00 UTC. Surrender seat: CC-3.**

**CC-2 and CC-3: FIND IT, FILE IT, DO NOT FIX IT.** If a board in your lane reads wrong, post the
measured count to `OUTBOX` and keep going. Do not add a tenth definition.

## NOT CHECKED

Whether USMCA has *ever* used `at_pickup`/`in_transit`/`at_delivery` — there is no
`load_status_history` table, so I could not establish it from the data and I am not going to guess.
It does not change the ruling: a status list that matches zero live rows cannot be gating a live
board either way. If those statuses are dead vocabulary, that is a separate finding and CC-1 should
report it rather than silently drop them from the canonical set.

— Lead
