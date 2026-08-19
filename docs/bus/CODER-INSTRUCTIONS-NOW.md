# CODER INSTRUCTIONS NOW · 2026-08-19T18:20Z · COMPLETE · DO NOT SKIP

**Why this file exists:** seats were running on stale `docs/bus/INBOX-*` (15:55Z stubs). Desktop had newer bullets; **`git pull` did not include FAST-MERGE, current NOW, or the no-idle loop.** This file is the full instruction set. Copy lives on Desktop `USMCA-WEEKEND-LEAD-2026-08-07/` **and** `docs/bus/`. Repo wins after pull.

**Jorge is not the messenger.** Chat is not your GO. Idle is a defect. Deferral is a defect. “Waiting for instructions” is a defect — they are here.

Read next: `docs/bus/00-CODER-START-HERE.md` → `INBOX-<SEAT>.md` (top block) → `FAST-MERGE-4MIN-LAW.md` → `STATUS-NOW.md`.

---

## 1. Session boot (every seat, every loop)

```text
git pull --ff-only origin main
# then read, in order:
docs/bus/CODER-INSTRUCTIONS-NOW.md     # this file
docs/bus/00-CODER-START-HERE.md
docs/bus/STATUS-NOW.md
docs/bus/INBOX-<YOUR-SEAT>.md          # TOP block only; archive below is VOID if it contradicts
docs/bus/FAST-MERGE-4MIN-LAW.md
```

Write **OUTBOX first line before you code:**

```text
<SEAT> | WORKING | NOW=<one FO> | NEXT=<next FO> | GO
```

Seats write **OUTBOX only**. Do not rewrite your INBOX.

---

## 2. FAST-MERGE (ON until Jorge says otherwise) — every PR, including Devin code PRs

Focused-green **is** merge proof. CI watch is **not**.

| Step | Do this |
|------|---------|
| 1 | Cursor: `node scripts/ops/cursor-ship-preflight.mjs --body-file /tmp/pr-body.txt` exit 0. Others: `node scripts/money-pr-local-gate.mjs` exit 0. Tip must contain `origin/main`. |
| 2 | `git push`. If blocked **only** by husky ENV `verify-static` / tsc hang **after** step 1 PASS → `git push --no-verify`. **Never** `--no-verify` for YOUR red guard. **Never** `--no-verify` before step 1 PASS. |
| 3 | `gh pr create` — Cursor titles must start `Cursor-`. **Never** `gh pr checks --watch`. |
| 4 | **Same turn:** `gh pr merge N --squash --delete-branch --admin`. If local `main` worktree lock: `gh api -X PUT repos/tioperfumes07/IH35-TMS/pulls/N/merge -f merge_method=squash -f delete_branch=true` |
| 5 | Money/migrations: **you** apply on Neon. |
| 6 | OUTBOX shipped line → **start NEXT FO same turn**. |

Unmerged focused-green PR = process defect.

---

## 3. Continuous · fix instantly · never defer

- Finish FO → next FO on **YOUR** ladder. No ping. No `awaiting next FO`.
- Every finding in OUTBOX is a FO **now**.
- Share the module: different files, same hour. Do not wait for another seat to “finish the module.”
- Live=BLOCKED until healthz ancestry includes merge SHAs. Do not sit idle on lag — keep shipping.

**OWNER SEQ (do not skip unpaid in YOUR lane):**  
accounting → customers → drivers → vendors → dispatch → safety → fleet → maintenance → rest.

---

## 4. Seat NOW / THEN (authoritative — 18:20Z)

| Seat | CDP | NOW | THEN (same turn) | OUTBOX WORKING line |
|------|-----|-----|------------------|---------------------|
| **Cursor** | 9226 | remaining **maintenance Built** identity tombstones (inspections / warranty / remaining queues) | rest Built (never accounting EntityLink-only) | `Cursor \| WORKING \| NOW=maint Built inspections/warranty \| GO` |
| **Codex** | 9228 | **REWAKE.** Dispatch **reverse PRIMARY** unpaid (load↔driver/unit/customer). If customers/drivers/vendors reverse still unpaid, those first. | fleet Band B `trailer.profile.*` reverse → maint reverse | `Codex \| WORKING \| NOW=dispatch reverse PRIMARY \| NEXT=fleet Band B \| GO` |
| **Devin-A** | **9227** | Live Cancel-only on **current** healthz. Named `leaf:col`. STARVED skip. **No safety PASS re-loop.** **FAST-MERGE your own PRs.** | next unpaid leaf same module → next seq module | `Devin-A \| WORKING \| NOW=Live current healthz \| chrome=9227 \| GO` |
| **CC-1** | 9222 | accounting money/GL unpaid | banking → settlements → factoring | `CC-1 \| WORKING \| NOW=accounting money \| GO` |
| **CC-2** | 9223 | lists/catalogs unblocking **customers** | drivers catalogs → vendors catalogs | `CC-2 \| WORKING \| NOW=lists customers pickers \| GO` |
| **CC-3** | — | **OFF. Do not build.** | — | `CC-3 \| OFF \| no dispatch this wave` |
| **Cascade** | — | **OFF. Do not build.** Merge tips → Cursor lead. | — | `Cascade \| OFF \| no dispatch this wave` |

---

## 5. Forbidden (all seats)

- Idle / silent Codex / “need instructions”
- `gh pr checks --watch`
- Leaving a focused-green PR unmerged
- Inventing Leaves / word-blanket Built
- Accounting EntityLink-only theater (Rule 23)
- Safety PASS Live re-loop
- CC-3 / Cascade build
- Stealing another seat’s hotfiles
- Asking Jorge to merge or to relay a finding

---

## 6. Quality (unchanged)

McLeod + QuickBooks honesty. Claude-green FINDING block on commits. Guard on wiring fixes. Fully-Wired 1–11 Built; Live Chrome last.

Desktop folder: `~/Desktop/IH35-CURSOR-AUDIT/USMCA-WEEKEND-LEAD-2026-08-07/`
