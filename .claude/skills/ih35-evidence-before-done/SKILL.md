---
name: ih35-evidence-before-done
description: >-
  Owner law — fix root cause, never patch, never defer without written tracker entry, evidence before
  "done". Load at session start and before any merge/ship claim. Companion to ih35-guard-verification.
  Cursor rule: .cursor/rules/16-fix-not-patch-evidence-law.mdc
---

# IH35 — Evidence Before Done (fix, don't patch)

**Rule #0 + Rule 16 bind every session.** Trust is the product. Honesty beats speed.

## 1. Diagnose to root cause (stop at symptoms)

Before coding, state in one sentence:
- **What actually failed** (log line, pg_code, constraint name, HTTP status)
- **Why the cascade happened** (e.g. invalid audit severity → aborted txn → sibling company never ran)
- **What is NOT the cause** (e.g. env keys when logs show HTTP 200)

Do not re-diagnose from memory when GUARD or live logs already proved the chain.

## 2. Fix completely (no patch)

A complete fix includes **all** of:
1. Root-cause code change (not symptom-only)
2. Isolation so one failure cannot poison siblings (txn/savepoint boundaries)
3. Valid audit/error path (severities, constraints, no silent swallow)
4. Static CI guard (`scripts/verify-*.mjs`) that **fails on the bug, passes on the fix**
5. Test when behavior is non-obvious (retry, upsert, flag predicate)

**Forbidden:** prod ad-hoc DDL, `// TODO fix later`, catch-empty, widening constraints without owner migration law.

## 3. Never defer (except owner phase law)

| Forbidden deferral | Allowed deferral |
|---|---|
| "Ship now, fix isolation later" | Jorge-approved tracker + future block id |
| "CI green is enough" | Explicit UNVERIFIED + what blocks proof |
| "User can SQL the flag for now" | Fix API + test (BUG-4 pattern) |
| Fire more backfills while rate-limited | Stop, cool down, ship throttle fix |

## 4. Evidence ladder (climb before "done")

1. **Repo** — diff, guard passes locally, vitest/tsc
2. **CI** — required-checks-gate green (not one job)
3. **Merge forensic** — fix present on `origin/main` post-squash (commits can drop)
4. **Deploy** — `/api/v1/healthz/shallow` `version` == merge sha
5. **Live behavior** — Neon row count (RLS bypass in same txn), Render log line, browser confirm

Missing step 4 or 5 → say **UNVERIFIED**, not done.

## 5. Acceptance block (paste in PR / handoff)

Use `docs/templates/ACCEPTANCE-EVIDENCE-BLOCK.md`. Minimum fields:
- ROOT CAUSE / FIX / GUARD / LIVE PROOF / REMAINING

## 6. Multi-agent (non-trivial / financial)

- **Builder** implements bounded fix
- **Independent reviewer** (`ih35-code-review`) — not the builder
- **Financial agent** (`ih35-accounting-decisions`) — VETO on money/schema
- **GUARD** proves live acceptance[]

## 7. Connectors to use (in order)

1. `git` + `gh pr checks` — branch/CI truth
2. `scripts/verify-*.mjs` — regression locks
3. Render logs — runtime errors (429, 25P02, 23514)
4. Neon MCP / gated SQL — prod schema + row proof (RLS bypass discipline)
5. Browser MCP — UI reachability after deploy

Cross-ref: `ih35-guard-verification`, Rule 16 `.cursor/rules/16-fix-not-patch-evidence-law.mdc`
