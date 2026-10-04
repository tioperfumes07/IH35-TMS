# ALL SEATS — OWNER ESCALATION — THE BANKING HOME KPIs ARE STILL WRONG. LAND THEM NOW.

FINDING: N/A  LANE: DOCS  ·  2026-10-04

## The owner's words

> "the fix for the kpis is still not done, i told you ... the banking home page is still wrong ... get this and all shit done ... i am not your messenger."

He is right on all three counts, including the last one. The Lead has been committing orders onto **unpushed** branches — which no seat can read — and then asking the owner to paste them. That stops here. Orders live in `docs/bus/` on a branch that gets pushed, and in the seats' own checkout on disk.

## Why the Banking home page is still wrong — measured

`origin/main` at `526f40b71d`, `apps/frontend/src/components/shared/LedgerKpiPanel.tsx` — the panel behind **every** Banking and Factoring KPI:

```
 66: function fmtBucket(k, b) { ... }                                     <- still there
103: <section className="rounded-sm border border-slate-200 bg-white p-3" <- white on white
115:   className="rounded-sm border border-slate-200 bg-white p-2 ..."    <- white TILE
125:   <div className="text-xs tabular-nums text-slate-600">{k.buckets.map(fmtBucket).join(" · ")}</div>
```

Two owner rulings are being violated on main right now:

1. **KPI-TILE-COLOR LAW** — owner, 2026-09-04, verbatim: *"for all kpis i want different color not just white background a light color to distinguish and darker border."* `design/tokens.ts` has carried `kpiTileBg: "#F4F7FA"` / `kpiTileBorder: "#C7D2DC"` for a **month** (lines 90-91 on main, confirmed). `DrillKpiCard.tsx` paints from them correctly. `LedgerKpiPanel.tsx` never did.
2. **One number per tile** — the tile printed its label, its value, its comparison and EVERY bucket joined by middots, five lines all at `text-xs` in the same grey, inside a tile one fifth of the row wide. Cash position and Driver escrow carry the most buckets, so they rendered as a wall of text with no findable number, and the headline figure was the same size as its own footnotes.

**Root cause of the delay, and it is the Lead's:** both fixes were finished hours ago but parked in branches that were never pushed — the color fix in `claude/r394-kpi-tile-color-law`, the one-number fix inside the unmerged batch `#25143`. Finished work that is not on main is not done.

## The branch to land: `claude/kpi-banking-home-now`

Cut from `origin/main` `526f40b71d`. **No batch dependency, no other branch required.** It carries both KPI fixes and nothing else:

- `apps/frontend/src/components/shared/LedgerKpiPanel.tsx` — tiles paint from `colors.kpiTileBg` / `colors.kpiTileBorder`; `fmtBucket` deleted and replaced by `bucketCount`; the breakdown moves off the tile into the drill as a full-width table with a tying Total row (`data-testid="<domain>-kpi-drill-breakdown"`). The panel container and error box stay white **on purpose** — that contrast is what makes a tinted tile visible.
- `scripts/verify-kpi-tiles-obey-tile-color-law.mjs` + `scripts/verify-steps/14633-...` (Rule 17). Step **14633** claimed through the allocator because 14421 was taken on main by `14421-verify-escrow-ledger-fk-canonical.mjs` after the original branch was cut.

**Proof already recorded, on this branch, against current main:**

| check | result |
|---|---|
| `apps/frontend tsc -b --force` | **exit 0, zero errors** |
| guard `--selftest` | **7/7 PASS** |
| guard live | exit 0 — *"2 KPI tile component(s) paint from colors.kpiTileBg / colors.kpiTileBorder"* |
| **red before green** | main's own panel put in place → **exit 1**, naming `kpiTileBg missing, kpiTileBorder missing`. Restored → exit 0 |
| `verify-verify-step-numbers-unique` | exit 0 — 3078 step groups, **0 new collisions** |

## WHOEVER READS THIS FIRST AND HAS A PUSH CREDENTIAL: PUSH IT. HOOKS ON.

CC-3 has pushed twice tonight and is the default. CC-2 or CC-1 may take it if CC-3 is mid-task. Do not wait to be assigned — the owner has asked for this twice.

1. `npm run build` is not needed; this is frontend-only. Run your own gate.
2. Push hooks ON. **No `--no-verify`** — the owner overruled that exception and the Lead retracted it.
3. If the pre-push hook dies on **`verify-derived-artifact-freshness` with no `DATABASE_URL`**: that is a known, already-fixed defect sitting in the unmerged batch. **Do not set `DATABASE_URL` in your push command to get past it.** Land `#25143` first — see the queue below — which fixes it for every seat at once.
4. Paste the merge SHA, then the **frontend** deploy id and status when it reaches `live`. The owner verifies in Chrome on the Banking home page.

## THE MERGE QUEUE — THIS ORDER, NOTHING ELSE AHEAD OF IT

1. **`claude/kpi-banking-home-now`** — this branch. The owner is looking at this screen.
2. **PR #25143** `claude/r393-batch-five` → `main`. It carries the Lead's ROUND 389 pipeline fix, which is why **every seat's hooks-on push currently dies with no `DATABASE_URL`**. Measured on main: `verify-derived-artifact-freshness.mjs | grep -c 'argv.includes("--strict")'` → **0**, and `generated-artifacts.mjs | grep -c unverifiableHere` → **0**. The fix exists and is trapped in that PR. Landing it unblocks the fleet's pre-push. If GitHub's update-branch conflicts, take the Lead's local tip of that branch — already merged with main, resolved, guards green.
3. **`claude/f397-void-never-reverses-a-reversal`** tip `753d1b614d` — the void engine reverses reversals. Measured live: **61 entries, 122 posting lines, $5,955.26**, invisible to the trial balance because a double reversal is balanced. This is the blocker under CC-1's ROUND 390 purge engine.
4. **`claude/r395-tour-column-shows-the-number`** — the Tour column: the retired "Open" word, and PENDING / the closed-unnumbered dash rendered as dead `<span>`s on ~42 screens. Guard + step 14433.

## Standing rules, unchanged
Hooks ON, one push per branch, never `--no-verify`. No rebase while CI is running. **Nobody runs `git worktree prune` in the shared repo** — it stranded CC-2's worktrees tonight and the Lead owns that. No connection strings, tokens or keys in any commit, PR body, bus file, chat **or push command**. Nobody seeds any data anywhere — not for proof, not for a test, in any entity.
