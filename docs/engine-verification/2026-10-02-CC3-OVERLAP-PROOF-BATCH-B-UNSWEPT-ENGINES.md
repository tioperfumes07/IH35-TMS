# CC-3 — overlapping-run proof, batch B: my lane's previously UNSWEPT scheduled engines (ROUND 330.7 order 2)

Cites 10-02-2026-ALL-CODERS-ROUND-332.1-THE-STANDARD-AND-THE-LINKAGE-LAW.md §7 (two concurrent sessions on a fork,
before/after counts) and §8 (one guarded sweep + one generalized guard).

**Fork:** `br-empty-hall-akm7qs85` from `br-fancy-credit-akjnd07a` (pooled endpoint). Production untouched.
**Method:** as batch A — `node-cron.schedule` AND `setInterval` intercepted, each engine's REAL scheduled callback
(wrapper and all) fired twice at once, then once more; a setInterval callback (`() => void run()`) is given 12 s to
settle before each count; counting `fetch` stub; fork-only setup named per row. Harness:
`scripts/proofs/2026-10-02-cc3-overlap-proof-batch-b.mts`. Classification first by code read (20 engines, 8 defects).

## Fixed in this sweep (code read found them; the fork run proves the fix)
| # | Engine | Defect | Fix | Fork: before → two at once → one more run |
|---|---|---|---|---|
| B02 | reefer hours poll | log dedupe = read latest then plain insert; one all-tenant txn with no savepoint, so one tenant's error rolled back all | tick try-lock + savepoint per tenant | ingest audits +1 (twin skipped at the lock) → +1 |
| B04a | positions cron → fence transitions | ±5-min duplicate check is a read before the insert; location + stats fix 3 s apart both wrote "entered" | xact lock per (fence, unit), fences walked in fixed order | entered 0 → **1** → 1 |
| B04b | positions cron → HOS clocks | `samsara.hos_snapshots` append, no key | tick try-lock per company | Samsara calls pair **1** → single 1 |
| B06 | chat confirmation escalation | attempt ledger in process memory (2× pushes on 2 instances) — AND the spine event never wrote at all: the untyped `events.log_event` call resolved with `source = NULL` (23502), swallowed as "non-fatal" (prod: 0 rows ever) | ledger = `events.event_log` under a per-message xact lock; claim written before the push; typed call + explicit source | events 0 → **1** → 1 |
| B08 | auto status switch | in-transit issues read-then-insert, snapshots plain insert per tick | tick try-lock | snapshots per run +129: pair **+129** → +129 |
| B09 | border crossing projector | read-then-insert, no unique key (a duplicate also never links to customs) | xact lock per company | crossings 3 → **4** → 4 |
| B11 | layover worker | per-company catch inside one aborted txn | savepoint per company (lock was made xact in #24239) | no new input on the fork: 59 → 59 → 59 |
| B13 | active driver set recompute | snapshot per run, twin wrote a second | tick try-lock | +3 per run: pair **+3** → +3 |
| B19/B20 | deadhead / lane profitability refresh | outer transaction held idle while each company borrowed a second pooled connection | read companies, release, then loop | completes; in the long batch run (other engines' connections in use) the OLD shape hung on the pool |

## Clean — header only (DB-level idempotency confirmed by code read)
| # | Engine | Form | Fork |
|---|---|---|---|
| B01 | real-driven-miles segments | UNIQUE … ON CONFLICT | 3 removed: 192 → **260** → 260 · duplicate keys 0 |
| B10 | geofence state watcher | ON CONFLICT + row lock | no new input: 1,223 → 1,223 · exact-key duplicates 0 |
| B12 | vehicle-driver pairing | ON CONFLICT + compare-and-set | no new input: 633 → 633 · duplicate samsara ids 0 |
| B14 | driver active-30-day | same-statement WHERE | no new input: 151 inactive / 19 active unchanged |
| B16 | late arrival aggregator | ON CONFLICT | no new input: 32 → 32 |
| B17 | customer relationship scorer | ON CONFLICT (pk) | no new input: 3,935 → 3,935 |
| B18 | fleet roster integrity | partial ON CONFLICT + compare-and-set | no new input: 67 open → 67 · duplicate open keys 0 |
| B03 | Samsara health | deterministic overwrite | not exercised: the fork's stored token is encrypted (no probe call) |
| B05 | Google reference miles expiry | same-statement WHERE | not exercised: no leg carries a fetch date |
| B07 / B15 | cache warmer / booking gap | memory only / read only | nothing to duplicate |

"No new input" rows are **UNVERIFIED under fresh work** (§2): the pair ran clean and wrote no duplicate key, but the fork
gave them nothing new to write.

## The sweep's generalized guard
`scripts/verify-no-session-advisory-locks.mjs` — fails if any non-test backend source calls `pg_advisory_lock` /
`pg_try_advisory_lock` / `pg_advisory_unlock` (session locks leak on an aborted transaction behind pgbouncer — fork-proven
in #24237). 2,027 files, 0 calls. All 20 engines carry the ROUND 329 header; SWEPT 24 → 44.
