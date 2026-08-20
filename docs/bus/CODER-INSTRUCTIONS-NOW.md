# CODER INSTRUCTIONS NOW · 2026-08-20T00:35Z · FROZEN USMCA OPS · DO NOT SKIP

**20:52Z update:** canonical READY standard is `docs/lockdown/MATRIX-READY-FROZEN-USMCA-STANDARD-2026-08-19.md`. No new Required leaves until Jorge unfreezes. Watch READY Live ✓ and Miss C = 0.

**Why this file exists:** seats were running on stale `docs/bus/INBOX-*` (15:55Z stubs). Desktop had newer bullets; **`git pull` did not include FAST-MERGE, current NOW, or the no-idle loop.** This file is the full instruction set. Copy lives on Desktop `USMCA-WEEKEND-LEAD-2026-08-07/` **and** `docs/bus/`. Repo wins after pull.

**Jorge is not the messenger.** Chat is not your GO. Idle is a defect. Deferral is a defect. “Waiting for instructions” is a defect — they are here.

Read next: `docs/bus/00-CODER-START-HERE.md` → `INBOX-<SEAT>.md` (top block) → **`docs/bus/SEAT-COMMS-LAW.md`** → `FAST-MERGE-4MIN-LAW.md` → `STATUS-NOW.md`.

If YOUR or another seat’s INBOX names a FO already on `origin/main`, OUTBOX `STALE INBOX` to Cursor same turn. Keep working the §4 ladder. Do not idle waiting for a rewrite.

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

**OWNER SEQ (owner 2026-08-19 — urgency, do not skip unpaid in YOUR lane):**  
accounting → banking → factoring → settlements → drivers → customers → vendors → dispatch.  
Then rest (safety / fleet / maintenance / lists / other). Money/GL = CC-1 only. Cursor Built + Codex reverse + Devin Clicked follow this order, not A–Z and not fleet/maint first.

---

## 4. Seat NOW / THEN (authoritative — 00:35Z)

| Seat | CDP | NOW | THEN (same turn) | OUTBOX WORKING line |
|------|-----|-----|------------------|---------------------|
| **Cursor** | 9226 | **drivers Built** identity/EntityLink leftover | customers → vendors → dispatch Built (never accounting EntityLink-only) | `Cursor \| WORKING \| NOW=drivers Built \| GO` |
| **Codex** | 9228 | **DRV-PROFILE-OPS-REVERSE** (see `INBOX-CODEX.md` 00:35Z + `PASTE-CODEX-NOW.md`). Generic continuous-mode paste ≠ ACK. VOID #10144. | customers reverse → vendors reverse → dispatch reverse PRIMARY (skip #10260) | `Codex \| ACK \| NOW=drivers reverse FE \| NEXT=customers reverse \| GO` |
| **Devin-A** | **9227** | Clicked on **OWNER SEQ** modules (accounting first if unpaid cells). Named `leaf:col`. STARVED skip. **No safety PASS re-loop.** **FAST-MERGE your own PRs.** | next unpaid leaf same module → next OWNER SEQ module | `Devin-A \| WORKING \| NOW=Clicked OWNER SEQ \| chrome=9227 \| GO` |
| **CC-1** | 9222 | **accounting** money/GL unpaid | banking → factoring → settlements | `CC-1 \| WORKING \| NOW=accounting money \| GO` |
| **CC-2** | 9223 | lists/catalogs unblocking **drivers** | customers catalogs → vendors catalogs | `CC-2 \| WORKING \| NOW=lists drivers +Add new \| GO` |
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
