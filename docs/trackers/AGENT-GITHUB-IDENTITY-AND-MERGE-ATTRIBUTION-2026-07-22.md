# Agent GitHub identity + merge attribution

**Date:** 2026-07-22  
**Status:** OWNER-APPROVED TO IMPLEMENT (chat 2026-07-22 — Jorge: follow recommendations)  
**Owner:** Jorge (`tioperfumes07`)  
**Problem class:** audit / trust / non-repudiation — not product Law §9 wiring

---

## 1. Defect (proven tonight)

All GitHub API actions from Cursor and Claude coder currently authenticate as **`tioperfumes07`**.

Observable effects:

| Signal | Reality |
|---|---|
| `gh api user` from agent shells | `{ login: tioperfumes07, type: User }` |
| PR merge actor | Same login as Jorge |
| `JORGE-APPROVED` label add | Same login as Jorge |
| Timeline "who approved / who merged" | **Cannot distinguish human owner from agent** |

This is an **attribution collapse**. It enabled (and will again enable) false confidence that a label or merge was Jorge’s act when it was an agent’s.

Tonight’s concrete risk case: coder merged **#3149** after a **stale** `JORGE-APPROVED` (label applied before later commits). Jorge later re-approved in chat — process recovered — but GitHub history alone would not have proven who acted.

**Hardline:** court / CPA / auditor honesty requires knowing whether the human owner or a machine performed a gated act.

---

## 2. Recommendation (locked shape)

### Prefer: dedicated machine user (not a shared PAT on Jorge)

Create a **separate GitHub user** used only by automation:

| Field | Value |
|---|---|
| Suggested login | `ih35-agent-coder` (or `ih35-tms-bot`) |
| Account type | Personal User (or org Bot if GitHub Org Bot is available) |
| Role on repo | Collaborator with write + merge on allowed PRs |
| Credentials | Fine-grained PAT or GitHub App installation token — **never** Jorge’s password / SSO session |
| Storage | Cursor / Claude secrets store only — **never** committed |

### Optional later upgrade: GitHub App

A GitHub App (`IH35 Agents`) with installation on `tioperfumes07/IH35-TMS` is cleaner long-term (per-permission scopes, rotatable, actor shows as bot). Phase 2 after the machine user works.

### Do not

- Continue merging/labeling as `tioperfumes07` from agent shells once the machine account exists.
- Put Jorge’s primary PAT in shared agent configs.
- Claim “owner approved” from timeline alone while actor login == Jorge and agents also use that login.

---

## 3. Who may do what (policy)

| Action | Jorge (`tioperfumes07`) | Machine agent (`ih35-agent-coder`) |
|---|---|---|
| Push feature branches | Yes | Yes |
| Open / update PRs | Yes | Yes |
| Apply `JORGE-APPROVED` | **Yes only** | **Forbidden** |
| Merge financial / migration / held-gate PRs | **Yes only** (until App rules encode this) | Forbidden unless label present **and** freshness rules pass |
| Merge pure docs / non-financial wiring (per standing waiver) | Yes | Yes, with `Actor:` trailer |
| Neon apply / flag ON / GL math | Jorge only | Never |

Standing Law §9 **wiring** waiver (chat 2026-07-21) still allows agents to merge true wiring without per-PR chat OK — **after** this identity split, those merges must show the **machine** actor, not Jorge.

---

## 4. Required commit / PR trailers (agents)

Every agent commit and every agent merge comment must include:

```
Actor: cursor|<session-or-agent-id>
# or
Actor: claude-coder|<session-or-agent-id>
```

PR body must include a one-line:

```
Merged-by-agent: yes | no
Agent-identity: ih35-agent-coder
```

Human Jorge merges omit `Merged-by-agent` or set `no`.

---

## 5. Freshness rule for `JORGE-APPROVED` (codify)

Already used tonight; make permanent:

1. Label `JORGE-APPROVED` is valid only if applied **after** the PR head SHA that will be merged.
2. If `git push` lands new commits after the label → label is **stale** → agent must **not** merge until Jorge re-labels (or re-says OK in chat for that SHA).
3. Agents must record in the merge comment:

```
Approved-at-SHA: <sha>
Merged-SHA: <sha>
Actor: <machine login>
```

A later CI guard may enforce (2); until then agents treat stale approval as hard fail.

---

## 6. Owner setup checklist (Jorge — human steps)

Agents cannot create the GitHub account for you. Do this once:

1. **Create** GitHub user `ih35-agent-coder` (or chosen name) with a unique email you control.
2. **Invite** that user as collaborator on `tioperfumes07/IH35-TMS` with **Write** (and merge permission if your org rules require it).
3. **Create** a fine-grained PAT for that user:
   - Contents: Read/Write  
   - Pull requests: Read/Write  
   - Metadata: Read  
   - (Optional) Workflows: only if agents must re-run workflows  
   - **No** admin, **no** secrets write, **no** org ownership
4. **Store** the PAT in:
   - Cursor Cloud / local agent secret as `GH_TOKEN` / `GITHUB_TOKEN` for agent sessions  
   - Claude coder’s secret store the same way  
   - **Do not** put it in the repo, `.env` committed files, or chat
5. **Verify** from an agent shell:

```bash
gh api user --jq '{login,id,type}'
# MUST print ih35-agent-coder (or chosen bot), NOT tioperfumes07
```

6. **Branch protection / ruleset** (recommended same day):
   - Require `JORGE-APPROVED` label for paths matching financial/migration globs (if Rulesets support path filters; else keep chat+label discipline).
   - Optionally restrict who can apply `JORGE-APPROVED` to Jorge only (GitHub cannot always enforce label actor; treat as process + audit).

7. **Revoke / rotate** any agent-held PAT that authenticates as `tioperfumes07`.

---

## 7. Agent config changes (after Jorge stores the token)

| Surface | Change |
|---|---|
| Cursor agent shells | `GH_TOKEN` / `gh auth` = machine account |
| Claude coder | Same |
| Coord / babysit scripts that call `gh pr merge` | Must fail closed if `gh api user` login == `tioperfumes07` once cutover flag is on |
| Docs | This file + pointer from `CLAUDE-CODER-MERGE-SEQUENCE-*.md` |

Cutover flag (optional env): `IH35_REQUIRE_AGENT_GH_IDENTITY=1` — when set, merge helpers refuse if actor is Jorge’s login.

---

## 8. Optional CI guard (follow-up PR — not blocking setup)

Add `scripts/verify-agent-merge-attribution.mjs` (Rule 17: verify-steps only, no package.json thrash) that:

- On PRs authored by known agent patterns, require `Actor:` trailer in latest commit message, **or**
- Fail if a bot workflow claims owner approval without label freshness metadata.

Ship after the machine account exists so the guard has a real allowlist (`ih35-agent-coder`).

---

## 9. Acceptance (this decision pack)

| # | Criterion | Evidence |
|---|---|---|
| A1 | Doc merged to `main` | This PR |
| A2 | Jorge creates machine user + PAT + repo access | Owner checklist §6 — **Jorge** |
| A3 | Agent `gh api user` ≠ `tioperfumes07` | Shell proof after cutover |
| A4 | Next agent merge shows machine actor on PR timeline | GitHub UI |
| A5 | `JORGE-APPROVED` only applied by Jorge | Process + spot-check |
| A6 | Stale-approval merge forbidden | Agents + later CI |

Until A2–A4 land, **LIVE PROOF of attribution fix = UNVERIFIED** — doc alone does not fix the defect.

---

## 10. Relation to Law §9 / merge sequence

- Does **not** replace financial `JORGE-APPROVED` + Neon owner-apply gates.
- Complements `docs/trackers/CLAUDE-CODER-MERGE-SEQUENCE-2026-07-21.md` (wiring waiver, #3149-before-#3171, scoreboard).
- After cutover: Claude coder merges under machine identity; Jorge’s login on a merge means Jorge merged.

---

## 11. One-line owner summary

**Create `ih35-agent-coder`, give agents only that token, keep `JORGE-APPROVED` and Neon on Jorge’s hands, require `Actor:` trailers, refuse stale approvals.**

That restores a trustworthy audit trail without slowing Law §9 wiring.
