# VERTICAL WIRING LAW — PERMANENT (owner-locked 2026-08-12)

**Answered = closed. Do not re-ask.**

**Supersedes:** horizontal “finish dispatch then banking” · per-seat **module lists** (e.g. “CC-2’s 5 modules”) · “Codex owns lists/customers/dispatch only” · CC-2 **verify-only / no build** during wire sprint.

**Authority:** This file wins over chat, stale INBOX paste, old `PARALLEL-10-MODULES-4-SEATS-LOCKED.md` seat-module tables, and wiring-plan rows read as “finish one module.”

**Companion:** `docs/specs/scoreboard/VERTICAL-COLUMN-WAVE-METHOD-LOCKED.md` · `docs/lockdown/WIRE-FIRST-SPRINT-LAW-2026-08-12.md` · `docs/specs/CODER-PASTE-INSTRUCTIONS-2026-08-12.md`

---

## 1. The one-line law

> **Vertical = one matrix COLUMN ID (or one CODEBASE CLASS) swept across every module that owes it — priority 10 first as the gate, then mandatory same-PR extend to all 28 sidebar modules on every owed tab/leaf/drawer/popup. Never a module-deep slice unless it closes the last hotfile of an in-flight column wave already green on the other nine priority modules.**

If coders wire vertically, **the same column group rises together** on the scoreboard — not dispatch wiring +20% while safety wiring stays flat.

---

## 2. Two vertical shapes

| Shape | ID | Scope | Example | Primary seats |
|-------|-----|-------|---------|---------------|
| **COLUMN-WAVE** | Matrix column: `driver`, `reverse_link`, `gl_je`, … | Every owed leaf in **priority 10** + **same column** on modules **11–28** in the same PR | One merge greens `reverse_link` on settlements · banking · dispatch · … | Codex (FE A+B) · CC-1 (C) · CC-2 (B API) |
| **CLASS-SWEEP** | Defect **class** repo-wide | **All matching files/routes** — measured | uncast `operating_company_id` → `$1::uuid` across entire backend | CC-2 · CC-1 (money) · Cursor (guards) |

**Forbidden: MODULE-DEEP** — dispatch-only EntityLink PRs while other modules’ `connectivity` / `reverse_link` stay red.

---

## 3. Priority 10 gate · UNIVERSAL extend to all 28 (every leaf)

| Layer | Done bar |
|-------|----------|
| **P21** — priority 10 | Box 1+2+3 = **100%** Built on every Required cell |
| **P16** — all 28 modules | Same bar on every sidebar module |
| **Code in one wave (MANDATORY)** | Sweeping a column on the urgent 10 **MUST** ship the **same wiring pattern** on **every other module that owes that column** in the **same PR** — every tab · sub-tab · create · drawer · popup · wizard leaf. Tag **every module touched** in `@matrix-built`. |

**Owner clarification 2026-08-12 (answered=closed):** Vertical work is **global**. Fixing `connectivity` / `reverse_link` / `driver` / money columns / etc. on the priority 10 is **not** “those 10 only.” Shared helpers, EntityLink, posters, pickers, FKs — land once and cover **all owed leaves system-wide**. After the priority-10 columns are green everywhere they apply, leftover work is **only** columns that were **never required** on the first 10 (module-unique Required cells on modules 11–28).

**Forbidden soft-reading:** “extend when convenient” · “priority-10-only PR then later extend” · horizontal finish-one-module.

**Sequence:** Wave **A → B → C → D** — within each wave, **one column id at a time across modules**, not one module through A–D.

---

## 4. PR contract

```javascript
/** @matrix-built {"modules":["dispatch","settlements",…],"cols":["reverse_link"],"task":"WAVE-B-reverse_link","vertical":"column-wave"} */
/** @matrix-built {"modules":["*"],"cols":["entity_scope"],"task":"CLASS-UNCAST-OPCO","vertical":"class-sweep"} */
```

**Reject:** `column-wave` with only one module (unless documented last serial slice) · OUTBOX without `column=` or `class=`.

---

## 5. Four seats (no CC-3)

| Seat | Vertical job |
|------|--------------|
| **Cursor** | Bus · INBOX sync · matrix auto-Built · vertical law guard · CI/deploy |
| **Codex** | COLUMN-WAVE **A+B** FE — one column × all owed modules per PR |
| **CC-1** | COLUMN-WAVE **C** money (serial) + money CLASS-SWEEP |
| **CC-2** | CLASS-SWEEP (whole repo) + COLUMN-WAVE **B** backend — **ships PRs**; samples after merge until gate |

**CC-2 model:** uncast opco — 331 files, one class, guard at zero.

---

## 6. Forbidden forever

- Seat **module subsets** · dispatch-only Built tags · CC-2 verify-only · CC-3 · Live before P21 gate · Jorge hand-edits Built JSON

---

## 7. Paste · INBOX

**Paste:** `docs/specs/CODER-PASTE-INSTRUCTIONS-2026-08-12.md` · **INBOX:** `docs/bus/INBOX-*.md` · **Guard:** `scripts/verify-vertical-wiring-law-present.mjs`
