# CODER INSTRUCTIONS NOW · 2026-08-20T03:40Z · COMPLETE LAW · DO NOT SKIP

**CC-2: you already have a GO. “Lane clean / 20-minute poll” is a defect.**  
`picker_law` PASS on drivers/customers/vendors is **one matrix column**, not Fully-Wired complete. Keep shipping lists `+ Add new` / nested create / remaining Combobox hosts. Do not idle.

**Devin / Codex:** empty chat is allowed. **Empty OUTBOX is not.** Work must appear as `WORKING` + `LIVE PASS` / `SHIPPED PR#` on `origin/main`. Miss C > 0 means Devin is not done. Reverse FKs still plain text means Codex is not done.

---

## 0. What “truly done” means RIGHT NOW (this wave)

Two different 100s. Do not mix them.

### A. Frozen USMCA ops READY (what Jorge watches on the matrix)

Canonical: `docs/lockdown/MATRIX-READY-FROZEN-USMCA-STANDARD-2026-08-19.md`

| Watch | Meaning |
|-------|---------|
| **READY Live ✓** | Every **non-money** Required cell is **Built** + **USMCA Clicked** |
| **Miss C = 0** | No unpaid Clicked on that frozen ops set |
| **Box 4** | Ignore. Never “done.” |
| **Money columns** | Parked for READY. CC-1 still ships them. Not in READY 100. |

**Clicked credit:** OUTBOX `LIVE PASS` + `leaf=<module>:<leafId>:<col>` + USMCA. Fan-out 4+ cells does **not** count.

**Say:** `Built progress / Live=BLOCKED` until item 12. **Never** “fully wired” / “module complete” / “McLeod-ready.”

### B. Fully wired (the complete product law — every leaf, forever)

Canonical: `docs/lockdown/FULLY-WIRED-COMPLETE-BAR-2026-08-13.md`  
Honest Built: `docs/lockdown/HONEST-BUILT-LAUNCH-LAW-2026-08-14.md`  
DoD: `docs/specs/DEFINITION-OF-DONE.md` (A–E + VERIFY 1–8)

**Owner one-liner:** create in the real app → save to the real table → money posts or honestly holds → both-way links → every control on the matrix → QBO/McLeod chrome → **then** Chrome on prod.

| # | Law |
|---|-----|
| 1 | Real tab/leaf/route (no ComingSoon twin) |
| 2 | Create/save writes **canonical** table; every field in payload; server display IDs |
| 3 | Money when owed: vendor/customer + GL; correct object; balanced JE if flag ON; **no TMS→QBO write-back** |
| 4 | Forward FKs (not memo / UUID-in-name) |
| 5 | **Reverse** — other side can drill back |
| 6 | Matrix Required cells **Built** with **leaf-specific** guards (no `leafRe:.*` / `\|.*`) |
| 7 | Surface bar: search/filter/gear/range/picker/Combobox/modal/drawer/wizard/nested create |
| 8 | Chrome: no box-in-box; `+ Create`/`+ Book`; Apply on filters |
| 9 | Picker law: catalog; **`+ Add new` FIRST ROW**; same wizard as Lists; R=W; appears+selected+reload; entity-scoped |
| 10 | RLS / opco / void-not-delete |
| 11 | Guard + FINDING evidence |
| 12 | **Live Chrome LAST** — after 1–11 Built; healthz SHA; click create→save→reload→reverse |

CI-green · scoreboard Built · `@matrix-built` · N-of-M **alone ≠ done.**

Illegal Built: `leafRe:".*"`, `|.*`, word blankets `.*(create|modal|drawer|wizard).*`.

---

## 1. Session boot (every seat, every loop)

```text
git pull --ff-only origin main
# then read, in order:
docs/bus/CODER-INSTRUCTIONS-NOW.md     # this file
docs/lockdown/FULLY-WIRED-COMPLETE-BAR-2026-08-13.md
docs/lockdown/HONEST-BUILT-LAUNCH-LAW-2026-08-14.md
docs/lockdown/MATRIX-READY-FROZEN-USMCA-STANDARD-2026-08-19.md
docs/bus/00-CODER-START-HERE.md
docs/bus/STATUS-NOW.md
docs/bus/INBOX-<YOUR-SEAT>.md          # TOP block only
docs/bus/SEAT-COMMS-LAW.md
docs/bus/FAST-MERGE-4MIN-LAW.md
```

Write **OUTBOX first line before you code:**

```text
<SEAT> | ACK | STANDARD=MATRIX-READY | NOW=<one FO> | GO
<SEAT> | WORKING | NOW=<one FO> | NEXT=<next FO> | GO
```

Seats write **OUTBOX only**. Do not rewrite your INBOX. Stale INBOX → ping Cursor OUTBOX same turn.

Jorge is not the messenger. Chat is not GO. **“Need instructions” after `git pull` is a defect.**

---

## 2. FAST-MERGE (ON until Jorge says otherwise)

| Step | Do this |
|------|---------|
| 1 | Cursor: `node scripts/ops/cursor-ship-preflight.mjs --body-file /tmp/pr-body.txt` exit 0. Others: `node scripts/money-pr-local-gate.mjs` exit 0. Tip contains `origin/main`. |
| 2 | `git push`. If blocked **only** by husky ENV `verify-static` **after** step 1 PASS → `git push --no-verify`. Never `--no-verify` for YOUR red guard. |
| 3 | `gh pr create` — Cursor titles start `Cursor-`. **Never** `gh pr checks --watch`. |
| 4 | Same turn: `gh pr merge N --squash --delete-branch --admin` |
| 5 | Money/migrations: **you** apply on Neon. |
| 6 | OUTBOX shipped → **NEXT FO same turn**. |

---

## 3. OWNER SEQ (urgency — not A–Z, not fleet/maint first)

accounting → banking → factoring → settlements → **drivers** → **customers** → **vendors** → **dispatch** → then rest.

Share the module (different files, same hour). Do not wait for another seat to finish the module.

**502:** Render API bounce on every `main` merge. Poll healthz JSON 200. **Never** merge a 502-diary PR.

---

## 4. Seat NOW (authoritative — 03:40Z)

| Seat | CDP | YOU DO | YOU DO NOT |
|------|-----|--------|------------|
| **Cursor** | 9226 | Lead · INBOX truth · **drivers→customers→vendors→dispatch Built** leftovers (EntityLink/tombstone). Scoreboard live-feed if frozen. | Steal Codex reverse files · accounting EntityLink-only · Box 4 as done |
| **Codex** | none | Reverse FE `EntityLinkOrTombstone` OWNER SEQ. NOW: remaining **drivers** reverse, then customers → vendors → dispatch (skip #10260). ACK `PASTE-CODEX-NOW.md`. | CDP · Clicked · money posters · lists +Add new · idle with empty OUTBOX |
| **Devin-A** | **9227** | Clicked Cancel-only USMCA, named `leaf:col`, OWNER SEQ. STARVED skip. OUTBOX `LIVE PASS` every leaf. FAST-MERGE your **code** PRs. Miss C is your remaining work. | 502 diary · pause for continue · invent Leaves · Box 4 · safety PASS re-loop · “done” while Miss C > 0 |
| **CC-1** | 9222 | accounting money/GL unpaid → banking → factoring → settlements. CLS-SILENT-CAP remaining in accounting. | EntityLink-only · lists · Clicked |
| **CC-2** | 9223 | **Lists pickers / catalogs.** Fully-Wired **item 9** on remaining Comboboxes: `+ Add new` first row → Lists wizard → R=W. NOW: **customers catalogs** (drivers picker_law already PASS does **not** end the seat). THEN vendors catalogs → remaining lists module Combobox inventory. | 20-min idle poll · “lane clean” · money · reverse FE · solo-fix all `apiRequest` timeouts (#10455 is board, not a solo 1863-site rewrite) |
| **CC-3 / Cascade** | — | **OFF. Do not build.** | — |

---

## 5. Forbidden (all seats)

- Idle / “need instructions” / 20-minute poll with unpaid FO in YOUR column
- `gh pr checks --watch`
- Unmerged focused-green PR
- Invent Leaves / word-blanket Built
- Accounting EntityLink-only (Rule 23)
- Safety PASS Live re-loop
- CC-3 / Cascade build
- Stealing another seat’s hotfiles
- Asking Jorge to merge or to relay findings

---

## 6. Quality

McLeod + QuickBooks honesty. Claude-green FINDING on commits. Guard on wiring fixes.

Desktop: `~/Desktop/IH35-CURSOR-AUDIT/USMCA-WEEKEND-LEAD-2026-08-07/`
Repo wins after `git pull`.
