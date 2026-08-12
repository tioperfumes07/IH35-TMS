# VERTICAL WIRING LAW — PERMANENT (owner-locked 2026-08-12 · seq clarify evening)

**Answered = closed. Do not re-ask.**

**Supersedes:** horizontal “finish dispatch then banking” · per-seat **module lists** · “Codex owns lists/customers/dispatch only” · CC-2 **verify-only** · “P10 done = A–C done” · stale OUTBOX “holding / owner-gate / legacy exhausted”.

**Authority:** This file wins over chat and stale INBOX/OUTBOX.

**Companion:** `docs/specs/scoreboard/VERTICAL-COLUMN-WAVE-METHOD-LOCKED.md` · `docs/lockdown/WIRE-FIRST-SPRINT-LAW-2026-08-12.md` · `docs/specs/CODER-PASTE-INSTRUCTIONS-2026-08-12.md`

---

## 1. The one-line law

> **Vertical = one matrix COLUMN ID (or one CODEBASE CLASS). Owner sequence: (1) finish every missing Required cell for that column on the priority 10 modules · (2) then finish that same column across ALL remaining modules that owe it — every tab/leaf/drawer/popup — until full-module audit is 100%. Never stop at P10. Never module-deep horizontal.**

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
