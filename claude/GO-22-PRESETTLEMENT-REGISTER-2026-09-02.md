# GO-22 — PRE-SETTLEMENT · 2026-09-02

Owner: NB dispatch should assign a settlement number; remaining TR/SB (triangulation then south) loads for that truck should be **recommended** into that pre-settlement; **manual** still required for now; mixed Allways settlements remain. Linkage already built — do not invent a second model.

**Seat: CC-1 (money/API).** Recommend **UI** after API on main: **CC-3**. Cursor does not implement.

**Never POST Book Load.** Empty `driver_finance.driver_settlements` is expected. No seat-created settlements.

## VERIFIED (do not re-derive)

- `mdata.loads.trip_type` enum: NB / TR / SB.
- `mdata.loads.tour_id` — NB starts a tour; TR/SB join.
- `mdata.loads.presettlement_link_id` exists; book-load ~2264 **skips** it (`presettlement_query_not_yet_implemented`).
- `driver_finance.driver_settlements` empty all entities. Bookended service + `settlement_lines.load_id` exist.
- No settlement doc type in `lib.trace_counters`. Allocator uses `LOAD`; existing rows `LD`. **Do not invent a third.**
- Pattern to reuse: `driver_finance.trip_link_queue` (`suggested_load_id`, `suggested_reason`, `assigned_load_id`, `assigned_by`, `status`). Human confirms. Nothing auto-commits.

## ROWS

| ID | Work | Seat |
|----|------|------|
| **PS1** | Presettlement query service. On owner book (not seats): set `presettlement_link_id`. Remove the TODO skip. | CC-1 |
| **PS2** | Settlement **number** generator. One convention with `LD`/`LOAD`. Seed `display_id` / `trace_no`. | CC-1 |
| **PS3** | NB starts/opens pre-settlement + tour. | CC-1 |
| **PS4** | Recommend remaining tour loads (TR/SB) via trip_link_queue shape. Confirm, never silent auto-commit. | CC-1 API · CC-3 UI after |
| **PS5** | Manual add/remove loads on the open pre-settlement (now). | CC-1 API · CC-3 UI after |
| **PS6** | Do not rebuild `tour_id` / `trip_type` / bookended service / line `load_id`. | all |

**After GO-22 API on main:** CC-1 GO-20 tail A screen → **20** → F7334 remainder.
