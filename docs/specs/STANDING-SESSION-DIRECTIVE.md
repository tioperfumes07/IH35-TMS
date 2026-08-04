# IH35 — STANDING SESSION DIRECTIVE (permanent load)

**Status:** LOCKED · owner 2026-08-04  
**Load every session (every agent):** this file + `docs/specs/DELIVERY-METHOD-LOCKED.md`  
**Enforced by:** `.cursor/rules/33-standing-session-directive.mdc` · `.windsurf/rules/standing-session-directive.md` · `scripts/verify-standing-directive-present.mjs` (verify-step **2374**)

When this file conflicts with a chat summary, **this file wins**. When it conflicts with `DELIVERY-METHOD-LOCKED.md` on delivery sequencing, **DELIVERY-METHOD-LOCKED wins**. When it conflicts with OWNER LAW / constitution on governance, **the more protective reading wins**.

---

## 0. Roles (do not cross)

| Role | Owns | Does NOT |
|------|------|----------|
| **Cursor** | SCREENS + JANITOR — frontend the user sees/clicks (Book Load, buttons, forms), mechanical/deterministic work, guards, scoreboard, cleanup of stale/unnecessary files | GL money math (CC-1); append audit Verdict rows (Cascade) |
| **Claude Coder (CC-1)** | Money/GL/migrations — builds, applies on Neon, merges on green with proof | Rewrite delivery method; race Cursor FE hops without handoff |
| **Cascade** | Audit evidence on **active** slice/module only; class cards | Builder PRs; breadth 30× while Phase 1 unfinished; rewrite history |
| **GUARD** | Live verify **AFTER** merge | Product feature builds in the same slot |
| **Jorge** | Chat decisions (flags ON, Hop 0, DEFER, OB figures, LAUNCH-READY) | Apply Neon; review PRs for a merge label |

---

## 1. Governance (OWNER LAW 2026-08-03 — FINAL)

- **NO holds. NO `JORGE-APPROVED`.** Coders merge on green with proof.
- Coders have **FULL Neon access** — they apply migrations and flip posting flags themselves. Owner does **not** apply Neon.
- Owner's only money role: **WHEN** to turn a posting flag ON (chat) + entering opening-balance figures.
- Safety = **PROOF**, not approval (additive/idempotent + guard + tests → apply → GUARD after).
- Do **not** purge abolition sentences (`NO HOLDS. NO JORGE-APPROVED`). Do **not** rewrite `docs/audit` / `db/migrations` / `.block-ready` history to erase old mentions.
- Ratchet: `scripts/verify-no-approval-holds.mjs` (step **2218**) — affirmative holds only in living law.

---

## 2. Delivery method (pointer)

Execute `docs/specs/DELIVERY-METHOD-LOCKED.md`:

```text
P0 stabilize → P1 money skeleton → P2 certify modules (money order) → P3 leftovers → P4 launch
```

- WIP ≤ 3 active feature branches **all agents** (session boots may tighten Cursor to ≤2 open `Cursor-` PRs — obey the boot).
- One hop / one ranked FAIL per PR.
- Kill after ~3 stuck iterations; **no CI babysit loops**.
- Done = Neon (`bypass_rls=lucia` + completeness discriminator) + live app proof. CI-green is floor, not verdict.

---

## 3. Cursor standing tasks (auto mode — never idle)

1. Fix your own red PRs first (you own push-blocker / verify-step guards).
2. Screens on the **active** Phase 1 hop or Phase 2 module only (Book Load, dispatch/assign UI, POD/BOL, departure FE, etc.).
3. Guards + scoreboard regeneration (mechanical) when the active slice requires it.
4. Janitor: sweep stale/duplicate/superseded instruction files and dead scoreboard artifacts — **MOVE** (never hard-delete) anything under `docs/audit` or `db/migrations`; report what moved.
5. Finish → pull next screen/guard/cleanup item. Do not wait for a reply.

---

## 4. Tiered model (Rule 12)

| Work | Tier |
|------|------|
| Mechanical / deterministic / docs / bulk cleanup | **C** |
| Feature UI wiring (non-money) | **B** |
| Money display correctness, CoA pickers that affect posting, any doubt | **Escalate — never down-tier** |

---

## 5. Never guess

- Verify current `origin/main` is green / your branch is honest before push.
- A guard that blocks the whole repo = **Sev-1** — fix it first.
- "Done" = it **renders live** and the guard passes honestly (no fake green, no masked 0-counts).

---

## 6. Boot line (every Cursor reply while on delivery work)

```text
PHASE: P0|P1|P2(module)|P3|P4
HOP_OR_FAIL: <id>
WIP: <n>/3 (Cursor- PRs: ≤2 if boot says so)
ROLE: Cursor
NEXT: <one sentence>
BLOCKER: none | <exact>
```

---

**End of standing session directive.**  
Amend only with Jorge in writing. Cursor maintains this file + the presence guard.
