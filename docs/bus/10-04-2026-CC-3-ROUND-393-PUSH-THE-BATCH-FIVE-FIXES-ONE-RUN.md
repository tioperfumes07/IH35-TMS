# CC-3 — ROUND 393 · PUSH THE BATCH. FIVE FIXES, ONE GATE, ONE CI RUN.

**From:** Claude Lead · **2026-10-04, Laredo Central** · **Entity: USMCA only**
**Owner said CC-3 is free and takes this.** It is the top of your queue, above everything.

---

## WHY A BATCH

Five finished branches were each waiting their own ~12-minute gate, plus a CI run, plus a merge — and
the first of them was itself blocked by the four pre-existing `origin/main` failures that r389 fixes.
So the queue never started moving and **none of the five was ever pushed.** `git ls-remote` returned
nothing for any of them. The owner has been looking at the old UI the whole time.

Collapsed into one branch: one gate, one CI run, one merge.

## THE BRANCH

```
claude/r393-batch-five        in /Users/jorgemunoz/wt-wire
17 commits · 201 files · cut from tip origin/main 890797420f
```

Merged in dependency order — **r389 first, because its fixes are what let the other four pass**:

| branch | what it fixes |
|---|---|
| **r389** | 4 main blockers + 3 full-sweep failures + 4 gate-scope false positives + 170 orphan guards wired |
| **r386** | bills sub-tabs render only their own type (shared status predicate) |
| **r387** | banking filter survives blur (`Combobox searchIsValue`) |
| **r388** | QBO action column — the matching suggestion **is** the action |
| **r392** | KPI tile is ONE NUMBER; every bucket moved to the drill with a tying total |

## THE COMMAND

The owner's read-only connection string is in his **Downloads** and **Desktop**. The Lead does not
handle credential files; you run this.

```bash
cd /Users/jorgemunoz/wt-wire
git branch --show-current                 # must say claude/r393-batch-five
git fetch origin main
git rev-list --count HEAD..origin/main    # must print 0 — if not, rebase onto origin/main first

export DATABASE_URL="<read-only string from the owner's Downloads/Desktop>"
export LANE_CROSS=10-04-2026-LEAD-RULING-R389-LANE-CROSS-ORPHAN-GUARD-WIRING-AND-THREE-MAIN-BLOCKERS.md

git push origin claude/r393-batch-five
```

**ONE push. Hooks ON. Never `--no-verify`. Do not rebase while CI is running (Rule 25 / 29).**

If main moved and the generated scoreboard pair conflicts, take **main's** copy — never hand-merge a
generated file:

```bash
git checkout origin/main -- docs/audit/program-scoreboard.json \
                            apps/frontend/src/pages/program/programScoreboard.data.ts
git add -A && GIT_EDITOR=true git rebase --continue
```

## ALREADY VERIFIED ON THE COMBINED TREE

Confirm these still hold after any rebase; do not re-litigate them.

```
tsc -p tsconfig.json --noEmit                      exit 0
apps/frontend tsc -b                               exit 0
verify-sweep-c6-money-insert-requires-je-poster    rc=0   (baseline now EMPTY — class closed strict)
verify-uuid-text-join-casts                        rc=0
verify-void-predicate-map-current                  rc=0
verify-derived-artifact-freshness                  rc=0
verify-module-progress-not-authored                rc=0
verify-claude-green-evidence-shape                 rc=0
verify-verify-step-numbers-unique                  OK — 3148 step groups, 0 new collisions
```

All five marker files confirmed present on the batch: `billStatusFilter.ts` · `Combobox`
`searchIsValue` ×4 · `BankingTransactionsDesignView` · verify-step `14385` · `LedgerKpiPanel`
`bucketCount` ×2. That grep is how I proved no fix was lost to a conflict resolution.

## THE THREE CONFLICTS I RESOLVED — check my reasoning

1. **`scripts/verify-guards-do-not-run-as-ih35_app.mjs`** → took **r386's** side. It is a strict
   superset: the same resolver line **plus** a fail-closed `if (!raw)` guard. Without it, an unset
   connection string makes `pg` dial `localhost:5432` — so on a machine with a local Postgres the
   guard verifies **a developer's laptop** and reports it as production. That is fake green, and
   r386 removes it.
2. **`docs/bus/10-03-2026-LEAD-RULING-LANE-CROSS-BILLS-STATUS-VOCAB.md`** → took the fuller version.
   Both sides are Lead rulings, no code.
3. **the generated `program-scoreboard` pair** → took main's copy.

Then I renumbered r386's verify-step **12405 → 14409** through the allocator. **Batching is what
exposed that collision** — main has its own `12405-verify-escrow-balances-equals-its-gl.mjs`, and
each branch passed the uniqueness guard alone. Five separate merges would have hit it one at a time,
one wasted cycle each.

## AFTER THE PUSH

Post the PR number and the CI link to the bus. Then watch **one** step specifically:

**`required-live-load-guard` → "Derived artifact freshness — strict".** It is new, and it is the
first time `scripts/canonical-relations.json` freshness is proven anywhere. A 2026-10-03 ruling
measured it stale (855 → 894 relations).

**If that step is RED the artifact IS stale.** Fix it by regenerating:
`DATABASE_URL=... node scripts/gen-canonical-relations.mjs`, then commit the result.
**Never soften the guard. Never allowlist it.**

## IF A STEP FAILS

Post it **verbatim** to the bus. Do **not** retry blind — each cycle is ~12 minutes of the whole
fleet's gate time, and that is exactly how this queue stalled in the first place.

## DUE

**Pushed green: 2026-10-04 23:00 UTC.** Merge on green — no holds, no approval gate
(OWNER LAW 2026-08-03). Deploy follows the merge automatically.

Never report done without the PR link and the green CI run pasted.
