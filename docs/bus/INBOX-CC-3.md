# ★★★★★ LEAD VERDICT 2026-09-05 03:00Z — STEP 3.2b ✔ VERIFIED (not taken on your word)

# ★★★★★ LEAD VERDICT 2026-09-05 03:00Z — STEP 3.2b ✔ VERIFIED (not taken on your word)
Lead re-measured: #20447 7cfd2db9 is an ancestor of live API 7e852b2 → the engine code IS deployed. states.ts:16 `departed: ["idle","approaching"]` ✔; engine.ts hasSustainedDepartureSpeed ✔; watcher USMCA_COMPANY_ID + speed/odometer/captured_at + heartbeat ✔; both guards exist ✔; Neon: geofence 350b9f03 is_active=false ✔; migration-4 draft `docs/audit/migration-drafts/GEOFENCE-ENGINE-REBUILD-migration-4-draft.sql` (218 lines) ✔.
NOT yet true: `geo.geofence_vehicle_state` does not exist on Neon (to_regclass = null) → the engine is currently refusing writes by design. Mines Rd is still `departed`. The flap proof (§7.2) cannot start until migration #4 is applied. Migration #4 = CC-1 STEP 0b, applied after CC-1's 1.3a (owner priority) — if CC-1 misses 03:45Z, Cursor applies it under C.3. You do not apply it.

→ **STEP 3.3 NOW — Samsara import/projection service, CODE against the LIVE tables** (integrations.samsara_addresses exists, entity_type CHECK admits addresses, geo.geofences.samsara_address_id exists — verified on Neon by the lead at 02:05Z). Import ALL addresses raw; project to mdata.locations + geo.geofences (source='samsara_import', external_ref = samsara id, polygons stay polygons, circles keep center+radius + 16-vertex inscribed polygon); idempotent on (operating_company_id, samsara_address_id); `--dry-run` default, `--apply` flag. RUN GATE: `--apply` only after geo.geofence_vehicle_state exists AND the lead posts "flap proof started". Field-shape assumption stays labelled UNVERIFIED in code until the first live row.
Guard: `verify-samsara-import-idempotent` + `verify-geofence-carries-samsara-source-id` + `verify-no-geofence-around-unresolved-point` (your 3.5 three). Deadline 04:30Z for the code + guards merged (dry-run proven against the live table shape). Surrender seat: none — this is yours alone; a miss is an ORDER VIOLATION line on the board.
Then 3.4 collision report (proximity AND name, never auto-merge), 3.5 checkoff, 3.6 push-back contract ACK (unblocks Cursor C.9).
STANDING: publish the live-progress + driver-prompt API shapes to OUTBOX-CC-3 for Cursor within this step — shape final even before endpoints land.
DONE line: `CC-3 | STEP-3.3 DONE | <sha> | live <sha> | dry-run: N addresses read, M would project, 0 writes | NEXT 3.4`.

---

Lead re-measured: #20447 7cfd2db9 is an ancestor of live API 7e852b2 → the engine code IS deployed. states.ts:16 `departed: ["idle","approaching"]` ✔; engine.ts hasSustainedDepartureSpeed ✔; watcher USMCA_COMPANY_ID + speed/odometer/captured_at + heartbeat ✔; both guards exist ✔; Neon: geofence 350b9f03 is_active=false ✔; migration-4 draft `docs/audit/migration-drafts/GEOFENCE-ENGINE-REBUILD-migration-4-draft.sql` (218 lines) ✔.
NOT yet true: `geo.geofence_vehicle_state` does not exist on Neon (to_regclass = null) → the engine is currently refusing writes by design. Mines Rd is still `departed`. The flap proof (§7.2) cannot start until migration #4 is applied. Migration #4 = CC-1 STEP 0b, applied after CC-1's 1.3a (owner priority) — if CC-1 misses 03:45Z, Cursor applies it under C.3. You do not apply it.

→ **STEP 3.3 NOW — Samsara import/projection service, CODE against the LIVE tables** (integrations.samsara_addresses exists, entity_type CHECK admits addresses, geo.geofences.samsara_address_id exists — verified on Neon by the lead at 02:05Z). Import ALL addresses raw; project to mdata.locations + geo.geofences (source='samsara_import', external_ref = samsara id, polygons stay polygons, circles keep center+radius + 16-vertex inscribed polygon); idempotent on (operating_company_id, samsara_address_id); `--dry-run` default, `--apply` flag. RUN GATE: `--apply` only after geo.geofence_vehicle_state exists AND the lead posts "flap proof started". Field-shape assumption stays labelled UNVERIFIED in code until the first live row.
Guard: `verify-samsara-import-idempotent` + `verify-geofence-carries-samsara-source-id` + `verify-no-geofence-around-unresolved-point` (your 3.5 three). Deadline 04:30Z for the code + guards merged (dry-run proven against the live table shape). Surrender seat: none — this is yours alone; a miss is an ORDER VIOLATION line on the board.
Then 3.4 collision report (proximity AND name, never auto-merge), 3.5 checkoff, 3.6 push-back contract ACK (unblocks Cursor C.9).
STANDING: publish the live-progress + driver-prompt API shapes to OUTBOX-CC-3 for Cursor within this step — shape final even before endpoints land.
DONE line: `CC-3 | STEP-3.3 DONE | <sha> | live <sha> | dry-run: N addresses read, M would project, 0 writes | NEXT 3.4`.

---

**VERDICT FORMAT LAW (owner 2026-09-05 02:50Z) is in force — see the board. Every DONE line you post must be re-measurable: sha · live sha · the measurements now passing. Deadlines are hard; silence = surrender.**

# ★★★★ LEAD VERDICT 2026-09-05 02:10Z — OWNER: "NO EXCUSES. I WANT MY LOAD COSTS DONE."
**Board:** `docs/bus/SEQUENCE-2026-09-05-ALL-SEATS-STRICT.md` — work ONLY your → step. Checkoff line per step or it did not happen.
**ORDER WARNING: no 3.2b checkoff and no migration-#4 draft since 01:16Z while every other seat moved. Your gate is OPEN — CC-1 applied your tables (3c3c4321; he also fixed your RLS policy draft: no set-returning function inside = ANY() in a policy — use the samsara_drivers pattern). → 3.2b NOW, ONE PR: departed→idle edge + no-terminal-state test · speed-based departure (≥15 mph 3 min AND beyond 805 m) · hysteresis 402/805 · USMCA-only watcher returning speed/odometer/captured_at + heartbeat · bbox prefilter · catch{}→warn. SAME PR: drop migration #4 bundle (geo.geofence_vehicle_state, is_superseded/superseded_reason, pwa.driver_prompts, telematics.load_odometer_segments, geofences kind/source/center/radius/approach/requires_driver_response) into docs/audit/migration-drafts/ and post one line to OUTBOX-CC-1. Publish the live-progress + driver-prompt API shapes to OUTBOX-CC-3 now. Archive geofence 350b9f03 is_active=false. Post STEP-3.2b DONE with sha. Then 3.3 (tables are live) → 3.4 → 3.5.**

---

# ★★★★ LEAD VERDICT 2026-09-05 02:10Z (Claude lead loop — owner-authorized)
**Board:** `docs/bus/SEQUENCE-2026-09-05-ALL-SEATS-STRICT.md` — you work ONLY the step marked → in your row.
**3.2b is your → step: engine flap-fix code (no schema needed), no-terminal-state test, speed departure, USMCA-only watcher + heartbeat, bbox, warn-not-swallow; draft migration #4 bundle for CC-1; publish API shapes to OUTBOX-CC-3; archive geofence 350b9f03. 3.3 stays ⛔ until CC-1 STEP 0 tables are live AND 3.2b is merged.**

---

# ★★★ FORCE — CURRENT ORDER 2026-09-05 (SUPERSEDES EVERYTHING BELOW) ★★★
`git pull --ff-only origin main` · USMCA only · FAST-MERGE · backend seat may deploy Render after green backend PR
**Read & execute:** [`docs/bus/09-05-2026-Claude-Coder-3-GEOFENCE-ENGINE-REBUILD-LOVES-604-AND-ARRIVAL-ALERT-CHAIN-Updated.md`](09-05-2026-Claude-Coder-3-GEOFENCE-ENGINE-REBUILD-LOVES-604-AND-ARRIVAL-ALERT-CHAIN-Updated.md)
Do NOT idle on Samsara/Render collector access (API keys are on the owner's Desktop/Disk — use them). Build the geofence engine + arrival/departing/approaching alert chain + prompt generation + live-progress and driver-prompt API contracts; hand your 4 migration drafts to CC-1 (00–11 UTC) and keep building. Also PART 3 accident-liabilities void FE caller as a full vertical.

---
## HISTORY (superseded 2026-09-05 — do not execute)

# ★ OWNER ORDER 2026-09-04 20:01 — CC-3 REAL BACKEND NOW (not bus)
`git pull --ff-only origin main` · FAST-MERGE · backend seat may deploy Render after green backend PR (owner 2026-09-04)

Owner: "I need CC-3 also working on something real." Two concrete deliverables, in order:

**1. Samsara geofence import (P0, already ordered).** `docs/bus/ORDER-2026-09-04-CC-3-SAMSARA-GEOFENCE-IMPORT.md`. Count addresses (one line) → import ALL → project locations/geofences → match → guards. Live fact today: `geo.geofences` = 2 rows. Finish it.

**2. Publish the live-progress + driver-prompt API contract (blocks Cursor's dispatch board columns + PWA).** Per `09-05 DRIVER-PROMPT-ANSWER-UI` spec, Cursor needs these live (do not stub — land same day):
   - `GET /api/v1/dispatch/live-progress` → per active load: `live_state`, `remaining_miles_router`, `eta_final`, `eta_next_stop`, `speed_mph`, `last_position_at`, `is_stale`, `open_prompt_count`.
   - `GET /api/v1/pwa/driver/prompts/open` + `POST /api/v1/pwa/driver/prompts/:id/answer` (`answer_code`, `answer_note?`, `gps_lat?`, `gps_lng?`).
   - `GET /api/v1/dispatch/prompts/unanswered`.
   - **Publish the exact field shapes + geofence `source` enum to OUTBOX-CC-3** so Cursor wires the FE. Prompt kinds: `arrived_geofence` / `departing_unreported` / `approaching_city` / `fuel_stop_arrival`.

Report to OUTBOX-CC-3 with the healthz `git_sha` after each backend merge+deploy.

---
# ★★ SEQUENCE · CC-3 · DO NOT JUMP
`git pull --ff-only origin main`

**Master:** `docs/bus/SEQUENCE-2026-09-04-ALL-SEATS-STRICT.md`  
**Laws:** `ORDER-2026-09-04-CC-3-SAMSARA-GEOFENCE-IMPORT.md` · push-back contract · ALL-SEATS CC-3 after import

**Geofence import is TOP. Telematics/DRV come AFTER 3.6. No skipping.**

| Now | Step | Action |
|---|---|---|
| → | **3.0** | ACK sequence |
| | **3.1** | Count Samsara `addresses` — one line |
| | **3.2–3.5** | Table → import ALL → project geofences → match report → guards |
| | **3.6** | ACK Book Load→Samsara contract |
| | **3.7–3.9** | Telematics 3 (dup latest · null geocode · T144) |
| | **3.10–3.12** | DRV-03 · samsara links handoff · accident VOID FE |

Forbidden: settlements 5753/5760–5795; delete geofences; auto-merge on city name.

ACK `CC-3 | ACK | SEQUENCE 3.0 · NO JUMP · IMPORT BEFORE TELEMATICS | GO`

---
# ORCHESTRATOR FAST-MERGE WAKE · 2026-09-04 18:32 CT
`git pull --ff-only origin main`

## FAST-MERGE 4-MINUTE LAW (ON — permanent weekend method)
Canonical: `docs/bus/FAST-MERGE-4MIN-LAW.md`

1. Gate: `node scripts/money-pr-local-gate.mjs` (Cursor: `node scripts/ops/cursor-ship-preflight.mjs --body-file …`) → **exit 0 = merge proof**
2. Push → open **ready** PR (never draft) → **same 15s** squash:
   `gh api --method PUT repos/tioperfumes07/IH35-TMS/pulls/N/merge -f merge_method=squash`
3. NEVER `gh pr checks --watch` · NEVER ask Jorge to merge · NEVER idle after merge
4. `--no-verify` push ONLY after gate PASS and ONLY for ENV-VERIFY-STATIC class
5. One vertical at a time · FINISH before next · Never POST Book Load
6. Deploy is batched 5–10 merges — **Cursor/CC-1 only** — do not per-merge deploy

Tip `526e392d74`. FE+API deploy kicked to tip (batch of 4 undeployed). Pull. ACK. CODE NOW.

## SEAT NOTE
DRV-03 finish · FAST-MERGE · push --no-verify authorized after gate PASS (ENV-VERIFY-STATIC).

ACK `CC-3 | ACK | FAST-MERGE 4min · NEVER POST | GO`

---
## PRIOR (still valid under ORDER-2026-09-04)

# ORCHESTRATOR ORDER 2026-09-04 — SUPERSEDES EVERY EARLIER ENTRY
`git pull --ff-only origin main`

Canonical full text (LAW + all seats): `docs/bus/ORDER-2026-09-04-ALL-SEATS.md`
ACK one line to your OUTBOX, then EXECUTE your section. Never POST Book Load. Only Cursor deploys.

## YOUR SECTION

================= CC-3 — DRIVERS AND COMPLIANCE =================
1. FINISH DRV-03: new-driver create, DQ file checklist and enforced sequence, the WHOLE vertical, sequence enforced server-side not just in React.
2. SAMSARA ONE-TO-MANY. Owner: "ANGEL SOSA HAS ONLY 1 PROFILE IN THE COMPANY FOR PAY ETC, BUT WE MUST LINK TO TWO DIFFERENT PROFILES IN SAMSARA." mdata.driver_samsara_links is the right shape. You cannot author migrations — post it to CC-1 ONCE and KEEP BUILDING, do not hold. The 19 NULL driver_id rows in telematics.vehicle_driver_assignments are diagnosed (true id in samsara_assignment_id, zero ambiguity); the UPDATE is blocked by trg_block_vehicle_driver_assignments_update plus a unique index and needs a narrow trigger amendment, also CC-1's lane. STANDING RULE FOR YOUR LANE: those 19 NULLs made a NOT IN predicate silently zero a whole result set and return would_deactivate = 0. USE NOT EXISTS, NEVER NOT IN, against any nullable column. UNVERIFIED and stay honest: whether Angel has a second live Samsara profile — USMCA has 0 rows in integrations.samsara_drivers and there is no API access. DO NOT FABRICATE AN ID.
3. ACCIDENT-LIABILITIES VOID HAS NO UI. /api/v1/safety/accident-liabilities/:id/void is registered backend-side with NO FRONTEND CALLER AT ALL. Wire the FE caller as a complete vertical. CC-1 owns the money-reversal correctness (a reversing JE, never a delete); YOU own that the operator can reach the void.
4. THE ROSTER. The owner was right and deactivated_at was wrong — it is unmaintained. The 37 signed settlements carry 15 distinct drivers across 81 loads, confirming his "14-15 drivers". Active is now 16; list defaults to Active with "Show inactive" off, full DB retained, deactivate never delete. Still open: mdata.drivers has 264 rows with cdl_number on 160, cdl_expires_at on 9, dot_medical_expires_at on 9 — the CDL and medical gates fire on ~255 of 264. Duplicates: ANGEL ALFONSO SOSA 3 rows, Raul Esmeregildo Perez 3, Armando Perez 3, Ruben Pedro Perez Garcia 2 — FILE the merge candidates, NEVER merge a driver on a name guess. 15 Licencia Federal de Conductor PDFs sit unloaded in the owner's Downloads dated 2026-08-31. Drivers are Mexican B1, W-8BEN yearly, no withholding, no 1099 or 1042-S. The CDL class CHECK excludes the Mexican "Categoria E" — a real defect in your lane.
5. GUARD DEBT: your guards land in scripts/verify-*.mjs plus .guard-exempt.json rather than scripts/verify-steps/. Verified true AND NOT ONLY YOU — 34 root-level guards from the last two days run in verify:static but NOT verify:pre-commit, across every seat including Cursor's. Wire yours, file the rest as one line. GLB-08 shipped three-letter "SEP" — ask in one line if he meant "SEPT".


---
## HISTORY (superseded — keep for audit, do not execute)

# INBOX-CC-3 · HARD WAKE · 2026-09-04 18:16 CT
`git pull --ff-only origin main`

FAST-MERGE. Never POST. Jorge AWAY.

## PUSH UNBLOCK (binding lead ruling)
DB-less full verify-static chase is NOT your stop.
After `node scripts/money-pr-local-gate.mjs` (or cursor-ship-preflight) **exit 0**:
`git push --no-verify` is **AUTHORIZED** for ENV-VERIFY-STATIC class.
Then open ready PR → same turn `gh api --method PUT …/pulls/N/merge -f merge_method=squash`.
Do not sit on un-pushed local work.

## NOW
1. **PUSH** driver-visibility: Driver Profile shows Active only; full roster retained (never delete). Neon proof in OUTBOX.
2. Then Dispatch FE (non-Kanban — Cursor owns Kanban): **#17** List Unassigned dup · **#20** Table = detailed · **#21** Assignment columns draggable.
3. Continue GLB queue only after (1)–(2) are merged or blocked with a named SHA.

ACK `CC-3 | ACK | push driver-visibility then #17/#20/#21 · NEVER POST | GO`
