# CI/CD Policy — IH35-TMS

**Block:** CLOSURE-22 (wave C-12 lane A)  
**Owner:** Jorge (`tioperfumes07`)

## Branch naming

- Feature: `feat/<area>-<short-description>`
- Closure waves: `closure/<block-slug>`
- Fixes: `fix/<area>-<short-description>`

## Pull requests

- Target `main` only via PR (no direct pushes once branch protection is applied).
- Keep PRs scoped to one closure block or one product fix.
- Resolve all review threads before merge (`required_conversation_resolution`).

## Required checks (summary)

| Check | Workflow |
|-------|----------|
| Aggregator gate | `required-checks / required-checks-gate` |
| Build + guards | `ci / build-typecheck` |
| Branch freshness | `ci / verify-branch-fresh` |
| Performance budgets | `perf-budget-check / perf-audit` |
| Security audits | `security-checks / security-audit` |

Authoritative list: `.github/branch-protection-config.json`.

## CODEOWNERS

Critical paths (migrations, QBO sync, USMCA, `render.yaml`, `.github/`) require owner review.

## Deploy windows

- Prefer Tue–Thu morning (US/Central) for production-impacting merges.
- Avoid Friday afternoon deploys unless incident response.
- Use Render rollback for bad deploys; use Neon PITR for data issues (see `DISASTER-RECOVERY.md`).

## Production deploy approval

- `deploy-approval.yml` uses GitHub Environment `production` (manual approval).
- Render may still auto-deploy on `main`; the workflow records the human gate and audit trail.

## Applying branch protection

After this block merges:

```bash
GH_ADMIN_TOKEN=<token-with-admin:repo> node scripts/ci-apply-branch-protection.mjs
node scripts/verify-ci-policy-applied.mjs
```

## Rollback

1. **App regression:** Render → service → Deploys → Rollback to last green.
2. **Schema/data:** Follow `BACKUP-RESTORE-DRILL.md` and `DISASTER-RECOVERY.md`.
3. **CI policy drift:** Re-run `ci-apply-branch-protection.mjs`; CI guard `verify-ci-policy-applied.mjs` flags gaps.
