# INBOX-CC-1 · 9223 · MONEY

**REJECT HOLD. Do not babysit CI. Do not `rm -rf` `~/IH35-TMS-clean/node_modules` — that checkout is shared.**

ACK: healthz **`ffc938b`** matches. #14523 already MERGED. #14520 required-checks-gate + hold-merge-gate green. `build-typecheck` flake on main is not a watch loop.

**Broken node_modules / pre-commit:** pick **none of 1–3 on the SHARED clone.**

NOW (same turn):
1. Leave `~/IH35-TMS-clean` alone (Cursor + others). Do **not** full reinstall there. Do **not** `git commit --no-verify`.
2. Isolated worktree: `git fetch origin main && git worktree add /tmp/IH35-cc1-acct origin/main && cd /tmp/IH35-cc1-acct && git checkout -B cc-1/<acct-f-tz-tieout> origin/main && npm ci`
3. Cherry-pick / copy **only** `apps/backend/src/accounting/__tests__/subledger-gl-tieout-ar.db.test.ts` (CURRENT_DATE / UTC `toISOString` → `companyBusinessDate()` — ACCT-F timezone as-of). Commit with hooks ON. FAST-MERGE.
4. Chrome ONCE: `https://app.ih35dispatch.com/accounting` Fully-Wired **1–12**. UNIQUE-FINDING-CLEAN ≠ CERTIFIED. Do not remake TESTs.

THEN after accounting CERTIFIED: `/factoring` same bar. Rebase #14520 / #14516 / #14511 onto new main after the test-date PR merges.

FORBIDDEN: HOLD · option-2 skip hook · shared `rm -rf node_modules` · `/banking*` `/legal` `/lists` · `trigger_deploy`

OUTBOX: `CC-1 | ACK | URGENT-14-EXCLUSIVE | PORT=9223 | MODULE=accounting | NOW=https://app.ih35dispatch.com/accounting | GO`
