CURSOR — GO-BUILD-01. Drift checked. Deploy freeze is BROKEN. Build queue below, in order.

=========================================================================
DRIFT REPORT — checked live this turn, not assumed
=========================================================================
GOOD NEWS FIRST:
  live healthz = 20f3601, origin/main = c7ab63d57, ONLY 3 COMMITS BEHIND. The 115-commit freeze
  broke at 22:57:10Z (dep-da9m6begekts738k34v0). 627b2a3, 98cb5e51 and 20f3601c are all DEPLOYED.
  CC-2 finished the ENTIRE 78-id baseline: claims=201 bound=201 unbound=0 baseline=0, guard exits OK.

DRIFT-1 (P0, ROOT CAUSE OF THE FREEZE) — THREE CONSECUTIVE build_failed DEPLOYS:
  dep-da9kujijnfac73e61rj0  e846532   21:29Z  build_failed
  dep-da9l10142hec7387ofu0  627b2a3   21:34Z  build_failed
  dep-da9ll8942hec73896sg0  98cb5e51  22:18Z  build_failed
  Cause is named in 627b2a3's own body: T-01 made currentAuthUser return `reply`, TypeScript
  widened authUser to FastifyReply | User, and TS2339 exploded on .uuid. So MY T-01 instruction
  caused a build break. It is fixed (currentAuthUser returns null again, callers do
  `if (!authUser) return reply`), and guard 10046 now ratchets it.
  ACTION: none to fix — but the lesson is the gate. A local gate that passes while `tsc` on the
  full tree fails is not merge proof for a cross-cutting 413-file change. Add a typecheck arm to
  the money-pr-local-gate for changes touching >50 files.

DRIFT-2 (P0, LIVE, USER-FACING) — SPA AUTO-DEPLOYS, API DOES NOT:
  ih35-tms-web    autoDeploy=yes  autoDeployTrigger=commit  branch=main   (updated 22:18Z)
  IH35-TMS (API)  autoDeploy=no   autoDeployTrigger=off     branch=main
  The frontend users load rebuilds on EVERY commit to main while the API only moves when you
  trigger it. During the freeze the SPA was ~115 commits ahead of the API it calls — any UI added
  in that window calls endpoints that do not exist yet. That is a structural, recurring drift, not
  a one-off.
  ACTION: either gate the static deploy on the API SHA, or add a build-time banner when
  SPA build SHA is not an ancestor of healthz version. Owner decision — file it, do not guess.

DRIFT-3 (P1, CONFIG) — LIVE RENDER CONFIG CONTRADICTS render.yaml:
  render.yaml:18   preDeployCommand: npm run db:migrate
  LIVE on srv-d7rpem7avr4c73fhp4n0: npm run db:migrate && npm run db:verify:critical-runtime
  render.yaml:15 says explicitly: "Migrate only. db:verify:critical-runtime belongs in GitHub CI —
  running it here delayed PORT bind (~6 min measured 2026-08-22) so rolling updates died
  update_failed while prod stayed on the old SHA."
  The live dashboard has drifted BACK to the exact config the file forbids, with a documented
  incident behind its removal. This is the same class that caused the earlier freeze.
  ACTION: restore live preDeployCommand to `npm run db:migrate` ONLY. Then add a guard that fails
  if the live Render preDeployCommand differs from render.yaml (Render MCP read, not a hardcode).

DRIFT-4 (P2) — STALE PREVIEW SERVICE:
  `ih35-tms-web PR #15546` static service still running on branch chore/tracker-artifacts-sync.
  #15546 has been open since 2026-08-24. Land it or close it; the preview service goes with it.

DRIFT-5 (P1) — healthz IS RED RIGHT NOW:
  ok:false. 8 of 9 checks PASS. The single failure is `background_jobs.stale` [warning].
  Same check that has been failing all session. Root cause earlier confirmed: exactly
  integrations.qbo_inbound_sync and integrations.qbo_cdc_poll. Both are disabled by env
  (ENABLE_QBO_CDC_POLL=false, ENABLE_QBO_INBOUND_SYNC=false in render.yaml).
  A job that is deliberately OFF should not make healthz red. Either the check must exclude
  env-disabled jobs, or the jobs must be re-enabled. Right now healthz is lying about severity —
  a permanently-red warning trains everyone to ignore healthz.
  ACTION: make the staleness rule env-aware — a disabled job reports `skipped`, never `stale`.
  Guard: planted re-enable must flip it back to stale. This is the same class as the 97 guards
  that cannot fail.

=========================================================================
BUILD QUEUE — in this order
=========================================================================
B-1 (P0) T-01/T-02 LIVE PROOFS. Unblocked — 627b2a3 is deployed. Run them now:
    - no-cookie GET /api/v1/program/module-matrix?scope=system -> 401 JSON, NOT 500
    - 30 min of Render logs -> ZERO FST_ERR_REP_ALREADY_SENT
    - a live vendor PATCH succeeds AND writes an audit.audit_events row (before/after)
    CC-2 has been holding these correctly. Hand it the deployed SHA and let it close them.

B-2 (P0) VENDOR PATCH P0 IS STILL UNFIXED. #17713 filed it, nothing fixed it.
    vendors.routes.ts:764-775 (PATCH), :830-841 (deactivate), :906-919 (reactivate) still pass
    [id, authUser.uuid] into a SQL with one placeholder. Drop authUser.uuid at all 3 sites.
    Guard 10048 exists — make it actually cover the fix. LANE: this is vendors master-data, not
    money. Codex or CC-3. Blocks vendors certification and it is 30+ hours old.

B-3 (P0) DRIFT-3 + DRIFT-5 above — restore preDeployCommand, make background_jobs env-aware.

B-4 (P1) GR-2 META-GUARD — scripts/verify-guard-selftests-are-real.mjs. STILL DOES NOT EXIST.
    For every registered guard assert: exposes --selftest; --selftest plants a mutation the guard
    CATCHES (mutated source DIFFERS and guard exits non-zero); guard exits ZERO unmutated.
    Its OWN planted-failure selftest required: plant a no-op mutation into a fixture guard, assert
    the meta-guard FAILS. Wire verify-steps/NNNNN. NEVER ci.yml (Rule 17).
    Then publish the count and PUT IT IN THE RATCHET.

B-5 (P1) THE 97 STALE SELFTESTS. Baseline breakdown is UNCHANGED: selftest_failed still 97,
    registry_threshold 16, normal_mode 96, total 209, 196 names. Zero progress.
    GR-1 ratchet is live so new rot cannot land — now drain it. RE-ANCHOR (cite OLD SITE -> NEW
    SITE) or RETIRE (name the successor). NEVER a trivial green.
    Split: Codex takes dispatch/drivers/fleet/fuel; CC-3 takes the rest.

B-6 (P1) T-04 WORKER RE-PROJECTION INTERVAL. Zero refs in the service. The matrix worker still
    re-projects 3,399 cells on every request cycle. Add a minimum interval or kick only when
    last-good is older than the cache TTL. KEEP fail-closed behaviour exactly.

B-7 (P1) T-08 CT TIMEZONE. Still 334 toLocale* calls with no timeZone. Zero burn-down.
    ONE canonical formatter in lib/businessDate.ts, delete both private ctDateTime copies,
    org.companies.time_zone per company, ESLint no-restricted-syntax failing the PR, then batch
    the 334 verifying each with TZ=America/New_York forced. NEVER literal "CST".

B-8 (P1) GO-RT-01 ROUND TRIPS — both boards. Spec:
    docs/lockdown/SPEC-ROUND-TRIPS-BOTH-BOARDS-2026-08-29.md
    Board A = Load Board tab, KEEP Outbound|Return-leg layout, add NB|TR...|SB auto-columns,
    two-line cards, sort, 78vh scroll, >=15 trucks at Compact.
    Board B = the TIMELINE, a SEPARATE view. Do NOT replace the tab with calendar lanes.
    Full Rule 14 linkage declaration + the eight nothing-changes proofs are in the spec.

B-9 (P2) THE 3 HONEST REOPENS stay open and tracked, not reopened as debt:
    FACT-VERIFY-01, USER-VERIFY-01, RPT-VERIFY-01. CC-2 reopened these correctly — RPT-VERIFY-01
    claimed "S01..S07 PASS" while only 2 of 7 were bound. Do not let anyone quietly rebind them.

B-10 (P2) #15546 — open since 2026-08-24, only thing in the open-PR queue, spawning a preview
    service. Land it or close it.

=========================================================================
STANDING
=========================================================================
Deploy on the 5-10 PR cadence. You just proved what happens at 115 — three failed builds and a
2-hour freeze that blocked every seat's live proof.
Guards via verify-steps ONLY, never ci.yml / package.json / locked-guards (Rule 17).
Only CC-2 writes prod_verified. Evidence packets from every other seat.
Never trigger_deploy from CC. FAST-MERGE step 4 same 15 seconds; drain your own open PRs first.
