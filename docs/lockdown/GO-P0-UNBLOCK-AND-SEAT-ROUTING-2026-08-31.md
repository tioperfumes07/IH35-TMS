# GO — P0 UNBLOCK + SEAT ROUTING · 2026-08-31 (owner)

**Canonical routing after P0.** Cascade is **back on critical path**. No seat idle.

---

## P0 status

- **Missing file:** `packages/shared-types/src/dispatch/load-state-machine.ts` (barrel pointed at ghost module)
- **Root defect class:** merge-before-CI — #18545, #18548, #18550 merged before typecheck finished
- **Owner-authored fix:** load-state-machine.ts + anti-drift guard + 18 contract tests (commit `0224d8318` patch — Cursor applies via `git am`)
- **Until main typecheck green:** every deploy-wait seat stays blocked

**Required status checks:** GO makes CI mandatory before merge — no fourth bypass.

---

## COPY-PASTE — ALL SEATS (after P0 on main)

### CURSOR

```
Cursor | ACK | P0-ROUTING | GO

NOW (serial):
1) git am P0-shared-types-load-state-machine.patch → push → FAST-MERGE (unblocks deploy)
2) Owner override PR (2460 claimed) — field-scoped WORM bypass + Owner role check
3) Update INBOXes — Cascade critical path, not Miss-C first

FORBIDDEN: merge before local typecheck + money-pr-local-gate PASS
```

### CASCADE — CRITICAL PATH (NOT Miss-C Lists first)

```
Cascade | ACK | P0-UNBLOCK | GO

NOW:
1) Finish 11 live_load_number Chrome reverts — guard #18546 stays RED until done
2) After deploy: L-0014 Close trip walk on Settlement Detail (#18548)
3) THEN unique FINDINGs (factoring 5, legal 3)

FORBIDDEN: 32 Lists Miss-C matrix chase while #18546 red | Neon UPDATE | API PATCH
PROOF: walkthrough= only — NO screenshots
```

### CC-3 + CODEX — free lanes (no deploy)

```
CC-3 | ACK | UI-CLASS | GO
Codex | ACK | UI-CLASS | GO

NOW: column-jam + subnav classes — ONE shared primitive each (DataTable, HoverDropdownNav)
NOT 24/31 hand-fixes. GO-UI-CONSISTENCY-WHOLE-APP-2026-08-31.

Miss-C Lists 25 — AFTER P0 deploy + Cascade reverts, not instead of.
```

### CC-1

```
CC-1 | ACK | DEPLOY-TRUTH | GO

L13512 blocked at 965f47a for #18535/#18539/#18548 — see INBOX ancestry table.
FACT-RESERVE-02: verify FAC-00001 premise before reverse.
Free-lane board money if all blocked.
```

### CC-2

```
CC-2 | ACK | GUARD-SWEEP | GO

Reject merge-before-CI pattern. Flag fake LIVE PROOF (#18555 class).
Six tie-outs every sweep. Reject screenshot-only / API-only proof.
```

### DEVIN-A

```
Devin-A | ACK | POST-DEPLOY-WALK | GO

When P0 deploys: live walkthrough restored transition buttons (in_transit hop).
NO screenshots — walkthrough= proof bar only.
```

---

## Deliberately Cursor-owned (owner filed, not silent-fix)

1. **verify-step 2460** — claim on main first (EVEN band)
2. **assigned_not_dispatched → dispatched** — no office button without assignment validation (filed finding, do not dispatch unassigned loads)

---

## Deploy law

No seat "waits for deploy" is valid until **main builds**. P0 first.
