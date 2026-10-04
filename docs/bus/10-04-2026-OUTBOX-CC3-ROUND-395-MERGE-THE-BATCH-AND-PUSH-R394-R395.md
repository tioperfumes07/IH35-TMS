# OUTBOX → CC-3 — ROUND 395: merge the batch, then push r394 + r395

FINDING: N/A  LANE: DOCS

## Why this is routed to you and not done by the Lead

The Lead has **no write path to GitHub in this session**, measured, three ways:

| path | result |
|---|---|
| `git push` from the Lead worktree | `fatal: could not read Username for 'https://github.com'` — no credential in the Lead's VM, by design. The Lead does not ask for one and does not handle one. |
| `gh api` | `403 — GitHub access to this repository is not enabled for this session` |
| GitHub MCP (authenticated as the owner) | **read works** (`get_me`, `list_pull_requests`, `pull_request_read`). **Every write is `403 Resource not accessible by integration`**: `create_branch`, `update-branch`, `merge`. |

Reads also confirm the state, so there is no guessing about what is left:

- **PR #25143** `claude/r393-batch-five` → `main` is **OPEN, not merged**. head `3f33bb537d`, base `cd031832c9`.
- `main` is **ee7a5fce52**, **25 commits past** that PR base. Every main-side blocker the batch was waiting on is already **ON main** (`aad80ce192`, `143391e351`, `d7e23a9497`, `88160616f6`, `0e078096f0`, `3d33a83cc5` — all verified `merge-base --is-ancestor`).
- `main` still carries the **defective** KPI panel: `LedgerKpiPanel.tsx` on `origin/main` is still `border-slate-200 bg-white` with `fmtBucket` joining every bucket by middots. The owner is still looking at that.

So: nothing is blocked any more except the push itself.

## Order of work — do not reorder

### 1. PR #25143 — update, then merge
```
gh pr merge 25143 --merge   # after GitHub's "Update branch" (or: git checkout claude/r393-batch-five && git merge origin/main && push)
```
The local Lead branch `claude/r393-batch-five` (tip `461846608c`) is already `origin/claude/r393-batch-five` **merged with current main, conflicts resolved, guards green** — if the server-side update-branch gives you any conflict, take that tip instead; it is the resolved answer.

### 2. Then push `claude/r394-kpi-tile-color-law` (tip `a1998c7c39`)
KPI-TILE-COLOR LAW — owner ruling 2026-09-04, verbatim: *"for all kpis i want different color not just white background a light color to distinguish and darker border."* `design/tokens.ts` has carried `kpiTileBg: "#F4F7FA"` / `kpiTileBorder: "#C7D2DC"` for a month; `LedgerKpiPanel.tsx` — behind **every** Banking and Factoring KPI — was still white. Guard `verify-kpi-tiles-obey-tile-color-law` + step **14421**.

### 3. Then push `claude/r395-tour-column-shows-the-number` (tip `c68ae8f2bd`, cut from the r394 tip)
The Tour column. Two cells rendered it; ROUND 167's PENDING vocabulary landed in only one, so the retired `"Open"` word kept shipping on ~15 screens — and in **both** cells PENDING and the closed-unnumbered dash were dead `<span>`s. Guard `verify-settlement-ref-cells-clickable-one-vocabulary` + step **14433**.

## BEFORE you push: run the two things the Lead could not

The Lead's shell is a **Linux aarch64** VM; this checkout's `node_modules` is the **macOS** install you use (`@rolldown/binding-darwin-arm64`, `@esbuild/darwin-arm64` are the only bindings present). Two phases therefore could not run there and are **not claimed as passing**:

1. `vitest run apps/frontend/src/components/shared/SettlementRefCell.test.tsx apps/frontend/src/components/dispatch/TourLoadRows.test.tsx`
2. `node scripts/verify-load-status-machines-agree.mjs` — the **only** failing phase of `money-pr-local-gate` on r395 (`passed=15 failed=1`). **Proven environmental, not the diff**: stashed to the unmodified r394 tip and it fails identically, with esbuild's own message *"@esbuild/darwin-arm64 is present but this platform needs the @esbuild/linux-arm64 package instead."* Confirm it is green on macOS.

**If either is red, r395 does not ship.** Report the output; do not work around it, and never `--no-verify`.

## What the Lead DID run on r395, all green
`guard --selftest 9/9 exit 0` · `guard live exit 0` · **red-before-green** (fix stashed → exit 1, naming all three real defects by file; restored → exit 0) · `apps/frontend tsc -b --force` **exit 0, zero errors** · `verify-settlement-ref-beside-load` exit 0 · `verify-presettlement-renders-pending` exit 0 · `verify-kpi-tiles-obey-tile-color-law` exit 0 · `verify-claude-green-evidence-shape` exit 0 · `verify-module-progress-not-authored` exit 0 · `verify-verify-step-numbers-unique` exit 0 (3194 step groups, 0 new collisions).

## Standing rules that still apply
- One push per branch, hooks ON. Do not rebase while CI is running (Rule 25 / Rule 29).
- No connection strings, tokens or keys in any commit, PR body, bus file or chat.
- **Nobody seeds any data anywhere** — not for proof, not for a test, in any entity.
