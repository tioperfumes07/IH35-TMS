# DISP/MAINT surface sweep — blocked on DATA, not on effort

**Run:** 2026-07-31, against `origin/main` `3733dcf0a1` (= prod deploy sha `3733dcf`).
**Scope:** `docs/module-completion/dispatch.json` (0 of 37) + `maintenance.json` (0 of 39).
**Status:** NOT closed. No item flipped to PASS. This file records why, with live evidence.

Every number below was read on the Neon prod branch `br-fancy-credit-akjnd07a` as `ih35_app`,
with `SELECT set_config('app.bypass_rls','lucia',true)` issued as **its own statement**, and
exact `count(*)` (never `n_live_tup` — see §3).

---

## 1. The route inventory is correct and complete

`apps/frontend/src/routes/manifest.tsx` declares exactly **37** `/dispatch*` routes and exactly
**39** `/maintenance*` routes — 1:1 with the two manifests. M is honest.

Those 76 route strings collapse to **52 distinct page components** (27 dispatch, 25 maintenance).
Most of "39 maintenance surfaces" is one tabbed page (`MaintenanceHome.tsx`) reached by 28 routes
via the local `MaintenanceTabRoute` wrapper.

**No placeholders. No dead ends at the routing layer.** Three dispatch routes are deliberate
redirects (`/dispatch/incidents` → `/dispatch/alerts`, `/dispatch/factoring-packets` →
`/accounting/factoring`, `/dispatch/planners` → `/dispatch/planners/timeline`).

Four pages that first read as "fetches nothing" are **false positives** — thin shells delegating to
a child that fetches: `LoadBankingLinkagePage`→`LinkedBankTransactionsPanel`,
`DriverPlanner`→`SafetyDriverSchedulerGrid`, `WorkOrderNewPage`→`CreateWorkOrderModal`,
`/maintenance/position-history` (resolved through a barrel `index.ts`). None is a defect.

## 2. The blocker: the operational tables are empty on prod

A click-through cannot prove "renders real entity-scoped data" against tables with no rows. An
empty screen here is the **correct** render, so flipping these to PASS would assert something the
data cannot support, and flipping them to FAIL would be equally false.

**Maintenance** — exact counts, all entities:

| table | rows |
|---|---:|
| `maintenance.work_orders` | **2** (both TRANSP: 1 open, 1 in_progress) |
| `maintenance.work_order_lines` | **0** ← work orders with no lines |
| `maintenance.pm_schedules` | 30 rows / **0 active** |
| `maintenance.parts_inventory` | 144 |
| defects · inspections · dvir_submissions · driver_reports · road_service_tickets | **0** |
| tire_records · tire_events · tire_tread_measurements · tire_projections · tire_brands | **0** |
| brake_wear_measurements · brake_projections | **0** |
| warranty_claims · pm_alerts · position_history · internal_labor_log · wo_time_entries | **0** |

**Dispatch** — exact counts, all entities:

| table | rows |
|---|---:|
| `mdata.loads` | **10** (all TRANSP; TRK 0, USMCA 0) |
| `dispatch.border_crossing_events` | 5 |
| `dispatch.load_cancellations` | 1 |
| load_assignment_history · detention_events/requests/evidence · intransit_issues | **0** |
| equipment_transfer_requests · ocr_intake_queue · pod_documents · driver_layovers | **0** |
| customer_notify_preferences · load_eta_predictions · load_templates · stop_arrivals | **0** |
| `geo.geofences` · `geo.geofence_events` · `geo.geofence_state_transitions` | **0** |

`telematics.vehicle_locations` = 406,529 — live GPS **is** flowing. The gap is operational
records, not telemetry.

## 3. Method correction — `n_live_tup` is an ESTIMATE, and a bypass can be defeated

Two traps hit in this run. Both are recorded so the next agent does not repeat them.

**(a) `n_live_tup` is not a count.** It is a planner statistic and drifts from reality in both
directions. It must be used only as a *discriminator* (nonzero ⇒ the table is not empty), never as
a figure. Every number above is an exact `count(*)`.

**(b) `app.bypass_rls='lucia'` does NOT widen scope on every table.** The canonical §2 pattern is

```
identity.is_lucia_bypass() OR (operating_company_id = NULLIF(current_setting('app.operating_company_id',true),'')::uuid)
```

but `dispatch.load_id_reservations` (both policies) instead reads

```
(operating_company_id = ...::uuid) AND (role = ANY(...) OR identity.is_lucia_bypass())
```

The entity predicate is **mandatory** — bypass only satisfies the *role* half. With the GUC unset
the table reads **0**; with it set to TRANSP it reads **2,275**. That is a false zero produced by
the very technique used to defeat false zeros.

**Do not treat this as a table count.** A text scan for policies containing both
`operating_company_id` and `AND` flags 63 tables, but that heuristic **over-flags**: `mdata.loads`
matches it and its bypass *does* widen (verified: 10 with bypass alone). Of 16 tables tested
empirically, **only `dispatch.load_id_reservations` actually exhibits the defect.** The real
population is UNVERIFIED and needs the empirical test per table:
compare `count(*)` with bypass-only against bypass + each entity GUC.

## 4. Findings worth their own blocks

**(a) PM auto-engine runs constantly and produces nothing.**
`maintenance.pm_auto_wo_log` = **41,070** rows and `maintenance.pm_schedule_runs` = **3,554**,
against **0 active** `pm_schedules`, **0** `pm_alerts` and **2** work orders. The job is executing
at scale and emitting no output. Green logs, growing tables, zero result — this is exactly the
class of failure that looks healthy. Root cause not yet established; not guessed here.

**(b) Load-ID reservation churn.** TRANSP holds 2,275 reservations against 10 loads:
2,160 `expired`, 110 `cancelled`, **5 `consumed`**. Bursts of 423 and 317 on 2026-07-04/05 are
machine traffic, not booking. Expiry is being marked correctly, so this is not corruption — but
whether the burned `reserved_load_number` values leave gaps in the customer-visible load sequence
is UNVERIFIED and matters for an auditor reading a numbered series.

**(c) TRK and USMCA have zero dispatch and zero maintenance operational data.** Any per-entity
click-through on those two entities can only ever confirm empty states.

## 5. What would actually close these 76 items

Only one of these is real work; the rest is a decision.

1. **Real operating data** for dispatch/maintenance (the same dependency as the PM-schedule upload
   the owner already owes), or
2. **Re-scope the acceptance bar** from "renders real data" to "renders, is entity-scoped, and
   shows an honest empty state" — which IS provable today, on all three entities, and is the bar
   McLeod/Alvys actually hold an unseeded module to.

Recommendation: **(2) for the 76 items, (1) tracked separately as a data dependency.** Rewriting 76
acceptance strings to a bar the system can meet is not lowering the standard — the current string
cannot be satisfied by any amount of clicking, which is why the module has sat at 0 of 37 / 0 of 39
since the baseline was created on 2026-07-29.

## 6. Not claimed here

- No manifest item was flipped. `dispatch` stays **0 of 37**, `maintenance` stays **0 of 39**.
- Six dispatch surfaces were exercised live in the browser before that lane was handed to the
  parallel audit; those reads are treated as **provisional** and are not cited as evidence,
  because a second automation was driving the same Chrome and request attribution cannot be proven.
- No fix was applied to `dispatch.load_id_reservations`. Its policy is *more* restrictive than
  canonical, not less, so it is not a security hole — it is an auditability hole, and changing an
  RLS policy is a migration (financial-cluster gate, §1.4).
