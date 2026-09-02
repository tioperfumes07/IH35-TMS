# Owner handoff: `main` branch protection

Only Jorge, acting with repository-administration authority, may apply this policy. Automated builders and
CI must not change GitHub branch protection or rulesets.

## Option 1 — reviewed GitHub API request

After reviewing the payload, the owner may run this exact command from an authenticated `gh` session:

```bash
gh api --method PUT repos/tioperfumes07/IH35-TMS/branches/main/protection --input - <<'JSON'
{
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true
  },
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "required-checks / required-checks-gate",
      "ci / build-typecheck",
      "ci / verify-branch-fresh",
      "hold-merge-gate / hold-merge-gate",
      "locked-guards / locked-guards",
      "security-checks / security-audit",
      "premerge-gates / rls-migration-scan",
      "premerge-gates / typescript-strict-null",
      "premerge-gates / migration-role-validation"
    ]
  },
  "enforce_admins": true,
  "required_conversation_resolution": true,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```

The repository helper is also owner-gated. It refuses CI/build automation and exits non-zero unless both
`JORGE_AUTHORIZED_BRANCH_PROTECTION_APPLY=YES` and an admin-capable `GH_ADMIN_TOKEN` are explicitly supplied
by the owner.

After applying through either option, verify live protection separately with the owner's admin-capable
token:

```bash
GH_ADMIN_TOKEN="$(gh auth token)" node scripts/verify-ci-policy-applied.mjs
```

The verifier must print `LIVE PASS — N owner-approved contexts verified via GH_ADMIN_TOKEN` (N = length of `REQUIRED_GATE_CONTEXTS` in `scripts/verify-ci-policy-applied.mjs`, including `ui-design-system-ratchet / ui-design-system-ratchet`). A 403, 404,
or policy drift is a hard failure. Standard CI intentionally supplies no token to this verifier; it validates
the committed baseline only and prints
`BASELINE PASS — LIVE UNVERIFIED, owner handoff required`.

## Option 2 — GitHub Settings

1. Open `tioperfumes07/IH35-TMS` → **Settings** → **Branches**.
2. Under **Branch protection rules**, add or edit the rule whose branch name pattern is exactly `main`.
3. Enable **Require a pull request before merging**.
4. Set **Required approvals** to `1`.
5. Enable **Dismiss stale pull request approvals when new commits are pushed**.
6. Enable **Require review from Code Owners**.
7. Enable **Require status checks to pass before merging**.
8. Enable **Require branches to be up to date before merging**.
9. Select only these nine required checks, using the exact names shown:
   - `required-checks / required-checks-gate`
   - `ci / build-typecheck`
   - `ci / verify-branch-fresh`
   - `hold-merge-gate / hold-merge-gate`
   - `locked-guards / locked-guards`
   - `security-checks / security-audit`
   - `premerge-gates / rls-migration-scan`
   - `premerge-gates / typescript-strict-null`
   - `premerge-gates / migration-role-validation`
10. Remove performance, PASS-8, and PR-preview checks from the required-check list; those workflows
    are not universal merge gates. Security (`security-audit`) IS required — owner decision 2026-07-18.
11. Enable **Require conversation resolution before merging**.
12. Enable the control labeled **Do not allow bypassing the above settings** (or **Include administrators**
    in the classic UI) so administrators are also enforced.
13. Leave **Allow force pushes** disabled.
14. Leave **Allow deletions** disabled.
15. Save changes, then inspect the saved `main` rule to confirm the nine names and every control above.

If the repository uses **Settings** → **Rules** → **Rulesets** instead of the classic Branches screen, edit
the active `main` branch ruleset with the same target, bypass prohibition, pull-request settings, strict
required-status-check setting, exact nine checks, conversation-resolution requirement, and force-push /
deletion prohibitions.
