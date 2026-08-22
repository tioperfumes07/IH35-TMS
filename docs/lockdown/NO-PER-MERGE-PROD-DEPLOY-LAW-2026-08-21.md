# NO PER-MERGE PRODUCTION DEPLOY (owner-locked 2026-08-21)

**This is the outage.** It was not a broken API and not a Neon lock. Coders were deploying production faster than a deploy can finish.

## Measurement (2026-08-21)

- During `pre_deploy`: `healthz` **10/10 HTTP 502**.
- Twenty minutes earlier, no deploy running: **200 in ~0.25s**.
- **9 deploys in 90 minutes.** Median gap **5.9 min**. Minimum **3.6 min**.
- Each deploy takes **~3 minutes**. Gap < duration → the service spends more time deploying than serving.
- `autoDeploy` is **OFF**. Merges do not deploy by themselves. Agents were calling Render’s deploy API with the workspace key after FAST-MERGE.
- `healthCheckPath=/api/v1/healthz/readyz` is **correct and stays**. It did **not** stop the 502s. The 502s are the deploy window.

## Cadence (owner 2026-08-22 — replaces the 30–60 minute timer)

**Why:** one deploy per merge 502s the API for ~3 minutes (measured 9 deploys / 90 min). Waiting for a huge pile makes prod stale, and a giant deploy is more likely to `update_failed`.

**Batch size:** Cursor lead deploys **every 5–10 merged PRs**.

- **Default = 5.** Count squash-merges on `origin/main` that are not in the live `healthz/shallow` `version` (`git rev-list --count <liveSha>..origin/main` — squash merge ≈ one commit).
- **Hard cap = 10.** Never wait past 10 undeployed PRs. Kick at 10 even if busy.
- **On demand:** Jorge in chat (can be **one** PR — matrix freeze class). Does not wait for 5.
- **Never 1-for-1** with FAST-MERGE. Never kick because “SHA lags main” after a single merge.
- **One in-flight.** Do not start the next until the previous is **live** and `GET https://api.ih35dispatch.com/api/v1/healthz/shallow` returns JSON `{ok:true,version}` (not 502 HTML).
- **Who may kick:** Jorge, or **Cursor lead only**. CC-1 / CC-2 / CC-3 / Codex never `trigger_deploy`.

## Law (non-negotiable)

1. **FAST-MERGE stays.** Gate → push → PR → squash. That loop is ~4–5 minutes. **Do not slow merges.**
2. **Do not deploy production on every merge.** Forbidden after a merge: `trigger_deploy`, `render deploys create`, Dashboard “Deploy latest”, MCP deploy, “kick ih35-tms because healthz SHA lags main”.
3. **Deploy main every 5–10 merged PRs** (default 5, never wait past 10) **or on demand** (Jorge). One live/in-progress deploy at a time. Wait until live + `healthz/shallow` JSON 200 as above.
4. **Who may kick:** Jorge in chat, or Cursor lead **once per 5–10 PR batch** — never per PR, never because SHA is “behind” after one merge.
5. **Live `IH35-TMS` (`srv-d7rpem7avr4c73fhp4n0`) pre-deploy** is **`npm run db:migrate` only**. `db:verify:critical-runtime` and boot smokes (`ci:boot-api-smoke`, `ci:boot-aggregate-smoke`) stay in **GitHub CI**. Verify-in-preDeploy delayed PORT bind (~6 min measured 2026-08-22) → Render `No open ports detected` → `update_failed` while prod stayed on `0cec933`. Dashboard PATCH of `preDeployCommand` is a no-op; **`render.yaml` is the control**.
6. Keep **`healthCheckPath: /api/v1/healthz/readyz`**. Do not revert to TCP-only / empty health. Live dashboard **must match** `render.yaml` (it drifted to `/api/v1/health` once).
7. **Listen before in-process workers and before the Neon drift boot query.** `app.listen()` must bind before QBO/cron/outbox init **and** before `assertMigrationDriftBootGuard`. Workers-or-Neon-before-listen starves PORT bind → `update_in_progress` then `update_failed`, prod stuck on the old SHA. Guard: `verify-g4-deploy-smoke-env-in-render` (step 1492).

## Later (not this PR)

Move outbox processor and boot-time work off the web process onto a Background Worker. **Not** Node clustering — two workers would run the outbox twice and can double-post money.

## Enforcement

- `docs/bus/FAST-MERGE-4MIN-LAW.md` · INBOX-CURSOR / PASTE-CURSOR
- `scripts/verify-g4-deploy-smoke-env-in-render.mjs` fails if FAST-MERGE / Cursor INBOX still says “Kick ih35-tms API”
- `.cursor/rules/42-no-per-merge-prod-deploy.mdc`
