# LANE COLLISION PROTOCOL — permanent, all coders

**Owner-requested 2026-08-07. CANONICAL — this file supersedes the two documents below.
Enforced by `scripts/verify-lane-territory.mjs` + `scripts/verify-hotfile-single-open-pr.mjs`
(`LAW-2026-08-07-LANE-TERRITORY`). Load at the start of every session.**

## 0. METHOD — VERTICAL SWEEP BY CLASS (states the owner's permanent method; every lane order must)

Work is drained **VERTICALLY, by CLASS, globally and universally** — one defect class swept across the
whole system at once. **Not module-by-module. Not the old block way.** Pick the class, sweep it
globally against repo *and* prod, classify ORIGIN before calling any gap a defect, fix the root cause
once in one PR, ship one mutation-proven ratcheting guard, and call the class drained only at zero live
instances **and** a guard that exists. Modules certify LAST, from drained classes.

This section exists because `LAW-2026-08-07-VERTICAL-METHOD` requires **every** file in
`docs/standing-orders/` to state the method — the rule was already in all four lane orders and a lane
still reverted, which is the argument for a guard over prose. A new standing order that omitted it
would quietly reopen that hole, so `scripts/verify-vertical-method-law-present.mjs` fails the build
until it is here. **Never delete the method line to make that guard pass.**

Lane territory (below) is the *collision* rule and is orthogonal: it says WHO may touch a file, not
HOW work is sequenced. Both apply at once.

## Supersedes (drift resolved 2026-08-07 — three documents existed for one problem)

| document | disposition |
|---|---|
| `docs/blocks/class-sweeps/00-RULES-OF-ENGAGEMENT-NO-COLLISION.txt` (tracked, #3560, 2026-07-26) | **SUPERSEDED, kept for history.** Stale on two counts: it assigns "Cursor = financial lane / Claude Coder = UI lane", which is not the current partition, and it routes merges through the `JORGE-APPROVED` label, **deleted** by OWNER LAW 2026-08-03. Its one durable sentence is kept verbatim in §1 below. |
| `docs/specs/NO-COLLISION-LANE-SYSTEM.md` (untracked, never committed) | **ABSORBED.** Its four-layer structure is better than what I first drafted and is adopted here. Two of its claims were checked and corrected: Layer 2's merge queue is **not available on this repo** (§6), and its lane map was written from intent while §1 is written from measured ownership. |

Nothing was silently picked. Both are named, both dispositions are stated, and the superseded file
stays on disk.

This is the standing answer to "how do the coders stop colliding". It is built from measured repo
state, not from how we assume the lanes behave. Every claim below was verified before it was written.

---

## 0. What the evidence actually says

Ownership measured across the last 60 PRs, by lane prefix and by area:

| area | CC-1 | CC-2 | CC-3 | verdict |
|---|---:|---:|---:|---|
| `backend/dispatch`, `backend/mdata`, `apps/frontend` | 0 | 67 | 0 | clean — CC-2 only |
| `backend/accounting`, `driver-finance`, `banking`, `db/migrations`, `.github` | 18 | 0 | 0 | clean — CC-1 only |
| `docs/audit/*`, `docs/law/*` | 6 | 27 | 6 | contested, **already solved** |
| `scripts/`, `scripts/verify-steps/` | 26 | 42 | 4 | **contested — the real surface** |

**The lanes do not collide on domain code.** They collide on guards and verify-steps. Every
instruction below follows from that, and the ones that would have targeted backend code are
deliberately absent because the data does not support them.

Two mechanisms were checked and ruled out, so nobody re-proposes them:

- **GitHub merge queue** — unavailable. Private repo on a **User** plan; merge queues need
  Team/Enterprise. Verified via the repo API, not assumed.
- **CODEOWNERS** — present but **inert**. The ruleset requires **0** approving reviews, so a
  CODEOWNERS entry notifies and can never block. It is not a collision control here.

---

## 1. Domain territory — keep what is already clean, clean

| lane | OWNS (exclusive) |
|---|---|
| **CC-1** money/CI | `db/migrations/**`, `apps/backend/src/accounting/**`, `apps/backend/src/driver-finance/**`, `apps/backend/src/banking/**`, `apps/backend/src/factoring/**`, `apps/backend/src/fuel/**`, `apps/backend/src/qbo-sync/**`, `.github/workflows/**` |
| **CC-2** mechanical | `apps/frontend/**`, `apps/driver-pwa/**`, `apps/backend/src/dispatch/**`, `apps/backend/src/mdata/**`, `apps/backend/src/safety/**` |
| **CC-3** live verify | verification artifacts + board rows; builds no product code |

**An accounting route is MONEY, not "a route".** `apps/backend/src/accounting/*.routes.ts` is CC-1's.
The old "CC-1 never touches routes" wording was wrong in a way that caused real damage: it forced
money work to be split across two lanes mid-file. Territory is decided by **domain**, never by file
suffix.

**The one legitimate cross-lane edit:** when a guard you cannot disable forces a change in another
lane's file *as part of your own block* — e.g. editing any `*.routes.ts` pulls that file into
`verify-new-auth-routes-rate-limited`'s scope and it demands `rateLimit` on pre-existing routes in the
same file. Fix it in your PR, say so in the body, and file a board row for the owning lane. Do **not**
start a sweep in their territory: the 2026-08-06 all-PR-red incident was two lanes running a
rate-limit route sweep simultaneously over overlapping files.

---

## 2. Shared append-only registries — solved, do not serialize them

`docs/audit/*.md`, `docs/law/LAW.json`, `scripts/.guard-exempt.json`,
`scripts/verify-steps/CLAIMED-NUMBERS.json` are **union-merged** (CI-F20 / CI-F23). Every lane writes
them concurrently and git unions both sides. Never pick a side by hand on an append-only board —
that silently destroys another lane's rows.

**One caveat that makes it look broken:** git reads merge attributes from the branch you are merging
**into**. A branch cut before the union rules landed does not have them, so its first merge still
conflicts. Adopt them first, then merge:

```bash
git checkout origin/main -- .gitattributes && git commit -m "adopt union merge rules"
git merge origin/main      # registries now union automatically
```

GitHub's server-side merge **cannot** run our `json-union` driver, so it will report CONFLICTING for
files that union cleanly locally. Resolve locally and push; never resolve a registry in the GitHub UI.

---

## 3. Verify-steps — claim your own number, stop sharing step files

This is the actual collision surface and the instruction has **changed**.

Hosting a new guard inside an existing step file was correct while `CLAIMED-NUMBERS.json` was
serialized under Rule 26. **That is obsolete.** Since CI-F20 the file is `merge=json-union` **and**
collision-strict on `claimed.*`: disjoint claims union silently, and two agents claiming the *same*
number is refused loudly with a real conflict — which is exactly the signal that file exists to raise.

**So: claim your own step number.** Do not wire a new guard into another lane's step file. Every time
you do, that step becomes a shared hot file and the next lane to touch it conflicts with you.

- CC-1 claims **ODD** numbers, CC-2 claims **EVEN** (`.cursor/rules/25-verify-step-odd-even-bands`).
- Claim in `CLAIMED-NUMBERS.json` in the same PR as the guard.
- Number strictly above main's current max, re-checked at push.

---

## 4. One open PR per area

Rule 27 stands: one open PR per area (accounting/money, banking, settlements, dispatch, safety,
lists, migrations). Do not open the next same-area PR until the current one is squash-merged. Rule 26
still applies to the **scoreboard/manifest** files — but **not** to the union-merged registries in §2,
which no longer need serializing.

---

## 5. If you find another lane's defect

Write it to `docs/audit/GUARD-WORKORDERS.md` and push. Findings flow **agent → board → agent**, never
through the owner, and never by editing their code yourself.

---

## 6. Layer 2 (merge-race defense) — GATED. Do not enable before Layer 3.

**GitHub merge queue is UNAVAILABLE here** and this was verified, not assumed: the repo is `private`
and owned by a **User** account (`gh api repos/... --jq .owner.type`), and merge queues for private
repos require an organization on Team/Enterprise. The merge-queue API returns `Not Found` for
`main`. The definitive test is enabling it on the ruleset, which is an owner-authorised settings
change, not a mid-session switch-flip.

**Amended Layer 2 (owner-confirmed):** require branches to be up to date before merging on ruleset
`17935054` (currently OFF), keep auto-merge ON, and rebase in order.

### THE GATE — enabling this before Layer 3 LIVELOCKS THE REPO

Measured 2026-08-07, not estimated:

| measurement | value |
|---|---:|
| `build-typecheck`, successful run | **18 min** |
| merges to `main` in 24h | **81** |
| mean interval between merges | **~17.8 min** |

The recheck time **equals** the merge interval. Under strict up-to-date every merge invalidates every
other open PR; each must rebase and re-run 18 minutes, and will almost always be invalidated again
before it finishes. That is not a queue, it is livelock, and it would stop merges repo-wide.

**Therefore Layer 3 (split `build-typecheck` into a fast required gate + a separate
`migration-replay`) is a HARD PREREQUISITE, not a supporting layer.** Strict up-to-date MUST NOT be
enabled until the recheck is split and fast, and the split must be measured — not assumed fast.

### Layer ordering (LAW)

1. **Layer 1 + 1b — NOW.** Territory is **PROPHYLACTIC**: zero PRs from either lane have ever reached
   into the other's domain, so it protects a partition that is already clean rather than fixing an
   observed break. **1b (hot-file single-open-PR) is the one that addresses real observed contention.**
2. **Union merge stays the fix for append-only registries.** Not ownership, not serialization.
3. **Layer 3 — split the check, and MEASURE it.**
4. **Layer 2 — only after 3 is proven.** Then prove it catches a synthetic semantic race on a
   throwaway pair before trusting it.
5. **Layer 4 — branch prefixes.** Deferred deliberately: the lane guard reads the **PR title** prefix,
   which is already in reliable use (Claude-1 21, Claude-2 11, Claude-3 2 across sampled PRs), so it
   works today with zero migration. Switching branch prefixes needs all agents to change at once and
   buys nothing the title prefix does not already give.

**`shared_hot` EXCLUDES every union-merged/append-only registry** — `LAW.json`,
`GUARD-WORKORDERS.md`, `wave-queue.json`. Serializing those would break agent→board→agent: a lane
must be able to file a finding without waiting for a token. Only genuinely conflict-prone shared
SOURCE files belong there.

**Even after Layer 2 lands, the post-merge forensic stays mandatory** (merge commit on main, CI green,
deploy live, Neon state, no regression). GitHub's native queue had a documented incident where it
silently reverted merged code; a queue reduces collisions, it does not verify that what should be on
main actually is.
