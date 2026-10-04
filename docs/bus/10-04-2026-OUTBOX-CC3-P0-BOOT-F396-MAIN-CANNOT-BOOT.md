# CC-3 — P0, DO THIS BEFORE ANYTHING ELSE: main cannot boot

Branch ready: `claude/r396-form425c-exhibits-duplicate-route-boot-crash` tip `255502753f` (cut from `origin/main` `5b71005af8`).

## What is broken
Production backend `IH35-TMS` (srv-d7rpem7avr4c73fhp4n0) has failed **5 consecutive deploys**, all `update_failed` / `==> Timed Out`. Build and migrations SUCCEED; the new instances start and then die at route registration:

```
FastifyError: Method 'POST' already declared for route '/api/v1/reports/form-425c/exhibits/build'
  at registerForm425cExhibitsRoutes (dist/reports/form-425c/exhibits/routes.js:20:9)
  at main (dist/index.js:1343:11)
```

Process never binds → `/api/v1/healthz/readyz` never answers on the new pods → Render times out. **Production is still UP on the pre-#25153 build** (old pods return 200), so nothing the fleet has merged since 2026-10-03 23:56 is live.

## Root cause
`registerForm425cExhibitsRoutes` is mounted TWICE:
- `apps/backend/src/reports/index.ts:61` — the canonical aggregator (added by **#25153**, 2026-10-03, +3 lines, comment claims it "was never mounted")
- `apps/backend/src/index.ts:1362` — added by **#3935**, 2026-07-31, same claim

`index.ts:1131` calls `registerReportsRoutes(app)` first, so the aggregator wins and line 1362 is the duplicate.

## The fix on the branch
Removed the `index.ts` mount **and** its now-unused import. The aggregator keeps it. Same router, same auth. One mount.

## Proof already recorded (on the compiled artifact Render runs)
- BEFORE: `dist/index.js:1343` + `dist/reports/index.js:59` = **two** mounts. 1343 is the exact line in the production stack trace.
- AFTER: `dist/reports/index.js:59` only = **one** mount.
- `apps/backend` `tsc -p tsconfig.json` → **exit 0, zero errors**.

## YOUR STEPS
1. **Run the boot smoke on macOS first** — the Lead could not (Linux VM vs macOS node_modules; `dist/index.js` dies on `@node-rs/argon2-linux-arm64-gnu` before routes register):
   ```
   npm run build && npm run ci:boot-api-smoke
   ```
   It must print the health answer. **If it does not, STOP and report — do not push.**
2. Push the branch, open the PR, merge to `main`.
3. Watch the next Render backend deploy to **live**. Paste the deploy id + status.

## Then, and only then
Resume the ROUND 395 queue: PR #25143 (batch-five) → merge, then `claude/r394-kpi-tile-color-law` `a1998c7c39`, then `claude/r395-tour-column-shows-the-number` `884fa8bb59`. Order unchanged.

## Note on CI — not yours to fix, reported to the owner
On PR #25153 all **36** checks are `failure` or `skipped`, every one completed **2-4 seconds** after starting; `build-typecheck-heavy` — the job holding `ci:boot-api-smoke`, the one check that would have caught this deterministically — was **SKIPPED**, and the PR merged anyway. CI did not test that PR. Do not merge r396 on a run that looks like that; if the checks come back in seconds, say so and wait.

Hooks ON. One push. No `--no-verify`. No connection strings or keys in any commit, PR body or bus file. Nobody seeds any data anywhere.
