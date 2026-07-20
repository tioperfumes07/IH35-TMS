# D-#1 · RECON-COLLECTOR unfreeze — one-page design (design-first, gated)

**Block:** `PHASE2_RECON-COLLECTOR_frozen-feed` · **Owner gate:** §1.4 (accounting.* + possible migration)
**Author:** CHAT D · **Date:** 2026-07-19 · **Base:** `a3c718d6b` (branch `chore/audit-note-purge-2026-07-19`)
**Status:** DESIGN — no code, no migration, no flag, no prod write.

---

## 1. The job that writes the table

| Layer | File | State on main |
|---|---|---|
| Collector service | `apps/backend/src/integrations/qbo/remote-count-collector.ts` | BUILT (309 lines) |
| Cron | `apps/backend/src/cron/qbo-remote-count-collector.cron.ts` | BUILT — delta `10 */6 * * *`, full `20 2 * * *`, `America/Chicago` |
| Registration | `apps/backend/src/index.ts:380` (import) + `:1409` (call) inside `main()`, unconditional `try/catch` | **WIRED** |
| Flag | `QBO_REMOTE_COUNT_COLLECTOR_ENABLED` — defaults `"true"`; only literal `"false"` disables (`cron.ts:42`) | **ON by default** |
| Table | `accounting.qbo_remote_counts` — created by `db/migrations/0201_ds_remediate_qbo_remote_counts_canonical.sql` (DROP+CREATE, **no seed**) | exists |

**Only production writer of the table is this cron.** Migration 0201 seeds nothing; no route, script, or backfill inserts. (`grep collectQboRemoteCounts` → cron + unit test only.)

**Therefore: the block title is a misdiagnosis.** There is no missing service, no missing initializer, and no OFF flag. The code is built, wired and enabled. **The freeze is a runtime/data cause, not a build gap.** Correcting this is the point of design-first — building a collector here would have been building a second copy of a working one.

## 2A. Freeze root cause — LEADING MECHANISM IDENTIFIED (repo-verified + vendor-documented)

**A QBO refresh-token rotation race, unprotected by any lock, is the leading cause.** Evidence, four independent strands:

**(i) Intuit's documented token behavior** (Intuit SDK docs, `intuit.github.io/QuickBooks-V3-PHP-SDK/authorization.html`): access token = **1 hour**; refresh token = **101 days**; a new refresh token is issued roughly **every 24 hours**, and *"if a new refresh token is returned, the previous refresh token will be **forced to expire**."* Un-persisted or raced rotation is the **#1 documented cause** of silent `invalid_grant` death, and it kills a connection within ~24–48h.

**(ii) The repo has exactly that race.** `qbo-oauth.service.ts:490-534` `refreshAccessToken()` is a **read-modify-write straddling a network call** with **no advisory lock, no `FOR UPDATE`, no single-flight**: it reads the connection, calls Intuit (hundreds of ms), then writes the new tokens. Two concurrent callers read the *same* refresh token, both redeem it; Intuit force-expires the loser's. Whoever writes last can persist an already-invalidated token → the connection is dead on the next refresh.

**(iii) The concurrency is real and multi-source, not theoretical.** Four independent call paths into `refreshAccessToken` — `cron/qbo-token-refresh.ts:52` (scheduled), `sync-outbound-accounting.ts:39` and `:432` (the every-minute queue drain, §8.3), and `getValidAccessToken:569` — plus **21 call sites** of `getValidAccessToken`, which refreshes whenever the access token is within 5 minutes of expiry. The remote-count collector is itself one of those callers (`queryRemoteCount` → `qboCompanyContext`).

**(iv) Prior independent discovery.** Backlog finding `0243-h6-1-qbo-refresh-token-race` recorded this before D-#1 existed: *"refreshAccessToken has no pg_advisory lock/mutex; cron (hourly)+on-demand getValidAccessToken can race QBO's one-time-use refresh token."*

**The 42-vs-101-day discriminator (rules a hypothesis OUT):** the freeze is ~42 days old. Passive refresh-token expiry takes **101 days** — had the collector merely stopped polling on 2026-06-03, the token would have stayed valid into ~mid-September 2026. **Passive expiry cannot explain a 06-03 hard stop.** What *does*: immediate invalidation — i.e. a raced/un-persisted rotation, or an explicit revoke/disconnect. Both are immediate; decay is not.

**Still UNVERIFIED (needs the §12 read):** which of raced-rotation vs explicit revocation. The discriminator is in the data: if `qbo_connections.last_refreshed_at` **stopped advancing before** the collector's last successful poll → persistence/race bug. If `revoked_at` is set, or `last_refresh_error` shows `invalid_grant` from ~06-03 with `last_refreshed_at` current → revocation. `stampRefreshFailure()` (`:471-488`) already records `needs_reauth_at` + `last_refresh_error`, so this trace exists if a refresh *failed cleanly*. Its **absence** would point at the race (the winner's write succeeds; nothing errors until later).

**Blast-radius question the read also answers:** if the connection is dead, the frozen collector is a *symptom*, and every QBO-dependent path shares the cause. I do **not** claim that yet — `recon_runs` is still active, and I have not established which of its run types call the QBO API vs read TMS-internal data only. Flagged, not asserted.

## 2B. Freeze root cause — the full candidate set (kept for completeness)

Prod (Cursor, authoritative): 3 rows, **all `qbo_vendors`**, max `collected_at` **2026-06-03T04:07:06Z**.

The collector loop (`remote-count-collector.ts:226-248`) inserts sequentially over `COUNT_ENTITY_SPECS` = accounts → classes → items → customers → **vendors (last)**. A partially-failing loop leaves *accounts*, never *vendors-only*. **The observed shape is not what today's code produces on any success or partial path.** Candidates:

| # | Cause | Prod signature that confirms it |
|---|---|---|
| **A** | **No active QBO connection.** `remote-count-collector.ts:198-213` — if `integrations.qbo_connections` has no `revoked_at IS NULL` row, it returns `collected_count:0`, **`failed:false`**, emits `qbo.remote_count_run_skipped`. Fails *quietly and successfully*. | `qbo_connections.revoked_at` non-null / no row; `qbo.remote_count_run_skipped` events after 06-03 |
| **B** | **QBO API failures.** `queryRemoteCount` throws → `markCollectionFailure` → `qbo.outage_started`, then `qbo.outage_escalated` at streak ≥3. | `qbo_remote_count_collection_state.consecutive_failures > 0` + `last_error_message` |
| **C** | **DB-level insert failure = zero forensic trace (design defect).** `withLuciaBypass` (`auth/db.ts:158-183`) wraps the whole call in ONE `BEGIN/COMMIT`. A *Postgres* error aborts the transaction, so the `catch` block's own `markCollectionFailure` + `appendAuditEvent` also throw → propagates → **`ROLLBACK`** → no rows, no state, no audit event. Completely dark. | `collection_state` row absent/stale AND no `qbo.*` audit events at all after 06-03 |
| **D** | Entity-list shape changed after 06-03 (DS-REMEDIATE-2 era collected vendors-only; 4 types added later) — would explain vendors-only without any failure. | git history of `COUNT_ENTITY_SPECS` + first `collected_at` per `entity_type` |

**These are mutually exclusive and fully distinguishable from prod data.** Root cause is stated `UNVERIFIED` until the §7 reads run. No fix is designed against a guessed cause.

## 3. Entity keys collected

`qbo_accounts · qbo_classes · qbo_items · qbo_customers · qbo_vendors` (`QboRemoteCountEntityType`, 5 specs). Each = `SELECT COUNT(*) FROM <Entity>` against QBO, stored as one row per (opco, entity_type, collection_run_id).

**Gap:** only 1 of 5 has ever landed. Acceptance must assert **all 5**, per entity, not "the table is non-empty."

## 4. Schedule

Keep as-is: delta every 6h (`10 */6 * * *`), full daily `02:20` CT. **Do not** re-align to the twice-daily money recon (06:00/19:00 CT) — different cadence, different purpose (§6). The 6h delta is strictly fresher than the 25h staleness threshold in §5, so the existing guard is correctly calibrated.

## 5. RLS / entity scope

- Table is `ENABLE ROW LEVEL SECURITY` with `qbo_remote_counts_company_scope` (`0201:77-91`): `operating_company_id::text = current_setting('app.operating_company_id')` OR `app.bypass_rls='lucia'`.
- **Note (not in scope to change here, but recorded):** policy is `ENABLE`, not `FORCE`. §2 invariant is FORCED RLS. Flag for a follow-up block; do not fold a policy change into this fix.
- **Cross-entity defect found — in scope.** The staleness query in `reconciliation-worker.service.ts:834-838` runs `SELECT max(collected_at) FROM accounting.qbo_remote_counts` with **no `operating_company_id` filter**. Under `withLuciaBypass` it spans ALL entities, so one healthy company's feed masks another's dead one. Must become per-(opco, entity_type). Same class as `cross-entity-leak-audit-usmca`.
- All reads/writes go through `withLuciaBypass` + explicit `set_config('app.operating_company_id', …, true)`.

## 6. Lists Hub vs money recon — separate systems, separate acceptance

| | **Lists Hub / master-data counts (THIS block)** | **Money TMS↔QBO recon (health-prove only)** |
|---|---|---|
| Table | `accounting.qbo_remote_counts` | `accounting.recon_runs` |
| Cron | `qbo-remote-count-collector.cron.ts` (`index.ts:1409`) | `recon.cron.ts` (`index.ts:~1230`), AM 06:00 + PM 19:00 CT |
| Consumers | `qbo-recon-reads.ts` (Lists Hub tiles), `reconciliation-worker.service.ts:362,421` | `recon-engine.service.ts`, `recon.routes.ts` |
| Prod state | **FROZEN** — 3 rows, vendors only, 2026-06-03 | **NOT dark** — 131 non-voided rows, newest start 2026-07-20; `am_bank_count` 2026-07-19T11:00Z |

**I do not claim "all twice-daily recon is dark."** The money path still fires. This block fixes the master-data count feed and *proves* the money path healthy as a separate, explicitly-labelled acceptance item.

## 7. Concrete harm today (why this is #1)

`reconciliation-worker.service.ts:362-373` and `:421-431` read the latest count with `ORDER BY collected_at DESC LIMIT 1` and **no staleness filter on the row itself**. So the reconciler compares live TMS vendor counts against a **6-week-old** QBO number, and gets `NULL` for the other 4 entity types. That is worse than no data: it is stale data consumed as current.

**Correction to my own earlier statement to Jorge:** I previously said there is *no* staleness assertion. That was wrong. A guard **does** exist — RECON-NOCONN, `reconciliation-worker.service.ts:831-845` — 25h threshold, emits `reconciliation.qbo.remote_counts_stale` at **critical**. The real defect is narrower and worse:
1. it writes to `audit.audit_events` only — **no alert surface, no UI, no notification**; it has almost certainly been firing critical every tick for ~6 weeks with nobody reading it;
2. it explicitly **does not throw** — "the tick can still run against whatever counts exist" (comment at `:831`), so recon proceeds on dead data;
3. it is **global, not per-(opco, entity_type)** (§5) — so it cannot see "vendors fresh, other 4 never collected."

## 8. Fix shape (NOT built — for approval only)

Cause-independent (ships regardless of which of A–D prod names):
- **F1** — per-`(operating_company_id, entity_type)` staleness, replacing the global query; a never-collected entity type reads STALE, not silent-NULL.
- **F2** — the no-connection path returns `failed: true` (or a distinct `skipped` state that the health surface treats as unhealthy); a dead feed must never read green. Root-cause fix for `[[recon-collector-green-on-no-data-dark-feed]]`.
- **F3** — close the cause-C blind spot: failure bookkeeping on a **separate connection/txn** so a Postgres-aborted transaction still records state + audit event. No silent failures (Rule #0).
- **F4** — surface it: staleness/outage reaches an existing owner-visible health surface (candidate: `GET /api/v1/qbo/sync-health`, already on Office HOME). No new module (additive; §7).

- **F5 — single-flight the QBO token refresh (ROOT-CAUSE fix, highest value).** `refreshAccessToken` takes a `pg_advisory_xact_lock` keyed on the connection id, re-reads the connection **inside** the lock, and skips the exchange if another caller already rotated it. Kills the race in §2A(ii), and closes existing backlog item `0243-h6-1-qbo-refresh-token-race`. Also add Intuit's documented handling: **retry once, then mark `needs_reauth_at` and stop background syncs for that connection** rather than retrying a dead token forever. Non-financial file (`integrations/qbo/`), but it is the actual root cause — unfixed, the feed re-freezes.
- **F6 — daily keep-alive refresh.** Intuit guidance: refresh on a schedule even when idle, so the 101-day inactivity window can never be reached. The hourly cron already exists (`cron/qbo-token-refresh.ts`); verify it covers idle connections rather than only near-expiry ones.

Cause-specific: **A →** owner re-auths QBO OAuth (owner action, credentials — I never touch, §1.6). **B →** fix per `last_error_message`. **D →** backfill decision, owner call.

### 8B. Standards grounding (researched this session, not from memory)

| Requirement | Source | What it obliges us to do |
|---|---|---|
| A control that silently stops operating is a **control deficiency**, escalating to **significant deficiency / material weakness**; aggravating factors are duration, non-detection, and **false assurance** | COSO ICIF (2013); Deloitte ICFR deficiency guidance; Pathlock | F2 + F4 are not polish — the six-week silent-green is the deficiency itself |
| **IPE completeness & accuracy** — auditors must test that information produced by the entity is complete/accurate; recurring PCAOB inspection finding | PCAOB inspection findings; BDO/Schneider Downs IPE guidance | Every count row needs provenance (`collected_at` + run id — already present ✅) and every reconciliation needs a **durable run record**, or we cannot evidence the control operated |
| **SOC 2 Processing Integrity** — processing must be "complete, valid, accurate, **timely**, and authorized" (PI1.3: detect and correct processing errors) | AICPA TSC | "Timely" is in the objective — stale-consumed-as-current is a PI failure, not a nit |
| **No-Data must be a distinct alert state**, defaulting to *alert*, not *normal*; series marked stale after ~2 evaluation intervals | Grafana alerting model (`DatasourceNoData`) | F1 threshold: 2× the 6h delta interval. Fail-**closed** |
| **Dead man's switch / heartbeat** — alert on *silence*, not only on errors; prefer an **external** watchdog (an in-process one dies with the process it watches) | Google SRE Workbook; heartbeat-monitoring practice | F4 must alert on absence. Note: this repo runs ~50 jobs on an **in-process** scheduler, so an in-process watchdog shares the failure mode — flagged |
| Best-in-class peer behavior: connection health shown on a **surface independent of results** (Alvys `Management > Integrations`, last-successful-poll + reconnect); failed syncs become **visible work items**, not log lines; missed syncs are **not** silently retried | Alvys help docs; QBO bank-feed errors 324/108/109 | F4 shape: connection state + last-successful-poll, rendered separately from recon results |

**Peer-market finding worth stating plainly:** failure-event alerting is well covered across QBO/NetSuite/McLeod/Alvys; **absence-of-event detection is weak-to-absent natively** in all four and is normally delegated to an integration/observability layer. This defect sits exactly where the market under-serves — so we build it rather than expect a vendor pattern to copy. Doing it properly is a place we **surpass** the reference systems, not merely match them.

### 8C. Four-state outcome — extend the existing engine, do not build a parallel one

Research recommends replacing boolean health with `RAN_NO_DIFFERENCES / RAN_DIFFERENCES_FOUND / DID_NOT_RUN / RAN_BUT_INPUT_STALE`. Checked against the repo before recommending:

`accounting.recon_runs` (migration `202607022100`) **already exists** with `started_at`/`finished_at`/`totals`/`preparer`/`reviewer`/`signed_off_at` — a proper preparer-reviewer control record. But:
- its `status` CHECK is `('running','complete','open','late')` — **no state for "ran but input was stale"**;
- its `run_type` CHECK is bank/categorization only (`am_bank_count`, `pm_categorization_diff`, `on_demand_*`) — **the master-data/remote-count reconciliation has no run record at all.** It therefore cannot evidence that the control operated, which is precisely the IPE/PCAOB gap above.

**Recommendation: extend `recon_runs` (new `run_type` + a stale/insufficient-data `status`) rather than create a second run table.** That is a CHECK-constraint migration on `accounting.*` → **financial cluster, owner-gated, not built in this block.** Recorded here so it is a decision you make, not a gap that goes silent.

**Likely no migration.** If F1–F4 stay code-only, this is a non-schema `accounting.*`-reading change — still §1.4-gated by table touch. If a migration proves necessary (e.g. FORCE RLS), it is authored separately, applied twice on throwaway PG, and handed over as full SQL + sha256 for owner Neon-apply. **Never self-merged.**

## 9. Acceptance (machine-checkable)

| # | Assertion | Evidence kind |
|---|---|---|
| A1 | `MAX(collected_at)` < 24h old for **all 5** entity types, **per operating company** (bypass RLS) | data |
| A2 | `qbo_remote_count_collection_state.consecutive_failures = 0`, `last_success_at` < 24h, per opco | data |
| A3 | Money path proven separately: `accounting.recon_runs` has a non-voided run < 24h old for the AM bank + PM categorization types | data |
| A4 | Planted no-connection → collector reports **unhealthy** (not green); planted stale feed → surfaced on the health endpoint | live |
| A5 | Staleness query is per-(opco, entity_type) — zero cross-entity reads of the table | guard |
| A6 | Deployed SHA == merge SHA on `/api/v1/healthz/shallow`; deep health green | live |

## 10. Guards (Rule 17 — `scripts/verify-*.mjs` + `scripts/verify-steps/NNN-*.mjs` only; **no** `package.json` / `ci.yml` / `locked-guards.yml` edits)

- **G-a** `verify-recon-collector-wired.mjs` — collector imported AND invoked in `index.ts`; cron schedules present; flag defaults ON. Regression-proofs "wired".
- **G-b** `verify-recon-no-green-on-no-data.mjs` — the no-connection path may not return a healthy/`failed:false` result; planted-failure test must fail the guard when reverted.
- **G-c** `verify-qbo-remote-counts-entity-scope.mjs` — every read of `accounting.qbo_remote_counts` carries an `operating_company_id` predicate (kills the §5 cross-entity read).

## 11. Linkage declaration (§10 / C1–C9)

- **Canonical target:** `accounting.qbo_remote_counts` — verified as the table the consumers read (`qbo-recon-reads.ts:129`, `reconciliation-worker.service.ts:365,424`). **Not a RETIRE table.** This is the QBO *count* feed, distinct from the QBO *mirror* (canonical `mdata.qbo_*`, RETIRE `accounting.qbo_*`) — this block writes **neither** mirror, so G4 is not implicated.
- **No duplicate holds this data** (C2): searched by concept — `samsara` has a parallel `remote-count-collector` for telematics; no second QBO count store.
- **Cross-module links (C3):** `org.companies` (hub, FK `operating_company_id`) · `integrations.qbo_connections` (auth precondition) · `audit.audit_events` (append-only WORM) · Lists Hub tiles · reconciliation worker. **Financial primitives: N/A — this is a control/observability feed, it posts no GL, moves no money, creates no bill/invoice/JE.** Declared explicitly, not silent.
- **Entity scope (C4):** `operating_company_id` on every row; RLS policy present (ENABLE; FORCE gap noted §5).

## 12. Rollback

Code-only F1–F4 revert cleanly by PR revert; no data migration, no destructive DDL, nothing to un-post. Existing 3 rows are never deleted (void-not-delete / additive).

---

## GATE — what I need before writing any code

**1. Owner OK on this design.**

**2. Gated read-only prod access (§1.5) to name the root cause.** Read-only SELECTs, no writes, no DDL, run with `SET LOCAL app.bypass_rls='lucia'` in-transaction (§3 RLS 0-count law):

```sql
-- A: is the QBO connection alive, AND which failure mechanism? (raced rotation vs revocation)
--    last_refreshed_at stopping BEFORE the collector's last good poll ⇒ persistence/race bug.
--    revoked_at set, or invalid_grant in last_refresh_error from ~06-03 ⇒ revocation.
SELECT operating_company_id, realm_id, revoked_at, needs_reauth_at,
       last_refreshed_at, last_used_at, refresh_token_expires_at,
       left(coalesce(last_refresh_error,''), 200) AS last_refresh_error, updated_at
FROM integrations.qbo_connections;

-- B: collector's own self-reported health
SELECT operating_company_id, consecutive_failures, outage_started_at,
       last_success_at, last_failure_at, last_error_message
FROM accounting.qbo_remote_count_collection_state;

-- C/D: did it tick at all, and what shape are the 3 rows?
SELECT entity_type, count(*), min(collected_at), max(collected_at)
FROM accounting.qbo_remote_counts GROUP BY entity_type;

SELECT event_class, severity, count(*), max(created_at)
FROM audit.audit_events
WHERE event_class LIKE 'qbo.remote_count%' OR event_class LIKE 'qbo.outage%'
   OR event_class = 'reconciliation.qbo.remote_counts_stale'
GROUP BY event_class, severity ORDER BY max(created_at) DESC;
```

Without these, the fix would be built against a guessed cause. Per Rule #0 that is not acceptable, so I stop here.
