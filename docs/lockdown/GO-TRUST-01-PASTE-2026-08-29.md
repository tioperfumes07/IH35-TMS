CURSOR — GO-TRUST-01. Two NEW P0s found live this turn. T-01 is why the owner cannot trust the matrix.

=========================================================================
T-01 (P0) — THE MATRIX RETURNS 500 WHEN A SESSION EXPIRES. 36 ROUTES. VERTICAL FIX.
=========================================================================
LIVE EVIDENCE — Render srv-d7rpem7avr4c73fhp4n0, 20:23:42Z and 20:44:49Z, two instances:
  FST_ERR_REP_ALREADY_SENT  statusCode: 500
  "Reply was already sent, did you forget to return reply in
   /api/v1/program/module-matrix?scope=system (GET)?"

ROOT CAUSE (confirmed in source, not inferred):
  apps/backend/src/auth/session-middleware.ts:72-78
    requireAuth() does reply.code(401).send({error:"unauthorized"}) then returns false.
  Every caller then does:
    if (!requireAuth(req, reply)) return;        <-- returns UNDEFINED
  Returning undefined from an ASYNC Fastify handler after the reply was already sent trips
  Fastify's error handler, which turns a clean 401 into a logged 500.

BLAST RADIUS — measured, not estimated:
  grep -c "if (!requireAuth(req, reply)) return;"   -> 36 routes
  grep -c "if (!requireAuth(req, reply)) return reply;" -> 0
  NOT ONE ROUTE IN THE CODEBASE DOES IT CORRECTLY.
  Files include: program/audit-scoreboard.routes.ts (THE MATRIX), program/program-board.routes.ts,
  all 6 integrations/relay-payments/*, 6 admin/*, 4 dispatch/*, audit/spine-events.routes.ts,
  mdata/qbo-autocomplete, mdata/driver-hire-date-apply, reports/categories.

WHY THIS IS THE TRUST BUG:
  When the owner's session expires, the SPA gets a 500 instead of a 401, so
  ModuleMatrixSystemView.tsx renders "API FEED UNAVAILABLE — showing Required skeleton".
  THE BOARD SAYS THE SYSTEM IS BROKEN WHEN THE TRUTH IS THE OWNER IS LOGGED OUT.
  He cannot tell a real outage from an expired cookie. That is the same defect class as the
  "computing in the background" banner: a surface reporting the WRONG REASON for an empty state.

THE FIX IS VERTICAL. THIS IS THE TEXTBOOK CASE.
  One-line change at all 36 sites:  return;  ->  return reply;
  DO NOT fix only the matrix route. Fix all 36 in one PR.
  GUARD: mutation-provable — plant "return;" back into a fixture route and assert the guard FAILS.
  Wire as scripts/verify-steps/NNNNN-*.mjs. NEVER ci.yml / package.json (RULE 17).
  FRONTEND: ModuleMatrixSystemView.tsx must distinguish 401 from 5xx. A 401 renders
  "SESSION EXPIRED — sign in again", never "API FEED UNAVAILABLE".

VERIFY (paste all four):
  1. grep count of the bad form on origin/main -> 0
  2. guard selftest: planted "return;" FAILS, clean form PASSES
  3. Render logs 30 min after deploy: ZERO FST_ERR_REP_ALREADY_SENT
  4. Live: hit /api/v1/program/module-matrix?scope=system with no cookie -> clean 401 JSON, not 500

=========================================================================
T-02 (P0) — VENDORS PATCH 100% BROKEN. Blocks the vendors close-out.
=========================================================================
CC-2 filed this correctly as #17713 (merged 20:53Z) and did NOT fake a pass. Good GUARD work.
PR #17265 (2026-08-28) swapped the membership subquery
  org.user_company_access uca ... WHERE uca.user_id = $2::uuid    (2 placeholders)
for the zero-arg
  SELECT org.user_accessible_company_ids()                        (1 placeholder)
but left all 3 call sites passing [id, authUser.uuid]. node-postgres rejects at bind level.
DEAD: vendors.routes.ts:764-775 (PATCH), :830-841 (deactivate), :906-919 (reactivate).
LIVE PROOF: Chrome on ecd3afd -> red toast "bind message supplies 2 parameters but prepared
statement requires 1". Neon: last successful mdata.vendors.updated audit event 2026-08-28T15:16:54Z
-- ZERO VENDOR UPDATES IN ~29 HOURS.
FIX: drop authUser.uuid from the params array at all 3 sites.
GUARD REQUIRED: mutation-prove PARAM COUNT vs PLACEHOLDER COUNT. TypeScript cannot see this class
and it WILL recur. Sweep for the same shape anywhere else user_accessible_company_ids() was
introduced by #17265.
NOTE FOR THE BOARD: this does NOT falsify the 7 bound VEND-* items (none claimed a live PATCH
mutation) but it DOES block flipping vendors complete. CC-2 called that correctly.

=========================================================================
T-03 (P1) — THE BOARD NEVER SAYS WHY A CELL IS EMPTY
=========================================================================
Box 3 empty = wiring does not exist -> a DEFECT, usually VERTICAL.
Box 4 empty + Box 3 green = code may be fine, nobody proved it -> an ERRAND, NEVER vertical.
Those need completely different work and the owner is splitting them BY HAND right now.
ADD a per-cell state distinguishing not_built from built_unproven, in the API payload AND the cell
tooltip. This turns the matrix from a scoreboard into a work queue and stops seats "fixing" things
that only need observing.

=========================================================================
T-04 (P1) — THE WORKER RE-PROJECTS 3,399 CELLS ON EVERY REQUEST CYCLE
=========================================================================
kickMatrixComputeOffThread() is called on EVERY buildSystemModuleMatrix request
(module-matrix.service.ts:1979, 1984, 1990) and matrixWorker is nulled on exit, so the next request
spawns a fresh full projection.
OBSERVED LIVE: "[matrix] worker last-good ready" at 20:23:02, 20:23:28, 20:45:23, 20:46:03,
20:50:36 — FIVE full 3,399-cell projections in 27 minutes.
Not a lie, but it burns API CPU and makes the board feel slow, which erodes trust its own way.
Add a MINIMUM RE-PROJECTION INTERVAL (or only kick when last-good is older than the cache TTL).
KEEP the fail-closed behavior exactly as it is. Do not trade honesty for speed.

=========================================================================
T-05 (P2) — program-scoreboard.json HAS NO rows KEY
=========================================================================
Now regenerating correctly (healthzSha ecd3afd, generated_at 20:25:17Z, matches live — FIXED).
But there is no `rows` key at all. Either nothing needs it — then assert that — or a consumer is
silently getting undefined and rendering an empty section. DECIDE AND DOCUMENT WHICH.

=========================================================================
ALSO ON THE REGISTER (already assigned, tracking only)
=========================================================================
T-06  97 guards that cannot fail — GR-1 ratchet FIRST (names, shrink-only), then repair. verify-steps.
T-07  15 modules flagged complete:true, 7 with ZERO bound evidence (maintenance 39/1, safety 38/1).
T-08  334 timestamps render in the viewer's timezone. Use IANA America/Chicago, label CT. Never "CST".
T-09  ~/.claude/stop-hook-git-check.sh fires on read-only checkouts of origin/main content. It has
      twice told me to commit other seats' merged code under my name. Skip paths identical to
      origin/main. A check that fires on the wrong thing trains people to ignore it.
T-10  #15546 open since 2026-08-24, the only thing in the open-PR queue. Land it or close it.

=========================================================================
SEQUENCE
=========================================================================
1. T-01 (36 routes, one PR, one guard) — this is what buys the owner a trustworthy board.
2. T-02 vendors bind-param + param-count guard — unblocks the first genuinely-done module.
3. T-03 not_built vs built_unproven — turns the board into a work queue.
4. T-04 worker interval. 5. T-05 rows key.
Deploy on the 5-10 PR cadence throughout.

THE COMMON THREAD — T-01, T-03, T-05, T-06, T-07 and the fixed matrix banner are ONE class:
A SURFACE REPORTS A STATUS THAT IS NOT THE TRUE STATE OF THE THING IT DESCRIBES.
An expired session shows as an outage. An unproven item shows as complete. A guard that cannot fail
shows as green. An empty cell does not say why.
TEST FOR ANYTHING SHIPPING TONIGHT: could this claim be proven false if it were wrong?
If not, it is not evidence — it is decoration.
