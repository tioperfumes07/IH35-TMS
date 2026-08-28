# VERTICAL WIRING LAW — PERMANENT (owner-locked 2026-08-12 · seq clarify evening)

**HONEST BUILT + LAUNCH (2026-08-14):** `docs/lockdown/HONEST-BUILT-LAUNCH-LAW-2026-08-14.md` — launch without Live Chrome = Fully-Wired 1–11 with leaf-specific Built only; seat lanes Cursor/CC-1/Codex; no `leafRe:.*` / `|.*` / word-blanket Built; no new scoreboard columns.

**Answered = closed. Do not re-ask.**

**Supersedes:** horizontal “finish dispatch then banking” · per-seat **module lists** · “Codex owns lists/customers/dispatch only” · CC-2 **verify-only** · “P10 done = A–C done” · stale OUTBOX “holding / owner-gate / legacy exhausted”.

**Authority:** This file wins over chat and stale INBOX/OUTBOX.

**Companion:** `docs/specs/scoreboard/VERTICAL-COLUMN-WAVE-METHOD-LOCKED.md` · `docs/lockdown/WIRE-FIRST-SPRINT-LAW-2026-08-12.md` · `docs/specs/CODER-PASTE-INSTRUCTIONS-2026-08-12.md` · **`docs/lockdown/FULLY-WIRED-COMPLETE-BAR-2026-08-13.md`** (owner-plain 12-item “fully wired” list — Live Chrome last)

**Complete ≠ A–C Built alone.** Product “fully wired” = FULLY-WIRED-COMPLETE-BAR items 1–12 for the scope.

---

## 1. The one-line law

> **Owner 2026-08-28 (resolves three conflicting defs):** **fix horizontally at the mechanism** (one poster / one billing-leg / one void-reversal). **Verify vertically along the USMCA money lifecycle** (create → canonical → GL delta → subledger tie → cash). Column-wave remains how chrome/wiring is swept. Module-at-a-time Live Chrome is last and is **not** a ledger PASS. TRANSP/TRK are test/legacy, not the operating bar.

---

## 2. Two vertical shapes

| Shape | ID | Scope | Primary seats |
|-------|-----|-------|---------------|
| **COLUMN-WAVE** | `driver`, `connectivity`, `gl_je`, … | Step-1 priority 10 → Step-2 all owed modules | Codex (FE A+B+C chrome) · CC-1 (C money) · CC-2 (B API) |
| **CLASS-SWEEP** | Defect class repo-wide | All matching files | CC-2 · CC-1 (money) · Cursor (guards) |

**Forbidden: MODULE-DEEP** — one module green while siblings stay red on the same column.

---

## 3. OWNER SEQUENCE (2026-08-12 evening — answered=closed)

| Step | Scope | Done bar |
|------|-------|----------|
| **1 — PRIORITY 10 FIRST** | lists · accounting · dispatch · settlements · factoring · banking · customers · vendors · drivers · safety | Every Required A–C cell Built on those 10 for the columns you are sweeping |
| **2 — THEN ALL MODULES** | Same columns on modules 11–28 / full inventory | Full-module A–C Required Built = **100%** — not the P10 subset |

**How to ship:** Prefer one PR when the shared helper covers both layers. If hotfiles force a split: **Step-1 PR then Step-2 PR same turn / no idle / no “P10 complete” claim.** Tag every module touched in `@matrix-built`.

**A–C complete** = full-module audit **100%** Required Built (Codex measured ~2770/3650 = 76% → **880 gaps remain** — that is the honest bar). Wave **D** stays blocked until A–C full.

**Leftover after Step-2:** only columns that were **never Required** on the priority 10 (module-unique Required on later modules).

**Forbidden soft-reading:** “extend when convenient” · stop after P10 · owner-gate · holding · Wave D early · invent FKs/reserves.

**Wave order:** **A → B → C → D**. One column id at a time across modules.

---

## 4. PR contract

```javascript
/** @matrix-built {"modules":["dispatch","settlements",…],"cols":["reverse_link"],"task":"WAVE-B-reverse_link","vertical":"column-wave","seq":"p10-then-all"} */
/** @matrix-built {"modules":["*"],"cols":["entity_scope"],"task":"CLASS-UNCAST-OPCO","vertical":"class-sweep"} */
```

**Reject:** single-module column-wave (unless last serial slice) · OUTBOX without `column=`/`class=` · claiming A–C done on P10 % alone.

---

## 5. Four seats (no CC-3)

| Seat | Work |
|------|------|
| **Cursor** | Bus truth · INBOX/OUTBOX purge · no coder nudge while Jorge present · overflow |
| **Codex** | FE column-waves A→B→C · Step-1 P10 then Step-2 all modules · ranked gaps OK |
| **CC-1** | Money columns Step-1 P10 then Step-2 all owed · Neon yourself · no owner gate |
| **CC-2** | CLASS-SWEEP + Wave B API/guards · Step-1 then Step-2 · board rows for other lanes |

---

## 6. OUTBOX / INBOX hygiene

OUTBOX = **one live line**. Multi-line essays / “holding” / “owner-gated” = **purge and replace**. Worktree INBOX from `docs/bus/INBOX-*.md` wins.

---

## 7. ★★★ RE-LOCKED 2026-08-14 (owner said this three times — read before touching any column-wave guard)

**The bar is subscription-launch quality — McLeod / QuickBooks-grade — across every one of the 30 sidebar
modules (`apps/frontend/src/components/layout/sidebar-config.ts` `SIDEBAR_ITEM_IDS` is the count source of
truth; `eld` is the one standing exception — a stub page with no backend, nothing to wire). Twenty-nine real
modules. Not the priority-10. Not the priority-14. All of them, every time, no exceptions, no "later."**

**Caught live 2026-08-14 — read this before assuming a Step-2 "all-modules" guard is trustworthy:**
`scripts/verify-wave-c-ap-bill-fe-all-modules.mjs` declares `"modules":[...12 names...]` and
`"leafRe":".*"` — reading as if it proves the `ap_bill` column across all owed modules. Its actual PASS
bar is a **count floor** (`leaves.length < 67`, `module set size < 12`) plus **7 representative-contract
files** — accounting, banking, insurance, maintenance, driver-finance. Independently recomputed live
the same day: **32 real `ap_bill` money-cell gaps existed simultaneously**, spread across
**compliance, fleet, home, insurance, inventory, legal, maintenance, and reports** — modules this
guard's own contract list never touches. A guard that *counts* leaves instead of *proving* every leaf is
exactly the "P10 subset called all-modules" pattern §1 and §3 already forbid — it had simply moved from
prose into code, where it's harder to catch. Before trusting any `"leafRe":".*"` or count-based
"all-modules" guard again: open it, list which files it actually reads, and check that list against
the FULL leaf inventory the column owes (`docs/specs/scoreboard/modules/*.required.json`) — not against
a headcount.

**Standing instruction, permanent:** every column-wave / class-sweep PR states, in its own FIX section,
which modules it verified against real per-leaf assertions — not which modules it merely counted.
"All modules" in a task name or tag is not evidence; the per-leaf assertion list is the evidence.
