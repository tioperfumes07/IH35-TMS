---
name: ih35-guard-verification
description: >-
  How to VERIFY work in IH35-TMS before claiming it's done — the verify-before-claiming discipline, live-proof
  over assumption, the post-merge forensic check (a squash can silently drop a fixed commit), the false-empty
  re-run rule, deploy verification via the health endpoint, and the durable tool mechanics that keep getting
  relearned. Load this whenever you're about to say "done"/"fixed"/"merged"/"it works", reviewing another
  agent's output, or debugging why something "isn't there". Trust IS the product: never guess, always verify live.
---

# IH35-TMS — Verification discipline (GUARD)

The single most expensive failure mode here is **claiming something is true without proving it live** — a fix
that didn't land, a query returning 0 because of a masked error, a "merged" PR whose commit was dropped in a
squash. This skill is the checklist that stops those. Bundled: `resources/verification-checklist.md`.

## The core rule
**Before "done"/"fixed"/"works"/"merged", produce live proof, not an assumption.** If you can't show the
evidence (a passing test, a real endpoint response, a health-endpoint sha, a DB row), you don't know it — say
so honestly. Report outcomes faithfully: if a step was skipped or a check failed, say that plainly.

## 1. Definition of done (all five, or it's not done)
1. **Code matches the REAL schema** — identifiers diffed against `db/migrations/`, not memory (phantom
   columns/tables 500 at runtime). See the schema landmines in `ih35-tms-standards` / `CLAUDE.md §4`.
2. **Local verify green** — `tsc`, relevant `vitest`, the block's `verify-*` scripts, responsive audit
   (`new_vs_baseline=0`).
3. **CI green** — `build-typecheck` (the real backend compile+test), `required-checks-gate`, `hold-merge-gate`.
   A green *individual* check is not enough; the gate is the whole required set.
4. **Merged per the rules** — non-financial self-merge on green; financial/migration only with `JORGE-APPROVED`.
5. **Deploy verified LIVE** — poll `GET /api/v1/healthz/shallow` until `version` == your merge short-sha;
   confirm deep `/api/v1/healthz` green; for UI, confirm in the browser.

## 2. Post-merge forensic (a squash can drop your fix)
After a squash-merge, **verify the change is actually on `origin/main`** — a branch commit can be dropped
during conflict resolution (this really happened; a width fix was lost). `git fetch origin` then confirm the
file/line is present on `origin/main`, and the deployed `version` matches. Don't trust the merge button.

## 3. False-empty rule (a 0 is not proof of absence)
A count/list of **0** is often a masked failure, not truth:
- **RLS**: before any `accounting`/`catalogs`/`mdata` read, `SET app.operating_company_id` or counts lie
  (some `mdata` RLS is identity-based — a GUC read returns 0 while `n_live_tup` shows rows).
- **Swallowed errors**: an ingest/sync that catches-and-returns-empty reads as "0 found." Surface the real
  error (`pg_code`, `integration_sync_log`) before concluding nothing exists.
- **Wrong endpoint/param**: a 400/silent-400 (e.g. an invalid sort key, a wrong stats type) returns empty.
- **Rule:** on an unexpected 0/empty, RE-RUN with the scope proven correct (context set, error surfaced)
  before claiming absence. "Don't trust a string-grep systemic check" — test the actual endpoint / diff the query.

## 4. Sync before you conclude "it's missing"
The local clone routinely lags `origin/main` by many merged PRs. `git fetch origin` + `gh pr list --state all`
+ `git pull --ff-only` BEFORE concluding work is lost or a file is absent. (Treating local `git log` as truth
has produced false "the work is gone" conclusions.)

## 5. Verify a fix can't regress
Every bug fix gets a **static CI guard** (`scripts/verify-*.mjs`) wired into `verify:arch-design`. The guard IS
the proof the fix holds. When you build a guard, prove it FAILS on the bug and PASSES on the fix.

## 6. Live-DB verification (gated — ask every time, §1.5)
Prefer schema truth from `db/migrations/` + public health endpoints. If a live read is truly needed: ask
first; `assert-neon-branch --expect-branch` before ANY connection (neonctl connection-string silently returns
the PROD endpoint if the branch isn't positional); verify `current_database()`/`inet_server_addr()`; use
`BEGIN; SET TRANSACTION READ ONLY; … ROLLBACK` for zero-write proof. A bare read-only `.sql` trips the
hold-merge-gate → write diagnostics as `scripts/*.mjs`.

## 7. Durable tool mechanics (stable) vs volatile (may change — re-verify)
**Durable:** CI is the authoritative gate (husky pre-push fails on uninstalled backend deps → commit/push
`--no-verify`); `gh` for all GitHub ops; API/JSON responses over screenshots as the source of truth; the
health endpoint for deploy state.
**Volatile — treat as hints, re-verify before relying:** attach-to-real-Chrome for authed UI audits (Google
blocks Playwright/Chromium OAuth); `form.requestSubmit()` for some GitHub modals; reload-before-retry on a
frozen tab; specific Render/Neon MCP quirks. These rot — confirm they still hold, don't cite them as law.

---
Cross-refs: [[quality-trust-mandate]], [[recommendation-authority]], [[squash-merge-fix-loss-and-agent-push-only]],
[[live-ui-audit-confirmed-bugs]], [[bypass-mode-and-always-verify]]. The point of all of it: **trust is the
product — earn it with live proof, and be honest when you don't have it.**
