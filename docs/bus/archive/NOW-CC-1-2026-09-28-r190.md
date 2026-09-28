# ROUND 168 JOB 1/2/3 — root cause fixed, guards shipped, ONE real blocker named — CC-1 — 2026-09-28 12:20Z
Archived: `docs/bus/archive/NOW-CC-1-2026-09-28-22.md`. PR #22987 (open, awaiting CI).

## ROUND 168 JOB 1(a) — DONE: root cause confirmed, not guessed
Retraction accepted and independently re-verified before acting. Code-level proof, not a guess:
`stop-geocode-fallback.service.ts` produces the literal string `"provider_unavailable"` in exactly
two branches, both meaning "no geocode provider configured/enabled at all" — a real API error
(billing, quota, bad creds) always produces a *different*, specific reason string
(`google_places_http_403`, `trimble_xxx`, `fetch_timeout`, etc. via `stableProviderFailureReason`).
100% of the 179 live failing rows read the exact same `provider_unavailable` string, zero exceptions
— airtight evidence this was "never configured," not a billing/quota/credential problem.

## ROUND 168 JOB 1(a) fix — DONE
Flipped `GOOGLE_PLACES_ENABLED=true` on the live Render backend (srv-d7rpem7avr4c73fhp4n0,
merge-mode env update — did not touch `GOOGLE_PLACES_API_KEY`, which I cannot read and which stays
in Render's own dashboard per the owner's standing rule). This closes the actual configuration gap
going forward through the sanctioned code path.

## ROUND 168 JOB 1(b) — proof row, WITH AN HONEST CAVEAT
Live proof exists (load 13633 pickup: lat=27.6926908, lng=-99.450206, geocode_source=ratecon_street,
precision=rooftop) but **I cannot attribute it to my own fix** and neither should anyone else yet.
See the blocker below — this specific row was NOT produced by any code in this repo.

## ROUND 168 JOB 1(c)/(d)/(e) — BLOCKED, named explicitly (not silently dropped)
The sanctioned bulk-backfill function already exists (`geocodeStopsBackfill` in
`stops-geocode-backfill.service.ts` — batches, paces provider calls at 250ms, dedupes locations,
auto-creates geofences) and needs no new code. It cannot run to completion from anywhere I have
access to:
- It calls `geocodeAddressWithEvidence`, which reads `GOOGLE_PLACES_API_KEY`/Trimble creds from
  `process.env` — those secrets exist ONLY in Render's live environment. I have no tool to read
  them, and no Render job-runner/exec tool to run code inside the live container.
- The one authenticated HTTP path that already exists and DOES have the secret
  (`POST /api/v1/dispatch/loads/:id/geocode-stops`) requires a real user session. I will not
  fabricate one.
- **What's needed from the owner/Lead**: either (a) trigger that existing endpoint per dispatchable
  load through the live app UI (already logged in), or (b) grant a Render job/exec capability so a
  coder can run `geocodeStopsBackfill(actorId, USMCA)` once for the whole company in one batch, or
  (c) tell me a different sanctioned path I'm missing. Until then, JOB 1(c)/(d)/(e) stay paused —
  not skipped, not forced with invented data.

## Live discrepancy found and run to ground, not swept aside
32 dispatched-load stops were found geocoded (geocode_source `nominatim` / `ratecon_street`) BEFORE
I could exercise my own fix. Verified this was NOT my fix and NOT any code in this repo:
- `git log origin/main --all -S"nominatim"` and `-S"ratecon_street"` under `apps/backend/src`:
  **zero matches, ever**, in the whole commit history.
- The only function in this codebase that writes `geocode_source`
  (`geocodeStopsWithClient`) can only ever write `"picker"`, `"location_existing"`, or whatever
  `geocodeAddressWithEvidence` returns (a Trimble/Google value) — never these two strings.
- `audit.row_changes` shows all 32 rows touched in a single UPDATE at exactly
  `2026-09-28 11:56:54.855724+00`, with `changed_by_user_id` / `changed_by_role` / `session_id` ALL
  NULL — a raw, direct-SQL write, not an app-layer action (the app always sets these).
**Conclusion**: someone (unknown seat, not tracked in this repo) ran an ad-hoc script directly
against the database, bypassing the sanctioned engine entirely, for these 32 rows only. I am not
claiming credit for it, and I did not build anything on top of it without saying so here.

## ROUND 168 JOB 2 — DONE
Shipped and wired into `money-pr-local-gate.mjs`:
- `scripts/verify-stops-are-geocoded.mjs` — fails when any dispatchable load has an uncoordinated
  stop. Live counts as of this check: 353 total USMCA stops (some loads soft-deleted/cancelled since
  the 381 count), 33 geocoded, 143 explicit `provider_unavailable` failures, 177 never attempted.
- `scripts/verify-geocode-provider-is-reachable.mjs` — live health check against a known-good
  address through the real code path; cannot pass from a local machine without the real API key
  (by design — this is meant to run where the secret lives).
- `scripts/verify-telematics-feed-is-live.mjs` — header comment rewritten only, per the retraction:
  now says explicitly this guard proves the position feed is alive, NOT stop-stamping/geofencing.
All three selftested; `tsc -b apps/backend` clean.

## ROUND 168 JOB 3 — DONE
14 units in `integrations.samsara_vehicles` had 2-4 duplicate Samsara-vehicle mappings each (not
just T156 as originally named — a wider systemic issue). Deduped 19 rows live (one real near-miss:
a duplicate-JOIN bug in my own DELETE briefly zeroed out unit "01"'s only mapping — caught
immediately via a post-delete count check, fixed by re-inserting the exact original row). Migration
202614490000 adds `UNIQUE(operating_company_id, local_unit_id)` — applied live, confirmed via
`pg_indexes`. Claim PR #22978 already merged; the migration file itself ships in PR #22987.
T170/T173 quiet-unit note: not independently re-checked this round — carried over as an open item.

`dispatch.stop_arrivals`: zero new rows in the last 6 hours even on the 32 now-coordinated stops —
expected, since arrival requires a real truck physically crossing the geofence, not just having
coordinates. Not yet confirmable either way until a truck actually reaches one of those stops.

## Full 90007 sweep (ROUND 166 JOB 3 holdover) — still not done
Cross-checking JPM_RECONCILIATION.csv's other blank-LOAD Faro rows (Supply Chain Management $4,000,
Hawkeye $600 x2, Refrigerx, Fuze, ES Logistics) against our invoices individually — the load-number
sweep already confirms no other FABRICATED load exists, but each of those specific rows hasn't been
checked one-by-one for correct linkage. Still pending, still named.
