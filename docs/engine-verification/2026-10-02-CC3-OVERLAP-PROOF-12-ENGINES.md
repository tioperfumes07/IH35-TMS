# CC-3 — overlapping-run proof, the 12 ROUND 329 engines (ROUND 330.1 order 1)

**Fork:** `br-rough-night-ak507ejk` from `br-fancy-credit-akjnd07a` (pooled endpoint, pgbouncer transaction mode as
prod), **deleted after the run**. Production untouched.
**Method:** each engine driven from **two concurrent sessions** — two pooled connections, two transactions, the app's
own `withLuciaBypass` wrapper and `ih35_app` role — against the fork, through its real entry point (the cron tick
function wherever one is exported). Every outbound call went through a global `fetch` stub (nothing left the machine);
the stub counts calls, so a duplicated external call would show as a number. Fork-only setup is named per row.
Harness: `scripts/ops/2026-10-02-cc3-overlap-proof-12-engines.mts`.

**Correction to my #24219 report:** 11 engines were changed, not 12. The 12th on the sweep list, the geofence breach
detector, already held a single-flight advisory lock and was left unchanged (header only). All 12 are proven below.

| # | Engine (entry driven) | Fork setup | Before | Two sessions at once | After | Re-run |
|---|---|---|---|---|---|---|
| 1 | fault-code-processor (`processVehicleFaultCodeWebhookEvent`, same event ×2) | rule for `SPN 3226 FMI 5` set high + auto-WO | history 1 · WOs 0 | A: 1 WO · B: 0 WO | history 1 · **WOs 1** | +0 (1) |
| 2 | document-alerts (`runDocumentAlertEngineCronTick` ×2) | rules fire at every day count | events notified 0 · notifications 0 · emails 0 | both ticks complete | **13 · 104 (13 × 8 users) · 13** | +0; duplicate (user, entity, title) groups **0** |
| 3 | samsara-documents (`ingestSamsaraDocuments`, same doc ×2, 2 photos) | — | files 0 | A: stored 2 · B: already_stored 2 | **files 2** | — |
| 4 | webhook projection (`runSamsaraWebhookProjectionTick` ×2) | 1 pending webhook event | started audits 355,269 · no state row | one tick per tenant (3 tenants) | started **355,272** (+3 = one run) · event **attempts 1** | — |
| 5 | fuel-purchase push (`runFuelPurchasePushCronTick` ×2, APPLY on) | — | ledger 647 · POSTs 0 | — | **ledger 648 · POSTs 1** | +0 (648 · 1) |
| 6 | routes push (`runSamsaraRoutesPushTick` ×2) | route ledger hashes made stale | ledger 103 | A: 7 routes · **B: skipped (locked)** | route GETs **7** (one run, not 14) | — |
| 7 | driver replies inbound (`ingestDriverReplies`, same message ×2) | — | direct threads 0 · messages 0 | A: inserted 1 · B: deduped 1 | **threads 1 · messages 1** | — |
| 8 | driver message delivery (`deliverChatMessageToSamsara`, same message ×2) | 1 system message to a driver | sent rows 0 · sends 0 | A: already_delivered · B: sent | **sent rows 1 · sends 1** | — |
| 9 | location fence (stops-geocode-backfill: the lock + `NOT EXISTS` insert, one location ×2, tx held 300 ms) | — | active fences 0 | inserted [0, 1] | **fences 1** | — |
| 10 | CBP wait times (`runCbpWaitTimesRefreshTick` ×2) | — | cache rows 163,066 | both complete | **163,071** (5 ports = one run) · CBP calls **5** | — |
| 11 | Samsara remote-count collector (`runSamsaraRemoteCountCollectorTick` ×2) | — | samples 742 | both complete | **745** (+3 = one run) | +3 (748) — a single run adds 3 |
| 12 | geofence breach detector (the cron's own session lock + `runGeofenceBreachDetectionTick`, 6 h window ×2) | — | breach events 41 | A: **skipped (lock held by the twin)** · B: ran | **42** | — |

**Read-out.** In every row the overlapping pair produced exactly one run's effect: one work order, one notification per
user per event, one file per photo, one projection attempt, one fuel POST, one route pass, one thread, one send, one
fence, one snapshot per port, one sample set, one breach row.

**Observed, kept:** row 3 — the losing session uploaded one photo to the (stubbed) store before its `INSERT … ON
CONFLICT (r2_key)` waited on the winner (3 puts for 2 photos). Same key, same bytes: an idempotent overwrite, and
`docs.files` holds 2 rows. Row 6 — the stub answers every route GET as "unchanged", so no route write followed; the proof
is the lock (B skipped) and the GET count (7, not 14).

**Code change made for the proof:** `routes-push.cron.ts` — the tick body moved into an exported
`runSamsaraRoutesPushTick()` so the proof drives the exact production path; the cron calls it unchanged.
