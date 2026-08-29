# MATRIX TRUST REGISTER — everything that can still make the board lie or hide
**Date:** 2026-08-29 21:00Z · **Author:** Claude (lead) · **Goal:** you can look at the matrix and believe it

Ordered by **what breaks trust**, not by effort. Every item verified live this session.

---

## T-01 · P0 · THE MATRIX RETURNS 500 WHEN YOUR SESSION EXPIRES — 36 ROUTES

**This is why you cannot trust the board.** Live Render logs, `srv-d7rpem7avr4c73fhp4n0`,
20:23:42Z and 20:44:49Z, two different instances:

```
FST_ERR_REP_ALREADY_SENT  statusCode: 500
"Reply was already sent, did you forget to return reply in
 /api/v1/program/module-matrix?scope=system (GET)?"
```

**Root cause, confirmed in source:**
`apps/backend/src/auth/session-middleware.ts:72-78` — `requireAuth()` calls
`reply.code(401).send({error:"unauthorized"})` and returns `false`.
Every caller then does:

    if (!requireAuth(req, reply)) return;          // <-- returns undefined

Returning `undefined` from an **async** Fastify handler after the reply is already sent triggers
Fastify's error handler, which converts a clean **401** into a logged **500**.

**Blast radius, measured:** `grep -c "if (!requireAuth(req, reply)) return;"` → **36 routes.**
Occurrences of the correct `return reply;` form → **0.** Not one route in the codebase does it right.

Affected files include `program/audit-scoreboard.routes.ts` (the matrix itself),
`program/program-board.routes.ts`, all six `integrations/relay-payments/*`, six `admin/*`,
four `dispatch/*`, `audit/spine-events`, `mdata/*`, `reports/categories`.

**Why it destroys trust specifically:** when your session expires, the SPA gets a 500 instead of a
401. `ModuleMatrixSystemView.tsx` renders **"API FEED UNAVAILABLE — showing Required skeleton"** —
so the board tells you *the system is broken* when the truth is *you are logged out*. You cannot
tell a real outage from an expired cookie. That is precisely the class of defect we have been
killing all day: **a surface reporting the wrong reason for an empty state.**

**THE FIX IS VERTICAL — this is the textbook example of what you asked about.**
One-line change at 36 call sites: `return;` → `return reply;`. One guard. One planted selftest.
Every affected surface across the app is corrected at once. Do NOT fix only the matrix route.

---

## T-02 · P0 · VENDORS PATCH IS 100% BROKEN — and it corrects something I told you

CC-2 found this going to close vendors (PR **#17713**, merged 20:53Z). Their work was exactly right
and it corrects **my** assessment from two hours ago.

PR #17265 (2026-08-28) replaced the membership subquery
`org.user_company_access uca ... WHERE uca.user_id = $2::uuid` (2 placeholders) with the zero-arg
`SELECT org.user_accessible_company_ids()` — but left all three call sites passing
`[id, authUser.uuid]` against SQL that now has only `$1`. node-postgres rejects it at the bind
protocol level.

**Dead endpoints:** `vendors.routes.ts:764-775` (PATCH), `:830-841` (deactivate),
`:906-919` (reactivate).
**Live proof:** Chrome on `ecd3afd`, red toast *"bind message supplies 2 parameters but prepared
statement requires 1"*. Neon: last successful `mdata.vendors.updated` audit event is
**2026-08-28T15:16:54Z — zero vendor updates in ~29 hours.**

**My error, stated plainly:** I told you vendors clears "L6 and editability" and is the shortest
path to a first done module *because* it has `PATCH /api/v1/mdata/vendors/:id`. **I verified the
route existed. I never verified it worked.** That is the exact "code-reading is not verification"
mistake I have been flagging in everyone else. Vendors is still the closest module — 7/7 bound —
but it does **not** clear editability, and it cannot be certified until this is fixed.

**Fix:** drop `authUser.uuid` from the params array at all three sites. **Ship a guard that
mutation-proves param-count vs placeholder-count** — this defect class is invisible to TypeScript
and will recur.

---

## T-03 · P1 · THE BOARD HAS NO "WHY IS THIS CELL EMPTY" — you are splitting by hand

The matrix shows Box 3 (BUILT) and Box 4 (LIVE) but never says **why** a cell is empty. Those two
causes need completely different work:

- **Box 3 empty** = the wiring does not exist → a DEFECT, usually **vertical**
- **Box 4 empty, Box 3 green** = code may be fine, nobody proved it → an **ERRAND**, never vertical

Today you are doing that split manually per module. **Add a per-cell state that distinguishes
`not_built` from `built_unproven`,** surfaced in the cell tooltip and in the API payload. That one
distinction turns the matrix from a scoreboard into a work queue and stops seats from "fixing"
things that only need observing.

---

## T-04 · P1 · THE WORKER RE-PROJECTS ON EVERY REQUEST CYCLE

`kickMatrixComputeOffThread()` is called on **every** `buildSystemModuleMatrix` request
(`module-matrix.service.ts:1979, 1984, 1990`), and `matrixWorker` is set to `null` on worker exit —
so the next request spawns a brand-new full projection.

Observed live: `[matrix] worker last-good ready` at 20:23:02, 20:23:28, 20:45:23, 20:46:03,
20:50:36 — **five full projections of 3,399 cells in 27 minutes.**

Not a lie, but it burns CPU on the API box and makes the board feel slow, which erodes trust in its
own way. Add a **minimum re-projection interval** (or only kick when the last-good is older than
the cache TTL). Keep the fail-closed behavior exactly as is.

---

## T-05 · P2 · `program-scoreboard.json` HAS NO `rows` KEY — **DECIDED 2026-08-29 (Cursor)**

**Verdict:** not needed. **Do not add `rows`.**

Program artifact keys: `healthzSha, generated_at, meta, modules, prod, chain, chainMoney, chainReverse, guard, live_scenario_probe, recentActivity`. The 13-gate **module table is `modules`**. Consumers: `gen-program-scoreboard.mjs` → `programScoreboard.data.ts` (`modules`); `audit-scoreboard.routes.ts` (`recentActivity`, live parse); matrix probes `live_scenario_probe.modules`.

**`rows` belongs to class-scoreboard** (`apps/frontend/src/pages/program/classScoreboard.data.ts`). Mapping `CLASS_SCOREBOARD.rows` is a different file; mixing it with program JSON would empty the wrong grid.

Ratchet: `gen-program-scoreboard.mjs` fails if `rows` appears on the program JSON.

Now regenerating correctly — `healthzSha` / `generated_at` are independent of this decision.

---

## T-06 · P1 · 97 GUARDS THAT CANNOT FAIL (open)

Unchanged and still the most dangerous item in the repo. A guard whose selftest no longer plants a
failure is a green light with nothing behind it — including a **cents/dollar scale guard on
escrow**. Cascade re-measures today's count; Cursor lands GR-1 (names, shrink-only) **before**
anyone repairs a guard. Wire via `verify-steps/NNNNN`, never `ci.yml` (Rule 17).

---

## T-07 · P1 · 15 MODULES FLAGGED `complete: true` WITH NO BINDING

Seven have **zero** bound evidence: compliance 0/9 · customers 0/10 · fleet 0/7 · fuel 0/9 ·
home 0/1 · program 0/7 · tasks 0/5. Largest lies: maintenance 39 items/1 bound, safety 38/1.
Bind or REOPEN. `complete:true` with zero binding is the same defect as the old matrix banner.

---

## T-08 · P2 · 334 TIMESTAMPS RENDER IN THE VIEWER'S TIMEZONE

334 `toLocale*` calls with no `timeZone` vs 10 with; 50 files hardcode `America/Chicago`;
2 duplicate `ctDateTime` copies. Correct only because you sit in Central. **Do not hardcode "CST"** —
it is UTC-6 and only applies Nov–Mar; today is CDT. Use IANA `America/Chicago`, label "CT".

---

## T-09 · P2 · THE STOP HOOK CANNOT TELL WORK FROM A READ-ONLY CHECKOUT

`~/.claude/stop-hook-git-check.sh` fires on any working-tree difference, including files that are
**byte-identical to `origin/main`** because someone checked out main content to read it. It has
told me twice today to commit other seats' already-merged code under my name. It should skip paths
that already match `origin/main`. Same class as the guard rot: **a check that fires on the wrong
thing trains people to ignore it.**

---

## T-10 · P2 · #15546 HAS BEEN OPEN 5 DAYS

`chore(tracker): auto-refresh reconcile + phase-manifest artifacts`, open since 2026-08-24. It is
the only thing in the open-PR queue. Land it or close it — a permanently-open PR trains every seat
to ignore the `gh pr list --author @me --state open` check that CC-1 specifically needs to adopt.

---

## THE COMMON THREAD

T-01, T-03, T-05, T-06, T-07 and the now-fixed matrix banner are all **one defect class**:

> **A surface reports a status that is not the true state of the thing it describes.**

An expired session shows as an outage. An unproven item shows as complete. A guard that cannot
fail shows as green. An empty cell does not say why it is empty.

**The test for anything before it ships tonight: could this claim be proven false if it were wrong?**
If not, it is not evidence — it is decoration.
