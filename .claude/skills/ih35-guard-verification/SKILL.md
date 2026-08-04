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
3. **CI green** — `build-typecheck` (the real backend compile+test), `required-checks-gate`, `hold-merge-gate`
   (migration firewall only — the label it used to also check is DELETED, OWNER LAW 2026-08-03).
   A green *individual* check is not enough; the gate is the whole required set.
4. **Merged per the rules** — every lane, including financial/migration, merges on green by the coder itself;
   no owner-approval merge label (deleted), no owner hold.
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
- **`accounting.chart_of_accounts_roles` historically needed the opco GUC, not just the lucia bypass**: its
  policy `coa_roles_company_scope` (0223) checked ONLY `app.operating_company_id` with no
  `app.bypass_rls='lucia'` escape branch, so `SET app.bypass_rls='lucia'` alone returned a FALSE 0 (89 live
  rows, TRANSP-scoped=31) — a real gap on this specific table's policy text, not a masked read. After
  `202607900000_coa_roles_rls_bypass_lucia.sql` (mirrors `202607610000_qbo_connections_rls_bypass_escape.sql`)
  is Neon-applied, the lucia bypass alone works for reads; writes still require the real
  `app.operating_company_id` (WITH CHECK unchanged — no new write authority). Until Jorge applies it on Neon,
  still `SET app.operating_company_id` for this one table.

## 4. Sync before you conclude "it's missing"
The local clone routinely lags `origin/main` by many merged PRs. `git fetch origin` + `gh pr list --state all`
+ `git pull --ff-only` BEFORE concluding work is lost or a file is absent. (Treating local `git log` as truth
has produced false "the work is gone" conclusions.)

## 5. Verify a fix can't regress
Every bug fix gets a **static CI guard** (`scripts/verify-*.mjs`) wired into `verify:arch-design`. The guard IS
the proof the fix holds. When you build a guard, prove it FAILS on the bug and PASSES on the fix.

## 6. Verify the verifier (owner-locked 2026-07-18)

- A guard file or textual wiring reference is not execution proof. Prove its failure reaches the required job.
- `ctx.run()` failures, nonzero step returns, throws, rejected promises, signals, and spawn failures all turn
  the suite red. Intentional probes use an explicit non-throwing API with focused tests.
- Before changing runner semantics, enumerate return-based steps and their existing reds. Afterward, the
  exposed-red set must match; every red is fixed with evidence, never allowlisted or hidden.
- CI de-duplication waits until wrapper execution and failure propagation are proven per control.
- Local-only edits and status lines are not shared evidence. Commit + push + independent verification are
  required before reporting a repository fix as shipped.

## 7. Live-DB verification (full access, §1 — verify the branch every time, not permission to ask)
Prefer schema truth from `db/migrations/` + public health endpoints. Coders have FULL Neon access (OWNER LAW
2026-08-03) — no need to ask before a live read; the discipline is verifying you're on the right branch, not
seeking permission: `assert-neon-branch --expect-branch` before ANY connection (neonctl connection-string
silently returns the PROD endpoint if the branch isn't positional); verify
`current_database()`/`inet_server_addr()`; use `BEGIN; SET TRANSACTION READ ONLY; … ROLLBACK` for zero-write
proof. A bare read-only `.sql` trips the hold-merge-gate classification → write diagnostics as `scripts/*.mjs`.

## 8. Durable tool mechanics (stable) vs volatile (may change — re-verify)
**Durable:** never bypass branch freshness or a real red guard — pre-push failures are classified and fail
closed; a genuine environment-only bypass requires either explicit branch-specific owner authorization or an
explicit capability preflight that names the server-required CI equivalent. CI is an independent backstop,
not permission to push stale or unverified code. Use `gh` for GitHub operations, API/JSON responses over
screenshots as the source of truth, and the health endpoint for deploy state.
**Volatile — treat as hints, re-verify before relying:** attach-to-real-Chrome for authed UI audits (Google
blocks Playwright/Chromium OAuth); `form.requestSubmit()` for some GitHub modals; reload-before-retry on a
frozen tab; specific Render/Neon MCP quirks. These rot — confirm they still hold, don't cite them as law.

---
Cross-refs: [[quality-trust-mandate]], [[recommendation-authority]], [[squash-merge-fix-loss-and-agent-push-only]],
[[live-ui-audit-confirmed-bugs]], [[bypass-mode-and-always-verify]]. The point of all of it: **trust is the
product — earn it with live proof, and be honest when you don't have it.**
