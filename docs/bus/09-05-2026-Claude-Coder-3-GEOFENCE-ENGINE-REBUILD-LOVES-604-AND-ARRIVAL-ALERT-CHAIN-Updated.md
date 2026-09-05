# 09-05-2026 · CLAUDE CODER 3 · GEOFENCE ENGINE REBUILD — UPDATED (SEQUENCE WHILE MIGRATIONS ARE QUEUED)
Supersedes the ordering of SEQUENCE-STRICT steps 3.3–3.5 and prefaces
`09-05-2026-Claude-Coder-3-GEOFENCE-ENGINE-REBUILD-LOVES-604-AND-ARRIVAL-ALERT-CHAIN.md`, which
remains the full spec (§2 schema, §3 engine, §4 Loves, §5 Samsara, §6 alert chain, §7 proof).
USMCA only `5c854333-6ea5-4faa-af31-67cb272fef80`. FAST-MERGE. `git pull --ff-only origin main`.

## VERIFIED (owner, 2026-09-05 01:30 UTC)
#20411, #20412, #20418, #20420 merged. Your blocker is accepted as real and written: three migration
drafts queued for CC-1, `integrations.samsara_addresses` does not exist live. CC-1 is ordered to apply
them NOW as his STEP 0 (his lane is open 00–11 UTC); Cursor applies them under C.3 if CC-1 is silent
15 minutes. You do not idle while you wait. Live facts: `geo.geofences` = 2 USMCA rows (Mines Rd
`departed` since 2026-09-03 19:06:32 — dead 30+ hours while 14 units report; and the TEST CODEX
GO0040 row). `geo.geofence_state_transitions` last write 2026-09-03 19:06:32. 5,278 rows in the last
48h are the shared-column flap.

## THE ORDER — RESEQUENCED. The flap fix lands BEFORE any new geofence is projected.
Reason: every geofence added to the current engine multiplies the flap (16 trucks × one shared
`current_state`). Projecting Samsara's hundreds into `geo.geofences` before the fix would add
thousands of garbage transitions per tick. SEQUENCE 3.3 therefore moves behind 3.2b.

**3.2a — DONE.** Table drafted, handed. Post nothing more on it until CC-1's sha appears.

**3.2b — ENGINE REBUILD, CODE ONLY (no schema needed for a–d), start now:**
 a. `states.ts` — `VALID_TRANSITIONS.departed = ["idle","approaching"]`; `computeProposedState`
    returns `idle` from `departed` when distance > approach radius. Per-geofence radii read from
    the row with the spec defaults as fallback (approach 8047 m, arrive 402 m, depart 805 m,
    fuel-stop approach 3219 m). Unit test walks idle→approaching→at→dwelling→departing→departed→
    idle and asserts NO state is terminal.
 b. `engine.ts` — departure on SPEED: `at`/`dwelling` → `departing` requires speed ≥ 15 mph
    sustained 3 minutes of consecutive positions AND distance > exit radius. Hysteresis mandatory
    (enter 402 m, exit 805 m). Stamp `entered_at` + `odometer_at_entry_mi` on `at`, `departed_at` +
    `odometer_at_exit_mi` on `departed` — write these into `geo.geofence_vehicle_state` behind an
    `to_regclass()` check so the code is correct the second the table lands and refuses (logged,
    not thrown) while it does not.
 c. `geofence-state-watcher.ts` — USMCA only (TRANSP/TRK frozen); `fetchLatestPositions` returns
    `speed_mph`, `odometer_mi`, `captured_at`, `city`, `state`; positions older than 30 min are
    skipped and counted; a heartbeat line every tick so silent death is visible.
 d. `transitions.service.ts` — bounding-box prefilter before haversine; remove the dead
    `NULL::text AS vehicle_id/load_id/stop_id`; the silent `catch {}` logs `warn` with
    geofence_id, unit_id, from, to.
 e. DRAFT migration #4 (do not apply): `geo.geofence_vehicle_state` keyed
    `(operating_company_id, geofence_id, unit_id)` per spec §2.1; `geofence_state_transitions.
    is_superseded boolean NOT NULL DEFAULT false` + `superseded_reason text` (§3.5); `pwa.driver_prompts`
    (§2.3); `telematics.load_odometer_segments` (§2.4); the `geo.geofences` location_kind/source
    CHECK widening + center/radius/approach/requires_driver_response columns (§2.2). One file,
    idempotent, FORCED RLS, 0065 grants. Drop it in `docs/audit/migration-drafts/` and post ONE
    line to OUTBOX-CC-1 so it rides in his batch.
 f. Guard: `verify-geofence-state-machine-no-terminal-state` + `verify-geofence-departure-on-speed`,
    wired in verify-steps (you have a lane band problem — file it once to Cursor; put the guards in
    `scripts/verify-*.mjs` + `.guard-exempt.json` as you have been, so they run in verify:static).

**3.3 — Samsara import/projection service** — code now against the drafted schema; RUN only after
CC-1's tables are live AND 3.2b is merged. Import ALL addresses raw into `integrations.samsara_
addresses`; project to `mdata.locations` + `geo.geofences` with `source='samsara_import'`,
`external_source='samsara'`, `external_ref=<samsara id>`; polygons stay polygons; circles keep
center+radius and get the 16-vertex inscribed polygon. Live count: after Cursor's API deploy the
collector tick (`5 */12 * * *`) writes it — read it, do not guess; nobody outside the deployed
backend has the decrypt key. Field-shape assumption stays labelled UNVERIFIED in code until the
first live sample is stored — then fix the code to the real shape.
**3.4** match proximity AND name, never auto-merge on name; collision report to OUTBOX.
**3.5** three guards green → post `STEP-3.5 DONE` (this unblocks CC-1 1.11 and Cursor C.6).
**3.6** ACK the Book Load → Samsara push-back contract.
**3.7–3.9** telematics defects (dup `vehicle_latest_position`, NULL geocode, T144 silent).
**3.10–3.12** already substantially done — post the checkoff lines with shas.
**Then** spec §4 Loves 604 import (`--dry-run` default, `--apply` only after §7.2 proves the flap
dead), §5.1 load-wizard-creates-geofence, §6 the four-stage alert chain, §6.5 live-progress API.

## THE API CONTRACT CURSOR IS WAITING ON — publish shapes to OUTBOX-CC-3 as soon as they are fixed
`GET /api/v1/dispatch/live-progress`, `GET /api/v1/dispatch/loads/:loadId/live-progress`,
`GET /api/v1/pwa/driver/prompts/open`, `POST /api/v1/pwa/driver/prompts/:id/answer`,
`GET /api/v1/dispatch/prompts/unanswered` — fields per the Cursor spec §1; `prompt_kind` enum
`approaching_city | arrived_geofence | arrived_stop | departing_unreported | departed_city |
fuel_stop_arrival`; geofence `source` enum `manual | auto_dispatch | samsara_import | loves_import |
city_import`. Publish the shape the moment it is decided even before the endpoint is live, marked
"shape final, endpoint lands <sha>".

## DISPOSITION OF THE TEST ROW
`geo.geofences 350b9f03 'TEST CODEX GO0040'` in USMCA: set `is_active=false`, label it
`ARCHIVED TEST — never a real site`, never delete. Report which you did with the row.

## FORBIDDEN
Settlement writes; deleting geofences or transitions (mark superseded); importing Loves or projecting
Samsara before the flap fix is live; auto-merge on city name; applying migrations yourself; fabricating
a Samsara count or field shape. Checkoff line after every item to OUTBOX-CC-3. Never idle.
