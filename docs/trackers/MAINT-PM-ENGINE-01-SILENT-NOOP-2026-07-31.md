# MAINT-PM-ENGINE-01 — the PM auto-engine has reported success 3,554 times and created nothing

**Found:** 2026-07-31, spun out of the dispatch/maintenance surface sweep (owner-assigned own block).
**Status:** OPEN. Root cause **VERIFIED on prod**, not inferred. No fix applied yet.
**Severity:** the PM program is the mechanism that keeps trucks DOT-compliant. It has never run on a
real truck.

## The numbers (Neon prod `br-fancy-credit-akjnd07a`, bypass as its own statement, exact counts)

| fact | value |
|---|---:|
| `maintenance.pm_schedule_runs` | **3,554** — every one `status='completed'`, `error_message` NULL |
| `sum(schedules_evaluated)` | **41,070** |
| `sum(work_orders_created)` | **0** |
| `sum(alerts_created)` | **0** |
| `maintenance.pm_auto_wo_log` rows | **41,070** |
| …with `action='skipped_no_odometer'` | **41,070 — 100%, zero exceptions** |
| window | 2026-06-04 → 2026-07-31, continuous, still running today |

## Root cause — two distinct defects, verified

### (1) No real truck has ever had a PM schedule

The 30 rows in `maintenance.pm_schedules` point at only **5 distinct units**, and every one is
demo/test data:

| unit_number | status | deactivated | in `vehicle_latest_position`? | odometer? |
|---|---|---|---|---|
| `DEMO-104` | Sold | yes | **no** | no |
| `TEST-TRUCK-1` | InService | yes | **no** | no |
| (3 more, same shape) | | | **no** | no |

`SELECT count(*) FILTER (WHERE vlp.unit_id IS NOT NULL)` over
`pm_schedules ⋈ telematics.vehicle_latest_position` = **0 of 30**.

So this is **not** "the schedules lost their odometer." Those units were never in the telemetry feed
at all. The PM program has only ever pointed at fixtures. DATA-01 then deactivated all 30, so today
**active PM schedules = 0 against 122 live assets** — but the honest statement is stronger than
"zero today": **it was never non-zero in any real sense.**

### (2) The engine reports a clean success while doing nothing — the actual code defect

`apps/backend/src/maintenance/pm-auto-engine.service.ts` reads odometer from
`telematics.vehicle_latest_position` (a VIEW), correctly:

```sql
WHERE operating_company_id = $1::uuid AND unit_id = ANY($2::uuid[]) AND odometer_mi IS NOT NULL
```

When a unit has no odometer it logs `action='skipped_no_odometer'` and moves on — which is right.
What is wrong is what happens **at the run level**: the run is then written as
`status='completed'`, `error_message=NULL`, `work_orders_created=0`, `alerts_created=0`.

**A run in which 100% of the evaluated workload was skipped for a missing prerequisite is not a
success.** It is indistinguishable, in every operator-visible surface, from a run that had nothing
to do. That is how this survived 3,554 executions across two months without anyone noticing.

The odometer data the engine needs **does exist** — `telematics.vehicle_latest_position` holds 81
rows for TRANSP, **28 with `odometer_mi`**. The engine would work today if a schedule pointed at a
real unit. Nothing about the odometer plumbing is broken.

Note the code comment at `pm-auto-engine.service.ts:229-231`: PR **#1289** already fixed a
"every unit skipped as no odometer" bug once, by adding the `vehicle_latest_position` primary read.
That fix is present and correct. It did not surface this, because the failure was never in the read
— it was in the schedules' targets and in the run being reported green.

## Fix (proposed — not applied; needs a lane assignment)

1. **Run-level honesty (the code fix, non-financial, maintenance lane).** When
   `schedules_evaluated > 0` and `work_orders_created + alerts_created = 0` **and** every log row
   for the run is a `skipped_*` action, the run must NOT be recorded `completed` with a NULL error.
   It should carry a distinct terminal state (e.g. `completed_no_effect`) plus an operator-visible
   alert naming the prerequisite that was missing and the unit count affected.
2. **Zero-workload honesty.** With 0 active schedules the engine now evaluates nothing and still
   writes `completed`. A cron whose entire domain is empty must say so — "0 active PM schedules
   across 122 live assets" is a finding, not a quiet no-op.
3. **A guard that asserts the defect.** It must fail on a run row with
   `schedules_evaluated > 0 AND work_orders_created = 0 AND alerts_created = 0 AND status='completed'
   AND error_message IS NULL`. A guard that only checks the engine "runs" would have stayed green
   through all 3,554 of these.
4. **Real schedules** — depends on the owner's last-PM upload. Tracked as **DISP-MAINT-DATA-01**,
   NOT as a blocker on items 1-3. Fixes 1-3 are worth shipping before the data arrives, because they
   are what will tell us if the data is wrong when it does.

## Not claimed here

- No fix is applied. No migration is proposed yet (the terminal-state change may need one — the
  `status` column's allowed values are UNVERIFIED and must be read before any DDL is written).
- Whether the same silent-success shape exists in other cron jobs is **UNVERIFIED**. It should be
  swept, but no claim is made about it here.
