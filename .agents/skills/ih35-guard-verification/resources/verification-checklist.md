# IH35-TMS verification checklist

Run this before claiming done / fixed / merged / works. Every unchecked box is an unproven claim.

## Before "done"
- [ ] Identifiers (tables/columns/enums) diffed against `db/migrations/` — no phantoms.
- [ ] `cd apps/frontend && npx tsc -b` clean (ignore the pre-existing `@sentry/react` env error).
- [ ] `npx vitest run <touched files>` green.
- [ ] Block's `verify-*` scripts green; `verify-mobile-responsive-audit` → `new_vs_baseline=0` (if UI).
- [ ] New/changed table registered in `scripts/canonical-relations.json`; `verify:schema-parity --update` run.
- [ ] Every bug fix has a static guard that fails on the bug, passes on the fix.

## Before "merged" (OWNER LAW 2026-08-03: no owner-approval gate, any lane)
- [ ] Non-financial? → merge on GREEN CI (all required checks, not just one).
- [ ] Financial / migration / `accounting.*` / `catalogs.*` / `mdata.*` / dep-bump? → same merge-on-green
      rule, PLUS: independent code-review + financial-agent pass, 18-key evidence block, migrations
      validated on a LOCAL DB (proved `current_database()` ≠ prod), applied on Neon by the coder themselves.
      No `JORGE-APPROVED` — the label is DELETED.
- [ ] `hold-merge-gate` red on a PR is CORRECT only when the migration firewall check itself fails — a
      missing label is never the reason (there is no label check anymore).

## After "merged" (forensic)
- [ ] `git fetch origin`; the changed file/line is actually on `origin/main` (a squash can drop a commit).
- [ ] `GET /api/v1/healthz/shallow` → `version` == merge short-sha (deploy is live, not stale).
- [ ] Deep `/api/v1/healthz` green (Postgres/migrations/Redis/R2). UI confirmed in the browser.

## When something reads as "0 / empty / missing"
- [ ] Company context set (`SET app.operating_company_id`) before the read?
- [ ] Any swallowed error hiding the real cause? Surfaced `pg_code` / `integration_sync_log`?
- [ ] Right endpoint + params (no silent 400 from a bad sort key / stats type)?
- [ ] Synced main (`git fetch` + `gh pr list --state all` + `git pull --ff-only`) before "it's gone"?
- [ ] Re-ran with scope proven correct before claiming absence?

## Live DB (full access, OWNER LAW 2026-08-03 — verify the branch, not permission)
- [ ] Branch verified before connecting (every connection) — not an ask-first gate, a correctness check.
- [ ] `assert-neon-branch --expect-branch <X>` && before connecting (connection-string defaults to PROD).
- [ ] `current_database()` / `inet_server_addr()` verified.
- [ ] `BEGIN; SET TRANSACTION READ ONLY; … ROLLBACK` for a zero-write read; diagnostics as `scripts/*.mjs`.

## Honesty
- [ ] If a step was skipped or a check failed, said so plainly — no "should work", no hedged "done".
