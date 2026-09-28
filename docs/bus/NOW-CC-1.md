# ROUND 155.20 JOB 2 DIAGNOSED + GUARD SHIPPED (root cause found, evidenced) — CC-1 — 2026-09-28 11:10Z
Archived: `docs/bus/archive/NOW-CC-1-2026-09-28-17.md`.

## ROUND 155.20 JOB 2 / 157-A item 2 — DIAGNOSED WITH LIVE EVIDENCE, GUARD SHIPPED
Root cause: `integrations.samsara_config.is_enabled` for USMCA
(5c854333-6ea5-4faa-af31-67cb272fef80) was FALSE for the entire time these loads have been
dispatched — the flag only flipped to TRUE at 2026-09-28T10:00:08.348Z (this morning, mid-session).
Proven, not assumed: audit.audit_events carries repeated `cron_skipped_samsara_disabled` rows
(sources DS-REMEDIATE-6 and BLOCK-F-REEFER-POLL) timestamped the same second as the flip, the last
pair at exactly 10:00:08 — the cron was still finding it disabled up to that instant.
The geofence/Samsara arrival chain itself is correctly wired and correctly running: telematics/
geofence-detector.service.ts is called from integrations/samsara/samsara-positions.service.ts,
scheduled every 5 minutes by cron/samsara-positions-cron.ts, registered at backend startup in
index.ts. integrations.samsara_vehicles: 48/48 already carry a local_unit_id mapping (not a
mapping gap) but 0 have been "seen" in the last day — the very first sync cycle since enabling
hasn't completed. Separately, the dispatcher-facing manual stamp route
(dispatch/truck-line/stop-stamp.routes.ts -> stampStopArrival) has fired exactly ONCE, ever,
system-wide — wired and working, just unused. mdata.load_stops carries 239 real, non-null
actual_arrival_at rows for USMCA (July 3 - Sept 24), proving the write path itself functions; they
never landed on these specific loads because the entity-level toggle was off the whole time.
CONCLUSION: not a code defect. Not fixable by writing more code — the toggle is now on, so new
loads dispatched from here should start stamping normally as Samsara position data accumulates.
These 24 loads' historical stops cannot be retroactively stamped (there was never a GPS feed to
detect an arrival from).
Guard scripts/verify-dispatched-load-has-stop-stamps.mjs: a load whose last scheduled stop is 24h+
past with zero actual_arrival_at anywhere in its stops fails the gate. Shrink-only ratchet,
baseline 17 (the exact diagnosed set: 13616,13618,13620,13621,13622,13624,13625,13626,13627,13628,
13629,13631,13632,13633,13636,13638,13639 — 13609/13617 excluded, each has 1 of 2 stops already
stamped from before; 13630/13634/13635/13637 excluded, their stops are in the future). Live PASS.
Wired into money-pr-local-gate.mjs's LIVE_DOMAIN_GUARDS, scoped to the dispatch/geofence/samsara
files.

## SAFETY / COORDINATION NOTE
Merged in CC-2's AUTH-096 (real settlement posting for P-0001/P-0004/P-0002, covering
13609/13610/13612/13614/13617/13619) mid-session — re-verified live: AUTH-096 is authorized but
NOT YET EXECUTED (settlement 2ef96b64/P-0004 still shows status='open', $0.00 as of this check),
so my earlier 155.12/155.23 diagnoses of these loads are still accurate as of now. Re-ran all 3 of
my guards (verify-open-driver-bill-keeps-load-active, verify-presettlement-shows-only-this-load-
and-its-open-tour, verify-dispatched-load-has-stop-stamps) after the merge — all PASS. Full test
suite re-run after merge: 5 pre-existing failures across 4 files, all confirmed unrelated (fail
identically on origin/main before any of my changes).

## REMAINING, in dependency order
1. Once CC-2's AUTH-096 executes (posts real settlements for 13609/13610/13612/13614/13617/13619),
   the stale-load picture for those specific loads changes — re-check before advancing them.
2. 157-A item 1: advance the genuinely-still-stale loads (13616/13618/13620/13621/13622, and
   13609/13617/13619/etc. IF AUTH-096 doesn't cover them) through the real state machine. Still
   blocked on real delivery-evidence timestamps I don't have a source for beyond what AUTH-096
   brings in.
3. Once the stale loads' trucks free up, finish the remaining 11 unit assignments
   (uq_loads_one_active_unit blocker, documented in AUTH-095).
4. 155.12 FIX 4 (13618/13621 $0 bills): still blocked on the is_active=false settlement-lines
   anomaly found earlier — not yet root-caused.
5. 155.12 FIX 2(c)/(d) remaining mileage for the 16 real loads: still genuinely no real source
   (Samsara now enabled going forward but has no historical data for these dates; only 2/18 rate
   cons state mileage; PC*Miler/Trimble documented to always return null).
6. 155.23 remaining: 13614's Laredo->Laredo lane fix (needs its real source document) + the two
   additional named guards from 157-A item 6.

Per the owner's bulk-seeding law: my earlier AUTH-090 (per-load loop, separate transactions) and
AUTH-091 (per-row loop within one transaction) predate that directive. Any further mileage/unit/
bill writes from here will be built as true set-based batches (UPDATE ... FROM (VALUES ...) or one
reused connection/transaction for engine calls), with a rows/batches/seconds/rate report.
