# DB-7 — Dispatch Planners Performance Profile (MEASURED, profile-first)

**Date:** 2026-06-28 (CDT, Laredo)
**Surface:** Dispatch Planners (`/dispatch/planners/*`)
**Method:** Live authed capture against production (`app.ih35dispatch.com` → `api.ih35dispatch.com`),
Owner session, headless Chromium attaching the real session state. Per-request duration measured as
`requestfinished − request` wall time; navigation wall measured to `networkidle` + 3s settle.
**Status:** Evidence only — committed BEFORE any fix, per the DB-7 STEP 0 mandate.

---

## 1. Measured results (production, this capture)

| Tab | Nav wall | API calls | `planner/week` calls | Slowest `planner/week` |
|-----|---------:|----------:|---------------------:|-----------------------:|
| **timeline** (default) | **13,117 ms** | 18 | **5×** | **8,690 ms** |
| **loads** | **12,624 ms** | 17 | **5×** | **8,723 ms** |
| driver | 3,687 ms | 12 | 0 | — (uses `safety/scheduler/grid`) |
| truck | 4,229 ms | 12 | 0 | — (uses `units-without-load` + `mdata/units`) |

The slow tabs are **timeline** and **loads**. Both are dominated by `GET /api/v1/dispatch/planner/week`.

### `planner/week` detail (timeline tab)
Five calls, one per consecutive week (a 5-week horizon fetched as 5 separate XHRs):

```
week_start=2026-06-28   8690 ms  [200]
week_start=2026-07-05   8689 ms  [200]
week_start=2026-07-12   8689 ms  [200]
week_start=2026-07-19   8688 ms  [200]
week_start=2026-07-26   8433 ms  [200]
```

The five run concurrently, so wall ≈ one call (~8.7 s) + render. **A single `planner/week` call costs ~8.7 seconds.**
Every other XHR on the page is < 350 ms (e.g. `notifications?limit=20` = 332 ms). The planner endpoint is
the entire problem.

---

## 2. Root cause — N+1 in `getPlannerWeek`

`apps/backend/src/dispatch/planner.service.ts` → `getPlannerWeek()` (lines ~172–184):

```ts
const drivers: PlannerDriverRow[] = [];
for (const row of driversRes.rows) {
  const driverId = String(row.id);
  const clocks    = await getCurrentClocks(client, operatingCompanyId, driverId);                    // 1 query / driver
  const blackouts = await listDriverBlackouts(client, operatingCompanyId, driverId, weekStartIso, weekEndIso); // 1 query / driver
  drivers.push({ id: driverId, name: row.name, unit_number: row.unit_number, hos_status: clocks.status, blackouts });
}
```

For **N** active TRANSP drivers this issues **2 × N sequential** round-trips (one `getCurrentClocks`
over `hos.duty_status_events`, one `listDriverBlackouts`), each waiting on the previous. With the
current active roster (~tens of drivers) that is ~70–80 serial queries per `planner/week` call →
the measured ~8.7 s. The two upfront queries (`drivers`, `loads`) are single set-based queries and
are not the bottleneck.

**Note:** only `clocks.status` is consumed from `getCurrentClocks` — the full clock computation is
fetched per driver but discarded except for one field.

### Secondary factor (not the bottleneck)
The timeline/loads tabs fetch a 5-week horizon as **5 separate `planner/week` XHRs**. Because they
run in parallel the wall cost is ~1× a single call, so fixing the per-call N+1 fixes the page. A
future optional improvement is a single range endpoint (5 calls → 1), but that changes the response
shape and is out of scope for the identical-output Phase 1.

---

## 3. Planned fix

### Phase 1 (separate PR) — eliminate the N+1, result set IDENTICAL
Replace the per-driver loop with **two set-based batch queries** over the full driver id list:
1. one query returning each driver's current HOS `status` (batched equivalent of `getCurrentClocks(...).status`), and
2. one query returning all blackouts in `[weekStart, weekEnd)` for all drivers, grouped by `driver_id`
   (batched equivalent of `listDriverBlackouts`).

Assemble `drivers[]` in memory from the two batched results — same fields, same order
(`ORDER BY last_name, first_name`), same values as today.

**Expectation:** each `planner/week` drops from ~8.7 s to sub-second; timeline/loads wall from ~13 s
to low single digits.

**Guard (Phase 1):** a same-shape test asserting the batched output equals the per-driver output for a
fixture roster, plus a query-count assertion that `getPlannerWeek` issues a **constant** number of
queries regardless of driver count (no growth with N).

### Phase 2 (separate PR, only after Phase 1) — layout
Per-driver **Book** into its own column + tasks-style layout, **additive** on the locked board,
verify-first against the approved screen. Guard: structural render test.

---

## 4. Reproduction

```
# authed live capture (Owner session)
node scratchpad/db7-profile2.cjs   # navigates /dispatch/planners/{timeline,loads}, prints per-XHR ms
```

Endpoint under test: `GET /api/v1/dispatch/planner/week?operating_company_id=<TRANSP>&week_start=<YYYY-MM-DD>`
backed by `getPlannerWeek` in `apps/backend/src/dispatch/planner.service.ts`.
