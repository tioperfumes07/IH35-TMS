# DESIGN BLOCK — evidence-driven revenue recognition (status↔stop coupling fix)

**Date:** 2026-08-01 · **Author:** Claude Coder · **Status:** DESIGN ONLY — **awaiting Jorge's approval
of the approach. Nothing built.** This changes office workflow, so it is not a coder's call.
Companion to `DISPATCH-STATUS-STOP-COUPLING-SCOPE-2026-08-01.md`. Live evidence read on prod
`br-fancy-credit-akjnd07a` this session.

---

## 1. UNVERIFIED item CLOSED — the Samsara worker is NOT the feeder

GUARD's hypothesis was: if the auto-status worker can advance a load to `delivered` /
`delivered_pending_docs` / `completed_docs_received` ungated and without reading `load_stops`, it is
the active feeder of the coupling defect. **Traced past `detector.service.ts:439`. The answer is NO —
it is bounded and cannot reach any recognition-relevant status.**

| Question | Answer | Evidence |
|---|---|---|
| Flag-gated at job level? | **No DB feature flag.** Opt-**out** env var, default **ON** | `jobs/auto-status-switch-worker.ts:84` — `if (process.env.ENABLE_AUTO_STATUS_SWITCH_WORKER === "false") return;` |
| Schedule | every 5 min, `America/Chicago` | `auto-status-switch-worker.ts:18-19` |
| Which statuses can it WRITE? | **only `in_transit` \| `at_delivery`** | `detector.service.ts:22` (`proposed_status`), `:420` (`newStatus` param), `:439` (the UPDATE) |
| Which loads does it SCAN? | **only `at_pickup` \| `in_transit`** | `detector.service.ts:582` |
| Can it reach `delivered` / `delivered_pending_docs` / `completed_docs_received`? | **NO** — not in the write union, not reachable from the scan window | same |
| Reads `load_stops` before writing status? | **No** — only for the pickup/delivery lat/lng | `detector.service.ts:210-224` |

**Live state:** `at_pickup` and `at_delivery` are **real** members of `mdata.load_status_enum`
(verified against `pg_enum` — 17 members; no phantom). GPS positions exist (**83**,
`n_live_tup` 83), but **0 loads are in the worker's scan window** and
`integrations.auto_status_switch_events` has **0 rows with `n_tup_ins = 0`** — **the worker has never
fired in production.**

**So:** it is a real instance of the decoupling *class* (it writes status from GPS without recording
arrival), but it is **not** the feeder of the recognition-gate defect, and it has never actually run.
**The office endpoint `PATCH /api/v1/dispatch/loads/:id/transition`
(`dispatch/loads.routes.ts:1282`) remains the only ungated path to the recognition-relevant
statuses.** Correcting the record: my earlier "compounds it" framing overstated the worker's role —
it cannot touch the recognition boundary.

*Secondary observation (not part of this block):* this worker is the only background writer of load
status gated by a **bare env var** rather than the standard DB feature flag, and it defaults ON.
Worth normalising for consistency; recorded, not proposed here.

---

## 2. The problem, stated once

Revenue recognition is currently **status-driven**, and status is **freely settable**. §18 Event 1
keys off `delivered` / `delivered_pending_docs`; the office endpoint sets those by validating only the
`allowedTransitions` graph, never reading `mdata.load_stops`. Live proof: **1 load sits at
`completed_docs_received` — the terminal billing status — with both stops `pending` and both
timestamps NULL.** If the latch were on today, that load would earn and bill line-haul revenue with
**zero evidence** that the truck ever arrived or departed anywhere.

That is the defect an auditor tests first: *"show me the delivery event behind this revenue."*

## 3. How the serious systems do it

- **NetSuite ARM** ties recognition to a **fulfillment record** — an event object — not to a status
  field. Event triggers from fulfillment/billing/project progress post the recognition entry and
  relieve deferred revenue. The evidence object *is* the trigger.
- **McLeod LoadMaster** treats **actual arrival and actual departure per stop as first-class stop
  events**, fed by telematics/mobile-comm, and can map tracking messages to stop arrival/departure
  events via user-defined rules. Arrival/departure live on the stop, not as a derived status.

*Honest limit on the citation:* I found clear evidence that McLeod captures arrival/departure as
first-class stop events, but **not** documentation that McLeod hard-blocks billing until they exist.
I am not claiming it does. The transferable principle from both is architectural: **recognition keys
off the captured event object, not off a mutable status field.**

## 4. Options

### Option A — Hard precondition (block the transition)
Office endpoint + worker refuse any delivery-implying transition unless the final active delivery
stop carries `actual_departure_at`.
- **Pro:** strongest integrity; status can never outrun evidence.
- **Con — decisive:** it strands real operations (dead phone, no signal in Mexico) and blocks
  dispatchers from closing loads. **That pressure produces fabricated times entered just to unblock
  billing** — converting a visible gap into invisible bad data. Worst possible audit outcome.

### Option B — Evidence-driven recognition (RECOMMENDED)
Decouple in the *other* direction. **The latch keys off `actual_departure_at` on the final active
delivery stop — never off status.** Status stays operationally free; revenue simply does not
recognize without the stop event. Add an **attributed manual-capture** path on the stop row
(who entered it, when, and from which document — e.g. the POD's own date) so ops can supply *real*
evidence rather than being blocked.
- **Pro:** revenue becomes unfakeable — the only way to earn is a real captured event. Nothing is
  removed from the office workflow (§7 additive). Mirrors NetSuite ARM's architecture. Loads without
  evidence sit visibly in an "earned-not-recognized" exception list instead of silently recognizing.
- **Con:** status and evidence can still disagree operationally; needs the exception report to be
  watched or unbilled work goes unnoticed. Mitigated by Option C.

### Option C — B plus an attributed soft warning
Option B, and the office endpoint additionally **records an attributed reason** when a
delivery-implying transition happens without stop evidence (not blocked, but never silent).
- **Pro:** preserves flow, creates the audit trail, drives capture discipline over time.
- **Con:** slightly more office UI work.

## 5. Recommendation

**Adopt Option B now; add Option C's attributed warning as phase 2.**

The reasoning that decides it: **a hard block (A) creates an incentive to enter fake timestamps, and
a fabricated delivery time is far more dangerous than an unrecognized load.** An unrecognized load is
a visible, correctable exception. A fabricated timestamp is a clean-looking lie sitting under a
revenue entry — exactly what the no-fake-data rule exists to prevent. Option B makes the honest state
the *easy* state: dispatch keeps moving, and revenue waits for evidence.

It also matches the CPA decision already locked (§5/§18): recognition = final active delivery-stop
completion / `actual_departure_at`. Option B is that sentence implemented literally.

## 6. Must-fix BEFORE `REVENUE_RECOGNITION_POST_ENABLED` may flip

1. **Multi-drop latch bug (folded in from the coupling scope).** `driver/loads.routes.ts:533`:
   ```ts
   const nextLoadStatus = stop.stop_type === "delivery" ? "delivered_pending_docs" : "in_transit";
   ```
   This latches on **any** delivery stop, not the **final active** one. On a multi-drop load the
   first delivery departure would earn the **entire** line-haul before the load is complete. Latent
   today (all 10 delivery stops are 1-per-load) — **must be closed before the flag flips**, or the
   latch inherits it. Fix = final active delivery stop by `sequence_number`, excluding
   cancelled/voided stops.
2. **Unbilled Revenue account seeded** for TRANSP + USMCA — flipping without it is a runtime 500.
   TRK excluded (`42000-LEASE`).
3. **Attributed manual-capture path exists** before any operator is asked to transcribe POD dates —
   otherwise the only way to comply is a synthetic write.
4. **A CI guard** asserting the latch reads the stop timestamp and **not** load status, so this
   cannot regress into status-driven recognition.

## 7. Standing constraints (unchanged)

- **`REVENUE_RECOGNITION_POST_ENABLED` stays OFF** — doubly gated (no Unbilled Revenue seed, no
  timestamp source).
- **No synthetic backfill.** Loads already past the gate stay **flagged and unrecognized** until real
  observed evidence is entered as an attributed manual correction. Owner/CPA call; **1 live load**
  affected today.
- **Do NOT mount `dispatch-view.routes.ts`** (404→500, and its screen is unrouted).
- **Do NOT mount the geofence watcher** (writes `geo.geofence_state_transitions`, no `load_stops`
  write — changes nothing here).

**Nothing in this document is built. Awaiting approval of the approach.**

### Sources
- [NetSuite revenue recognition under ASC 606 — Rand Group](https://www.randgroup.com/insights/oracle-netsuite/erp/netsuite-revenue-recognition-under-asc-606/)
- [Overcoming ASC 606 Revenue Recognition Hurdles — NetSuite](https://www.netsuite.com/portal/resource/articles/accounting/overcoming-asc-606-revenue-recognition-hurdles.shtml)
- [Workflow Integration with McLeod LoadMaster — Samsara](https://www.samsara.com/blog/mcleod-integration)
- [McLeod LoadMaster — Samsara marketplace](https://www.samsara.com/resources/marketplace/mcleod)
