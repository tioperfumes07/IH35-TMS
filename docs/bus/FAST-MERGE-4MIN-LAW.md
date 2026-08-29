# FAST MERGE · 4–5 MINUTES · OWNER LOCKED · 2026-08-12 (updated 10:15 CT)

**When:** USMCA wire sprint · owner says **FAST MERGE** (ON until Jorge says otherwise)  
**Contract:** this file + your worktree **INBOX** — not chat handoffs · not agent summaries

Jorge is **not** the messenger.

## ★ CI babysit = FAST-MERGE violation (owner 2026-08-23)

Local gate **exit 0** is merge proof. GitHub check queues (20–30 pending, docs-only behind 32 runs) are **not** a merge gate.

**Required same turn after gate PASS:** `gh pr create` → **immediately** squash-merge via API (do **not** stop on `gh pr merge` — that command checks out `main` and **breaks FAST-MERGE** when another worktree already has `main`):

```bash
gh api --method PUT repos/tioperfumes07/IH35-TMS/pulls/N/merge -f merge_method=squash
```

`gh pr merge --admin` is optional sugar **only if** it returns merged in one shot. If it errors on local `main` / worktree, that is **not** a stop — run the `gh api` line **in the same 15 seconds**. Waiting on CI after that is a violation.

**Forbidden:** `gh pr checks --watch` · waiting for required checks · asking Jorge to merge · leaving OPEN PRs while CI queues · “armed monitor on #N”.

Cursor already FAST-MERGED #14921 (claim-reserve) and #14923 (DRV-F6259) that were sitting on pending checks.

---

## Push hook vs merge proof (read this first)

| Layer | What it proves | Command |
|-------|----------------|---------|
| **Focused-green (merge proof)** | Your diff + gate + evidence | `node scripts/money-pr-local-gate.mjs` → **exit 0** |
| **Pre-push hook (often false block)** | Full `verify-static` on worktree | `branch:precheck-push` → may die at `verify-static-fallback` |

**These are not the same.** A branch can be **fully built and focused-green** while push remains blocked.

---

## ENV-VERIFY-STATIC-NO-LOCAL-PG (tracks ~54 reds · every seat)

**Board:** `docs/audit/GUARD-WORKORDERS.md` OPEN row `ENV-VERIFY-STATIC-NO-LOCAL-PG`

| Fact | Detail |
|------|--------|
| Count | **~54** pre-existing `verify-static` failures on **current main** (Codex measured 54 on focused-green tip; count drifts with main) |
| Cause class | Mostly **environment** — e.g. `connect ECONNREFUSED 127.0.0.1:59999` (guards expect local throwaway PG this worktree does not run) + unclassified main reds |
| **Not** | Proof your branch is red — run **focused gate on YOUR diff** |
| Codex status (10:15 CT) | Branch **focused-green** · mandatory push hook **still blocked** · **no bypass used yet** (honest report) |

**Consequence:** pre-push can fail for **5–20 min** on failures **you did not introduce**. That is why branches ship with the authorized push path below — **not** by skipping step 1.

---

## The 4–5 minute loop (every ship)

| Step | Time | Command / action |
|------|------|------------------|
| **1 · Gate** | ~60–90s | `node scripts/money-pr-local-gate.mjs` → **exit 0** (Cursor: `cursor-ship-preflight --body-file /tmp/pr-body.txt`) |
| **2 · Push** | ~30s | Normal `git push` first. If push dies **only** at `verify-static-fallback` on **ENV-VERIFY-STATIC** class (not your guard/selftest) → **`git push --no-verify`** — authorized; **not** bypassing step 1 |
| **3 · Open PR** | ~15s | `gh pr create …` (or skip if exists) — **do NOT** `gh pr checks --watch` |
| **4 · Merge** | ~15s | **Default:** `gh api --method PUT repos/tioperfumes07/IH35-TMS/pulls/N/merge -f merge_method=squash` **immediately** after step 1 PASS. Do not wait for checks. Do not ask Jorge. `gh pr merge --admin` that dies on “main is already used by worktree” is a **known trap** — API PUT in the same breath, not a later turn |
| **5 · Neon** | after | Money/migrations: **you** apply on Neon · prove one query |
| **6 · Next** | same turn | OUTBOX one line → start next ☐ in INBOX |

**Total wall clock: ~4–5 minutes.** Forbidden: babysitting 20 checks · asking Jorge to merge · idle after merge · **kicking Render after each merge** · **opening the next task while one of YOUR PRs is still OPEN**.

**Drain before new work (owner 2026-08-29 — CC-1 skipped step 4 from ~12:32Z, PRs piled until a sweep):** After `gh pr create` returns `N`, **same 15 seconds**, run the `gh api` PUT. Before starting anything new:

```bash
gh pr list --author @me --state open
```

If that returns rows, **merge them first**. An open PR is unshipped work. Local gate exit 0 is merge proof — GitHub `total_count: 0` checks is **not** a reason to skip step 4.

**Production deploy is not in this loop.** autoDeploy is OFF on purpose. Merging every 4 minutes is fine. Deploying after **each** merge 502s the API for the whole deploy (~3 min). Measured 2026-08-21: 9 deploys / 90 min, median gap 5.9 min — shorter than a deploy. **Cursor lead deploys every 5–10 minutes and every 5–10 merged PRs (default 5, never wait past 10) or on demand (Jorge).** Law: `docs/lockdown/NO-PER-MERGE-PROD-DEPLOY-LAW-2026-08-21.md` · `docs/lockdown/USMCA-LAUNCH-FIRST-STANDING-LAW-2026-08-22.md`. Never `trigger_deploy` because healthz SHA lags `origin/main` after one merge.

---

## Safety (unchanged)

You may fast-merge **only when ALL are true:**

1. **`money-pr-local-gate` exit 0** on **this branch tip**
2. **One FINDING** · Claude-green commit · guard on wiring fixes
3. **Tip contains `origin/main`** (`git fetch && git merge-base --is-ancestor origin/main HEAD`)
4. **USMCA only** · no invented money
5. **Your diff** — fix any failure **your** guard/selftest names; do **not** merge through a red **you** introduced

**You may ignore (do not wait for):**

- Advisory jobs · CodeQL if not required · Sonar · a11y · perf
- **`verify-static-fallback` ENV class** on main — after step 1 PASS (see push row above)
- **`build-typecheck` red on main** for unrelated guard — if step 1 passed and your diff does not touch that guard

**You may NOT:**

- Merge with **local gate FAIL**
- `--no-verify` because **your** guard/selftest failed
- `--no-verify` **before** step 1 PASS
- Claim a live SHA without healthz JSON 200 · skip OUTBOX · idle after merge
- **Call Render deploy / `trigger_deploy` / “kick ih35-tms” after a merge** (`docs/lockdown/NO-PER-MERGE-PROD-DEPLOY-LAW-2026-08-21.md`)

---

## OUTBOX lines (required)

**Shipped:**
```
<SEAT> | FAST-MERGE | gate=exit0 | push=no-verify-static-ENV-OK | merged #N @ <sha> | neon=<query|N/A> | NEXT=<task>
```

**Ready but push blocked (honest — Codex pattern):**
```
<SEAT> | FAST-MERGE-READY | gate=exit0 | push=BLOCKED-env-static-54 | branch=<name> @ <sha> | NEXT=authorized-no-verify-push-then-merge
```

---

## Read with (live only)

- `STATUS-NOW.md` · `00-CODER-START-HERE.md` · `INBOX-SYNC-LAW.md`
- Your worktree `INBOX.md`
- **Do not load:** `_SUPERSEDED-*` · `_ARCHIVED-*` · deleted root stubs (see `PURGE-MANIFEST-2026-08-12.md`)

**FAST MERGE is ON until Jorge says otherwise.**
