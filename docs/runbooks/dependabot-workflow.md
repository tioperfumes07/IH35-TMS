# Dependabot Workflow Runbook

**Owner:** @tioperfumes07  
**Block:** GAP-DEPENDABOT-VERIFY (Wave B, Block 11)  
**Last updated:** 2026-06-06

---

## Overview

Dependabot automatically opens pull requests when npm packages or GitHub Actions have new versions. This runbook covers how to process those PRs safely in the IH35-TMS monorepo.

---

## Configuration Summary

| Ecosystem | Directory | Schedule | Reviewer |
|---|---|---|---|
| `npm` | `/` (root monorepo) | Weekly, Monday 07:00 CST | @tioperfumes07 |
| `github-actions` | `/` | Weekly, Monday 07:00 CST | @tioperfumes07 |

Config file: `.github/dependabot.yml`

---

## Weekly Process (Every Monday)

### 1. Triage incoming Dependabot PRs

```bash
gh pr list --label dependencies --state open
```

Prioritize:
1. **Security advisories** — merge same day (GitHub flags these in red)
2. **GitHub Actions** — low risk, review and merge quickly
3. **Patch updates** (x.y.Z) — merge after CI passes
4. **Minor updates** (x.Y.z) — review changelog, merge if CI green
5. **Major updates** (X.y.z) — treat as a task; schedule separate review

### 2. Check CI before merging

Every Dependabot PR must pass:
- `ci.yml` (full test suite)
- `security-checks.yml`
- `required-checks.yml`

Never merge a Dependabot PR that has failing checks.

### 3. Merge strategy

Use **squash merge** for all Dependabot PRs to keep git history clean:

```bash
gh pr merge <PR_NUMBER> --squash --delete-branch
```

Or via GitHub UI: select "Squash and merge."

---

## Enabling Dependabot in GitHub Repository Settings

> **Manual step required** — this cannot be scripted via `gh` CLI.

1. Go to: `https://github.com/tioperfumes07/IH35-TMS/settings/security_analysis`
2. Under **Dependabot**, enable:
   - [x] **Dependency graph** (may already be on)
   - [x] **Dependabot alerts** — notifies on known vulnerabilities
   - [x] **Dependabot security updates** — auto-PRs for security fixes
   - [x] **Dependabot version updates** — auto-PRs per `dependabot.yml`
3. Click **Save** on each toggle.

Once enabled, Dependabot reads `.github/dependabot.yml` and opens the first batch of PRs on the next scheduled Monday.

---

## Handling Merge Conflicts

If a Dependabot PR has a conflict with `package-lock.json`:

```bash
git checkout feature/dependabot-npm-<package>-<version>
git pull origin main
npm install   # regenerates package-lock.json
git add package-lock.json
git commit -m "chore: resolve package-lock conflict"
git push
```

---

## Ignoring a Specific Dependency Update

Add an `ignore` block to `.github/dependabot.yml`:

```yaml
  - package-ecosystem: "npm"
    directory: "/"
    ignore:
      - dependency-name: "some-package"
        versions: ["2.x"]   # skip major v2
```

---

## Security Alert Triage

If GitHub sends a **Dependabot security alert** (email or repository notification):

1. Check the alert: `https://github.com/tioperfumes07/IH35-TMS/security/dependabot`
2. If a fix PR was auto-created, review and merge immediately.
3. If no PR was created (Dependabot can't auto-fix): manually update the package or apply a `npm audit fix`.
4. Log the incident in `docs/runbooks/INCIDENT-RESPONSE.md` if severity is HIGH or CRITICAL.

---

## Useful Commands

```bash
# List all open dependency PRs
gh pr list --label dependencies --state open

# Check security alerts
gh api repos/tioperfumes07/IH35-TMS/vulnerability-alerts

# Manually trigger Dependabot (GitHub UI only — no CLI equivalent)
# Settings → Security & analysis → Dependabot version updates → "Check for updates"

# Review what npm audit finds right now
npm audit --audit-level=moderate
```

---

## References

- [GitHub Dependabot docs](https://docs.github.com/en/code-security/dependabot)
- [dependabot.yml config reference](https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/configuration-options-for-the-dependabot.yml-file)
- Repo security settings: `https://github.com/tioperfumes07/IH35-TMS/settings/security_analysis`
