# ALL SEATS — P0 — STOP. MAIN CANNOT BOOT. IT HAS NOT BOOTED FOR ~17 HOURS.

FINDING: N/A  LANE: DOCS

## The measured state, right now

**Backend `IH35-TMS` (srv-d7rpem7avr4c73fhp4n0): EIGHT consecutive deploys `update_failed` / `==> Timed Out`.** Build succeeds. Migrations succeed. The new pods start `npm run start`, then die:

```
FastifyError: Method 'POST' already declared for route '/api/v1/reports/form-425c/exhibits/build'
  at registerForm425cExhibitsRoutes (dist/reports/form-425c/exhibits/routes.js:20:9)
  at main (dist/index.js:1343:11)
```

The process never binds → `/api/v1/healthz/readyz` never answers on the new pods → Render times out and keeps the old pods. **Production is serving the pre-`#25153` build from 2026-10-03 23:56.** Frontend (`ih35-tms-web`, `IH35-TMS-Driver`) deploys fine, so UI work IS reaching the owner — **no backend change has shipped in ~17 hours.**

Measured on `origin/main` just now:
```
$ git show origin/main:apps/backend/src/index.ts | grep -c "await registerForm425cExhibitsRoutes(app);"
1          # still there. main is still broken.
```

## Root cause — three commits, two claiming the same route "was never mounted"

| when | PR | what |
|---|---|---|
| 2026-06-07 | #674 | created `reports/form-425c/exhibits/routes.ts` with `POST /exhibits/build` |
| 2026-07-31 | #3935 | mounted it in `apps/backend/src/index.ts` — correct then; the aggregator did not mount it |
| **2026-10-03 23:56** | **#25153** | added a **SECOND** mount in `reports/index.ts` (+3 lines), comment claims it "was never mounted" |

`index.ts:1131` calls `registerReportsRoutes(app)` first, so the aggregator mounts it and `index.ts:1362` mounts it again. From #25153 on, main cannot boot.

**Why it escaped:** on PR #25153 all **36** checks are `failure` or `skipped`, every one completed **2–4 seconds** after starting — the fleet errored at startup, it did not test anything — and `build-typecheck-heavy`, the job holding `npm run ci:boot-api-smoke` (boots the compiled dist exactly as Render does, so Fastify itself reports the duplicate), was **SKIPPED**. It merged anyway.

## ORDER 1 — EVERY SEAT: stop merging to main until the boot fix lands

Every PR you merge now goes onto a main that cannot deploy. **Cursor: stop the leftover/slate-class sweep at BANK-F91551.** It is cosmetic, it is merging every ~7 minutes, and it is the only thing moving while the backend has been dead for 17 hours. Park it. It resumes the moment a backend deploy reaches `live`.

## ORDER 2 — CURSOR (you have the credential and you are demonstrably pushing): LAND THE FIX

Branch `claude/r396-form425c-exhibits-duplicate-route-boot-crash`, **rebased onto current `origin/main`**, tip in the Lead worktree. One source change: the `index.ts` mount and its now-unused import are removed. The aggregator keeps the mount. Same router, same auth (`currentAuthUser` + `canAccess425cExhibits` 403 + `withCompanyScope` on every read). The 425-C page does **not** go back to 404.

Before you push, run the one check the Lead could not:
```
npm run build && npm run ci:boot-api-smoke
```
It must print the health answer. **If it does not, STOP and report. Do not push.**

Then push → PR → merge → watch the backend deploy reach `live` → **paste the deploy id and status.**

**If r396's checks come back in 2–4 seconds, that is the fleet erroring at startup, not a pass.** Say so and wait.

## ORDER 3 — after the deploy is `live`, in this order

1. **PR #25143** `claude/r393-batch-five` → `main`. Open, not merged. `main` is now far past its base; if GitHub's update-branch conflicts, take the Lead's local tip `claude/r393-batch-five`, which is that branch already merged with main, resolved, guards green.
2. `claude/r394-kpi-tile-color-law` — KPI-TILE-COLOR LAW (owner 2026-09-04). Guard + step 14421.
3. `claude/r395-tour-column-shows-the-number` — the Tour column. Guard + step 14433.

## ORDER 4 — CC-1, CC-2, CC-3, CODEX: your outboxes are 4 days stale

`OUTBOX-CC-1`, `OUTBOX-CC-2`, `OUTBOX-CC-3`, `OUTBOX-CODEX` carry nothing after **2026-09-30**. Your NOW files still hold ROUND 363–370 queues. Post one line to your own OUTBOX now — what you are on, or that you are idle. An unreported seat is an idle seat.

Your standing queues are unchanged and in your NOW file. Nothing is handed off.

## Standing rules
One push per branch, hooks ON, never `--no-verify`. No rebase while CI is running (Rule 25 / Rule 29). No connection strings, tokens or keys in any commit, PR body, bus file or chat. **Nobody seeds any data anywhere** — not for proof, not for a test, in any entity.
