# HOLD merge gate — server protection owner action

Status: **OWNER ACTION REQUIRED — not applied by PR #2706**

## Live evidence (2026-07-18)

Repository: `tioperfumes07/IH35-TMS`

Effective rules on `main` were read with authenticated `gh api`:

- Ruleset `17935054` (`hold-merge-gate`) is `active` on `~DEFAULT_BRANCH`.
- Required check `hold-merge-gate` is pinned to GitHub Actions integration `15368`.
- Required checks also include `required-checks-gate`, `build-typecheck`, and `locked-guards`.
- `bypass_actors` is empty and `current_user_can_bypass` is `never`.
- The live ruleset has **no `pull_request` rule**. Therefore committed
  `.github/branch-protection-config.json` is stale on review enforcement.
- `.github/CODEOWNERS` owns `/.github/` and the HOLD classifier/policy files with
  `@tioperfumes07`, but CODEOWNERS is advisory until the live ruleset requires code-owner review.

## Why repository code cannot close this

The required status check runs the pull request's workflow and checked-out scripts. A pull request that
changes the workflow or classifier can attempt to emit the same required check name. Pinning the check to
GitHub Actions integration `15368` blocks other apps, but it does not distinguish the trusted base-branch
workflow from a PR-authored GitHub Actions workflow.

## Exact minimal owner action

Edit live repository ruleset `17935054` and add a **Require a pull request before merging** rule with:

- Required approvals: `1`
- Dismiss stale approvals when new commits are pushed: `true`
- Require review from Code Owners: `true`
- Require approval of the most recent reviewable push: `true`
- Require conversation resolution: `true`
- Allowed merge method: `squash`

Keep the existing required-status-check rule unchanged, including:

- `hold-merge-gate`, integration `15368`
- `required-checks-gate`, integration `15368`
- `build-typecheck`, integration `15368`
- `locked-guards`, integration `15368`

Do not add a bypass actor. After saving, prove the effective rule:

```bash
gh api "repos/tioperfumes07/IH35-TMS/rules/branches/main"
gh api "repos/tioperfumes07/IH35-TMS/rulesets/17935054"
```

Acceptance:

1. Effective rules include `type: "pull_request"` with `require_code_owner_review: true`.
2. Effective rules still require `hold-merge-gate` from integration `15368`.
3. Ruleset remains `active`, targets `~DEFAULT_BRANCH`, and has no bypass actors.
4. A test PR changing `.github/workflows/hold-merge-gate.yml`,
   `scripts/verify-hold-merge-gate.mjs`, `scripts/push-gate-capability-policy.mjs`, or
   `scripts/verify-meta.json` cannot merge without `@tioperfumes07` approval.

## Stronger organization-level option

If the GitHub plan supports organization ruleset required workflows, move the HOLD decision workflow to
a separately protected policy repository and require that workflow from its default branch. That prevents
the target pull request from supplying the attesting workflow at all. Keep CODEOWNER review as defense in
depth. This is stronger than the repository-only minimum above but requires an organization ruleset and
owner authorization.
