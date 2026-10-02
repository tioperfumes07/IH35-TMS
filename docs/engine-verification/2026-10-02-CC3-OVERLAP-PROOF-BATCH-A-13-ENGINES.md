# CC-3 — overlapping-run proof, batch A: the 13 "clean" ROUND 329 engines (ROUND 330.7 order 2)

**Fork:** `br-empty-hall-akm7qs85` from `br-fancy-credit-akjnd07a` (pooled endpoint, pgbouncer transaction mode as prod).
Production untouched by the proof.
**Method — one step closer to production than #24230:** `node-cron`'s `schedule` is intercepted before each cron module
loads, so the harness holds the engine's REAL scheduled callback, `wrapBackgroundJobTick` and all. That exact callback
is fired **twice at once**, then **once more on its own**. Every outbound call goes through a counting `fetch` stub
(nothing left the machine). Samsara-fed engines get a crafted payload so the tick has fresh work; DB-fed engines get
fork-only setup for the same reason (named per row). Harness: `scripts/proofs/2026-10-02-cc3-overlap-proof-batch-a.mts`.

| # | Engine | Fork setup / stub | Before | Two at once | One more run |
|---|---|---|---|---|---|
| A1 | geofence auto-delivery | load 13637 back to in transit; final delivery departed by geofence | per-class side-effect audits 1 | **each class +1** (billing sync, awaiting BOL, settlement events) — one transition pass | +0 |
| A2 | geofence odometer captures | 5 newest captures removed | 1,189 | **1,194** (+5) · duplicate event keys 0 | +0 |
| A3 | load-stop geofence sync (retro stamp on) | 2 unstamped stops given an entered/exited visit | stamped 0 | **stamped 2** · fences +2 · events +4 · duplicate active stop fences 0 | +0 |
| A4 | Samsara fuel reports | stub: 1 driver + 1 vehicle report | 0 | **4** (2 subjects × 2 report days) | +0 |
| A5 | Samsara HOS pull | 45-min DB claim back-dated; stub: 1 duty log | 0 · Samsara calls 0 | **1 · 1 call** (the twin stopped at the claim) | +0 |
| A6 | Samsara master sync (flag on for the proof) | stub: empty lists | list calls 0 | **3** (one pass) | +3 (one pass) |
| A7 | telematics preservation | — (work since the 03:10 run) | per-table counts | +4 DVIR · +43 fence events · +4,740 HOS · +1 segment · +351 stop events · +4,492 positions | +0 everywhere |
| A8 | unit stop events | — | — | **DEFECT** — see below | — |
| A9 | Samsara DVIR poll | stub: 1 DVIR on a mapped unit + signer | 0 | **1** | +0 |
| A10 | odometer snapshot | — | today's readings 0 | **DEFECT** before the fix (23505) · **14** after it · duplicate unit-day keys 0 | +0 |
| A11 | draft-crew status self-heal | crewed load 13593 set to draft | draft · audits 0 | **assigned_not_dispatched · 1 audit** | +0 |
| A12 | load real driven miles | computed miles cleared on 5 loads | computed 0 | **2 recomputed** (the 2 that are due), values identical to before the clear | +0 |
| A13 | harsh-events poll | stub: 1 harsh-brake event on a mapped unit | 0 | **1** | +0 |

## Two defects the overlap test found — both were on my "clean" list, both fixed in this PR

**A10 — odometer snapshot: the whole daily snapshot failed on prod, 2026-10-01 and 2026-10-02.**
Prod log 2026-10-02 08:00:24Z and 08:00:26Z, both instances: `duplicate key value violates unique constraint
"odometer_readings_unit_id_read_at_source_key"`. Prod rows, source `samsara`: 09-30 13 · **10-01 0 · 10-02 0**.
Cause: the INSERT named ONE arbiter, the partial per-day key. The table has a second unique key `(unit_id, read_at,
source)`; when the twin tick inserts the same reading concurrently, the loser trips the second key — not the arbiter —
gets 23505, and the single transaction rolls back every unit's snapshot. Fix: `ON CONFLICT DO NOTHING` with no target
(every unique key arbitrates) plus a transaction advisory lock for the tick. After the fix: 14 readings, twin and rerun
+0, no error. The two missing days cannot be re-snapshotted from `vehicle_latest_position`.

**A8 — unit stop events: one physical stop stored once per tick.**
Prod 2026-10-02: **1,924 rows, 122 stops held 1,258 times — 1,136 surplus copies.** Cause: a stop already in progress
when the 36 h window opens is clipped to the window's first fix — a later `started_at` on every 15-minute tick — so the
`(unit_id, started_at)` key never matches and each tick inserts it again (sequential, not only overlap). Fix: the writer
drops the stop that begins at the window's first fix (its true start lies before the window; an earlier tick or the
10-day catch-up wrote it). Fork, four sliding ticks + a pair: **old writer +8, +7, +8, +8 rows; fixed writer +0 every
time.** Guard `scripts/verify-unit-stop-events-no-clipped-starts.mjs` (static + live after the cutoff).
**Cleanup needs the owner's AUTH:** `scripts/ops/2026-10-02-cc3-dedupe-unit-stop-events.mts` keeps the earliest start
per (unit, ended_at) and deletes the copies (no FK, no trigger references the table; the WORM preservation ledger keeps
what was observed). Prod dry run 2026-10-02 ~21:45Z: 1,933 rows, 123 stops with copies, **1,144 to delete** — still growing ~8 per 15-min tick until the fix deploys. On the fork: 1,174 deleted -> 782 rows, 0
surplus, and the fixed writer stays at 782 through four ticks and a pair.
