# Dispatch — status↔stop-capture DECOUPLING: measured scope + PWA walkthrough result

**Date:** 2026-08-01 · **Author:** Claude Coder · **Status:** SCOPING ONLY — nothing built, nothing
mounted, no writes, no migration. Follow-up to `DISPATCH-LINKAGE-REVENUE-SOURCE-SCOPING-2026-08-01.md`
(merged `55efb6acd`). Every number read live on prod `br-fancy-credit-akjnd07a` this session.

## 0. Two corrections to the predecessor doc — read these first

**(a) The recognition trigger was never open.** The predecessor framed "departure vs arrival" as an
owner decision. It is **not** — it is already locked by the CPA decision (§5 / blueprint §18):
recognition = **final active delivery-stop completion / `actual_departure_at`**. Arrival stays
captured for ops and is **not** the trigger. Only the already-`delivered`-without-evidence question
is a real owner call. Corrected here; the predecessor's decision (a) is withdrawn.

**(b) My load-status distribution counted soft-deleted loads.** The predecessor reported 10 loads
including one `delivered` and one `in_transit`. Re-read with the soft-delete split, **7 of those 10
are `soft_deleted_at IS NOT NULL`** — including the `delivered` load and the `in_transit` load I
cited as decisive. Corrected numbers:

| Scope | Loads | Stops | with arrival | with departure |
|---|---|---|---|---|
| **Live (`soft_deleted_at IS NULL`)** | **3** | 6 | **0** | **0** |
| Soft-deleted | 7 | 14 | 0 | 0 |
| **All rows** | **10** | **20** | **0** | **0** |

Live load statuses are only: `assigned_not_dispatched` 1, `cancelled` 1, **`completed_docs_received` 1**.

**The gap conclusion survives, and the evidence is actually stronger.** The predecessor's headline
number is exact — **20 stop rows, 0 arrival, 0 departure; 10 delivery stops, 0 with departure.** And
the decisive example is no longer a soft-deleted `delivered` row but a **live load sitting at
`completed_docs_received`** — §18 Event 2's own trigger, the terminal billing status — **with both of
its stops still `pending` and both timestamps NULL.** A load reached the POD/billing state having
never recorded that it arrived or departed anywhere.

*Method note:* the first read returned 3 loads against `n_live_tup` = 10 and I treated it as a
possible RLS false-zero. It was not — `count(*)` without the soft-delete filter returns exactly 10,
matching `n_live_tup`, and `mdata.loads` carries a correct `identity.is_lucia_bypass()` branch in
`loads_select_office`. The discriminator did its job: it caught that **my filter**, not RLS, was the
difference.

---

## 1. The decoupling defect — every writer of `mdata.loads.status`

There are four code paths that write load status. **Only one derives it from a stop event.**

| # | Path | Writes the stop timestamp? | Status derived from stop capture? | Reachable today |
|---|---|---|---|---|
| 1 | `driver/loads.routes.ts:484` (arrive) / `:545` (depart) | **YES** — same transaction | **YES — the correct pattern** | **YES** (401 = mounted + auth-gated) |
| 2 | `dispatch/loads.routes.ts:1282` — `PATCH /api/v1/dispatch/loads/:id/transition` | NO | **NO** | **YES** — office UI |
| 3 | `integrations/samsara/auto-status-switch/detector.service.ts:439` | NO | **NO** — GPS proximity only | **YES** — worker runs at startup |
| 4 | `dispatch/driver-pwa/dispatch-view.routes.ts:337` / `:403` | NO | NO | **NO** — refused mount (404) |

**Path 1 is the model to copy.** Both handlers write the stop row and the load row in one
transaction, and the status is a *consequence* of the stop event:

```sql
UPDATE mdata.load_stops SET actual_departure_at = now(), status = 'departed' WHERE id = $1;
UPDATE mdata.loads      SET status = $2 WHERE id = $1;   -- nextLoadStatus, derived
```

**Path 2 is the decoupling.** The office transition endpoint validates **only** the status graph
(`allowedTransitions`, `dispatch/loads.routes.ts:400-411`) — `in_transit → delivered_pending_docs` is
permitted purely because the graph allows that edge. The handler **never reads `mdata.load_stops`**.
So an office user can move a load to the POD/billing state with every stop still `pending` and every
timestamp NULL. That is exactly the live `completed_docs_received` row above.

**Path 3 compounds it.** `initializeAutoStatusSwitchWorker` **is** initialized at startup
(`index.ts:1379` logs success) — this one is live, unlike the geofence watcher. It reads
`mdata.load_stops` **only to fetch the first pickup's and last delivery's lat/lng**
(`detector.service.ts:210-224`) and then writes `mdata.loads.status` alone. It advances status from
GPS proximity while never recording that the truck arrived. Two notes worth owner attention: it
writes only `in_transit` / `at_delivery` (so it did **not** produce the delivered/POD rows), and
grepping `detector.service.ts` for `isEnabled` / `_ENABLED` returns **nothing** — I found **no feature
flag gate inside the detector itself**. Whether the worker is gated at the job level is
**UNVERIFIED** — I did not trace `auto-status-switch-worker.ts` past its flag grep, which returned
only unrelated `issues_flagged` counters.

### The shape of the fix (NOT built — scope only)
Status must be **derived from** the stop-capture event, not independently settable. The minimal
correct change is a precondition on path 2: refuse `→ delivered_pending_docs` unless the final active
delivery stop carries `actual_departure_at`, with an explicit **attributed manual-capture** path for
the legitimate case (driver's phone dead, offline in Mexico) that records *who* asserted the time and
*from what evidence* — never a silent `now()`. That keeps the graph honest without stranding
operations. **Building this requires the owner ruling in §3 first**, because it decides what happens
to loads already past the gate.

### A §18 precision gap in the correct path (latent, worth naming now that the trigger is locked)
`driver/loads.routes.ts:533` derives the next status as:

```ts
const nextLoadStatus = stop.stop_type === "delivery" ? "delivered_pending_docs" : "in_transit";
```

That is **any** delivery stop, not the **final active** delivery stop the CPA decision specifies. On a
multi-drop load the **first** delivery departure would latch Event 1 early and earn the whole
line-haul before the load is actually complete. Live data does not trigger it today — all 10 delivery
stops are 1-per-load — so this is **latent, not active**. It must be closed before
`REVENUE_RECOGNITION_POST_ENABLED` flips, or the latch inherits it.

---

## 2. The PWA walkthrough — ANSWERED, and no driver login was needed

The question was: are drivers on `StopAction.tsx` (path A, writes) or living in `DispatchView`
(path B, dead write)? **The answer is structural, so no session probe was required — and it is
stronger than a session probe would have been.**

**`DispatchViewScreen` is not routed at all.** `apps/driver-pwa/src/App.tsx` contains **zero**
occurrences of `DispatchViewScreen` — it is neither imported nor given a `<Route>`. The only
references anywhere are its own file, its test, and the card components' type imports. **Drivers
cannot reach path B**, so path B is not competing with path A for driver attention: it is dead code
behind a dead route calling a refused-mount endpoint.

`StopActionPage` **is** imported (`App.tsx:30`) and routed (`App.tsx:161`) behind `ProtectedRoute`,
and it calls `markStopArrived` / `markStopDeparted` → the mounted 401 routes. **Path A is the only
reachable capture path.** So the gap is not "drivers are in the wrong screen" — it is that the
reachable screen's capture actions are not being used, which is an adoption/training question plus
the path-2 hole that lets the office skip them entirely.

### A red test nobody can see (separate finding)
`apps/driver-pwa/src/screens/__tests__/dispatch-view.test.ts` asserts the opposite of reality:

```ts
expect(app).toContain('path="/dispatch/:load_uuid"');
expect(app).toContain("DispatchViewScreen");
```

Run on `main` today: **2 of its 4 tests FAIL** (the route assertion, and `PickupCard` missing
`"Upload doc"`). It has presumably been red since the route was removed or never added.

**It is invisible because driver-PWA tests do not run in CI.** Grepping `.github/workflows/` for
`driver-pwa` returns only `load-test-nightly.yml` (a k6 load script). There is **no workflow that runs
`apps/driver-pwa` vitest**. So the whole driver-PWA suite — the app our drivers actually use — has no
CI gate. That is a coverage hole worth its own block; I am recording it, not fixing it here.

---

## 3. The one real owner decision: loads already past the gate

**NO SYNTHETIC BACKFILL.** Writing `now()` or any invented timestamp onto the live
`completed_docs_received` load would be inventing evidence — it fabricates an observation that never
happened, on the exact record an auditor would test first. Those loads stay **FLAGGED and
UNRECOGNIZED** until a human supplies real evidence.

The only legitimate source is **real observed evidence** — e.g. the POD document's own date —
transcribed by an operator as an **attributed manual correction** (who entered it, when, from which
document), owner-entered and never auto-generated.

**Owner/CPA confirms:** transcribe POD dates for the affected load(s), or leave them flagged and
unrecognized. Today that is **1 live load**, so the cost of choosing correctly is very low right now —
which is the best possible moment to set the precedent.

## 4. Standing constraints reaffirmed (unchanged)

- **`REVENUE_RECOGNITION_POST_ENABLED` stays OFF.** It is **doubly gated**: no Unbilled Revenue
  account seeded for TRANSP/USMCA, and no timestamp source. Either alone blocks it.
- **Do NOT mount `dispatch-view.routes.ts`** — turns a 404 into a 500 behind a named phantom-schema
  prerequisite, and its screen is unrouted anyway.
- **Do NOT mount the geofence watcher** as a fix for this — it writes `geo.geofence_state_transitions`
  and contains no `mdata.load_stops` write; it would change nothing here.
- **TRK excluded** from revenue recognition (`42000-LEASE`).
