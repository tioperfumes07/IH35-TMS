# Dispatch/linkage wave — revenue-recognition SOURCE gap: measured scoping

**Date:** 2026-08-01 · **Author:** Claude Coder · **Status:** SCOPING ONLY — nothing built, nothing
mounted, no writes. Every number below read live on prod `br-fancy-credit-akjnd07a`.

## Headline

The two-event latch has **no timestamp source at all** — not a degraded one, none. And the cause is
**not** what the register (my own earlier entry) implied.

Two of my prior claims were wrong and are corrected here:

| Earlier claim | Measured reality |
|---|---|
| "the dead geofence watcher means arrival timestamps never populate" | The geofence path **never writes `load_stops`**. Mounting the watcher would populate **nothing**. |
| "the driver arrive/depart route is not mounted" | It **IS** mounted and auth-gated. Live probe: **401**, not 404. |

---

## 1. Why 0 of 20 stops have arrival/departure timestamps

**The geofence watcher is dead — AND irrelevant to this gap.**

- `initializeGeofenceStateWatcher` is referenced by exactly **1 file: itself**. It is an in-process
  `setInterval` (not a cron), so it requires an explicit call that never happens.
- **But it would not help anyway.** Its `run()` calls `processGpsBatch` →
  `integrations/samsara/geofences/state-machine/transitions.service.ts`, which writes
  **`geo.geofence_state_transitions`**. In 168 lines it contains **no write to `mdata.load_stops`**.
- Live: `geo.geofence_state_transitions` = **0 rows**, consistent with never running.

So the causal chain "watcher dead → no arrival timestamps" **does not exist in code**. Mounting the
watcher is a separate (real) question about geofence state, not about revenue recognition.

**The actual writers of `actual_arrival_at` are two, both driver-PWA:**

| File | Line | Endpoint | Mounted? |
|---|---|---|---|
| `driver/loads.routes.ts` | 484 | `POST /api/v1/driver/loads/:id/stops/:stopId/arrive` | **YES — live probe 401** |
| `dispatch/driver-pwa/dispatch-view.routes.ts` | 330 | `/api/dispatch/driver-pwa/...` | **NO — live probe 404** |

Probe controls (so the method is trustworthy): `healthz` → 200; known-refused `dispatch-view` → 404.
A 401 therefore means mounted-and-auth-gated, not absent.

**Status advances WITHOUT the stop timestamps.** This is the decisive observation:

| Load status | Count |
|---|---|
| assigned_not_dispatched | 3 |
| booked | 2 |
| dispatched | 1 |
| in_transit | 1 |
| **delivered** | **1** |
| **completed_docs_received** | **1** |
| cancelled | 1 |

Two loads completed the journey — one reached `delivered`, one `completed_docs_received` — and
**their stops still have zero timestamps**. So this is not "no load has arrived yet." The load
lifecycle and the stop-timestamp capture are **decoupled**: status can reach `delivered` without
`arrive`/`depart` ever being called.

**Verdict for item 1:** the backend write path works. The gap is that the endpoint is never invoked —
an ADOPTION/CLIENT-WIRING gap, not a backend code defect. See item 2 for why that is plausible.

---

## 2. The driver-PWA arrival/departure write path

There are **two parallel driver-PWA surfaces**, and only one of them can write:

**A. Works.** `pages/StopAction.tsx` imports `markStopArrived` / `markStopDeparted` from
`api/loads.ts`, which POST to `/api/v1/driver/loads/:id/stops/:stopId/{arrive,depart}` — the
**mounted** routes (401). This path is complete: route mounted, columns wired
(`SET actual_arrival_at = now()`), client caller present.

**B. Cannot write.** `screens/DispatchView.tsx` + `components/dispatch/{Delivery,Pickup}Card.tsx` use
`lib/dispatch-api-client.ts`, whose departure call targets
`/api/dispatch/driver-pwa/load/:id/stops/:stopId/departure` — the **refused-mount** route (404).

**The exact blocker for path B** is recorded in the refused-mount registry
(`scripts/verify-route-manifest-parity.mjs`): *"References a non-existent evidence table … Mounting it
turns a 404 into a 500 on the driver PWA. Fix the schema reference first."* So B is blocked behind a
**phantom-schema fix**, and mounting it today would make it worse (404 → 500), not better.

The dispatch cards only **display** `actual_arrival_at`; they do not write it. The office-side
`LoadDetailGeofenceTimelineTab.tsx:206` shows an honest empty state — *"No arrival/departure
timestamps yet — timeline will populate as the load progresses."* Nothing is faking data.

**Verdict for item 2:** path A is fully wired and reachable. Path B is blocked on a named
phantom-schema prerequisite. **UNVERIFIED:** whether drivers are actually routed to StopAction (path
A) in practice, or land on DispatchView (path B) and hit the dead write — that needs a driver-session
walkthrough on the PWA, which I have not done.

---

## 3. Canonical table for the delivery event + what the latch needs

**Canonical location — `mdata.load_stops`:**

| Column | Purpose |
|---|---|
| `actual_arrival_at` | arrival at a stop — **0 of 20 populated** |
| `actual_departure_at` | **the §18 recognition source** — **0 of 20 populated** |
| `scheduled_arrival_at` / `scheduled_departure_at` | plan, not actual |
| `appointment_start_at` / `appointment_end_at` | appointment window |

**There is NO load-level fallback.** `mdata.loads` has no `delivered_at` column — the only
delivery-ish columns are `predicted_delivery_date`, `late_delivery_reason`,
`late_delivery_risk_y_n`, `late_delivery_est_deduction_cents`, `quicksave_completed_at`. None is an
actual delivery timestamp.

This matters against blueprint §18, which permits a load-level `delivered_at` **only** if it is
proven to derive from the final-active-delivery-stop event. **That option does not exist here** — the
column is absent, so the stop row is the only possible source, and it is empty.

**Both-way linkage** is intact structurally: `mdata.load_stops.load_id` → `mdata.loads.id`, and
delivery stops are identifiable via `stop_type = 'delivery'` (10 of the 20 stops). So once a
timestamp exists, the join to the load is available.

**What the two-event latch needs (§18):**

1. **Event 1 — earn at delivery.** Requires the final active delivery stop's completion
   (`actual_departure_at`, or `actual_arrival_at` if the owner defines arrival as the trigger). Today
   that value is NULL for every delivery stop, including the load already at `delivered`. → DR
   Unbilled Revenue / CR Line-Haul Income cannot fire from data.
2. **Event 2 — bill at POD** (`completed_docs_received`) → DR A/R / CR Unbilled Revenue. One load is
   already in that status, so event 2's trigger exists while event 1's source does not — the latch
   would be asked to bill revenue it never earned.
3. **Hard prerequisite unchanged:** an Unbilled Revenue account must be seeded for TRANSP + USMCA
   before `REVENUE_RECOGNITION_POST_ENABLED` may flip; flipping without it is a runtime 500.

---

## The decision Jorge has to make (nothing is built pending this)

The gap is **not** "write more code." It is a definition + adoption question:

- **(a) Which event is the recognition trigger** — final delivery stop `actual_departure_at`, or
  `actual_arrival_at`? §18 says departure/completion; the code writes both.
- **(b) Why is the capture not happening** — are drivers reaching StopAction (path A, works) at all?
  If they live in DispatchView (path B), the fix is the phantom-schema prerequisite, not new code.
- **(c) What to do about loads that already reached `delivered` with no stop timestamp.** Backfilling
  a recognition timestamp that was never observed is inventing evidence; leaving it means those loads
  can never earn through the latch. This is an owner/CPA call, not a coder's.

**Not recommended without (a)–(c):** mounting `dispatch-view.routes.ts` (turns 404 into 500), and
mounting the geofence watcher **as a fix for this gap** (it writes geofence state, not load_stops —
it would change nothing here).

## Method note

Three conclusions in this document reversed a grep-based reading after a live check: the geofence→
load_stops chain (does not exist), the driver route mount status (401, not absent — my `grep index.ts`
missed the `driver/index.ts` aggregator), and `dispatch-view` being an "orphan" (it is a recorded,
reasoned refusal). Live probes with controls, and `information_schema`, were the arbiters.
