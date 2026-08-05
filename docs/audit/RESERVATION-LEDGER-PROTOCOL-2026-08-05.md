# RESERVATION LEDGER + BATCH CLAIMS — METHOD AMENDMENT
**Date:** 2026-08-05 · **Lane:** NON-FINANCIAL (docs + protocol only) · **Author of record:** Claude agent (strategist) · **Lands via:** Cascade (audit surface) + CC-3 (DELIVERY-METHOD-LOCKED pointer)

---

## Why this exists (root cause, one sentence)
Agents start work without an atomic, low-latency way to claim a **class**, a **file set**, or a **verify-step number**, so two agents grab the same thing and collide at merge.

**Observed 2026-08-05 (all same root cause):**
1. Three duplicate-work collisions in one session — ACCT-F117 ID clash (#4484 vs #4487), deduction-ack dup (#4483 vs #4486), cert-leak dup (#4492 vs #4493).
2. Agents serializing on Rule 37 verify-step numbers (CC-3 held for an "even" claim; the 2632 meta-guard blocked behind another PR).
3. A merge conflict entirely inside the **generated** Scoreboard block of `AUDIT-COVERAGE-LIVE.md` (#4491 — 685/14 vs 686/18).

This amendment adds three mechanisms. None of them require a human or a single gatekeeper agent in the loop.

---

## Mechanism 1 — RESERVATION LEDGER (`docs/audit/RESERVATION-LEDGER.md`)

**Multi-writer, append-only.** This file is **explicitly carved out of Rule 28.** Unlike `AUDIT-COVERAGE-LIVE.md` (Cascade is the sole appender of Findings), **every agent appends its OWN reservation rows here.** This removes the bottleneck where an agent cannot start until Cascade posts a row for it.

**Row shape (one line, append-only):**
```
| <ISO-ts CST> | <agent> | <class-id | finding-id> | <files: comma-separated paths> | RESERVED | <branch/PR> |
```
Release is a **new** dated row (never edit in place — supersede):
```
| <ISO-ts CST> | <agent> | <class-id | finding-id> | — | RELEASED | <merged PR #> |
```

**Reserve-before-start protocol (every class / finding):**
1. `git pull --ff-only origin main`.
2. Scan for an **active** `RESERVED` row whose **class-id/finding-id matches** OR whose **file set overlaps** yours.
3. Overlap → **STOP.** That work is taken. Pick the next class, or coordinate in-thread.
4. Clear → append your `RESERVED` row, commit (docs-only, atomic), push, self-merge on green.
5. Push rejected (non-ff — someone appended first) → re-pull, re-scan (step 2). Their reservation now exists → you back off. **This is the optimistic lock; it needs no gatekeeper.**

**Scope rules:**
- A reservation covers the **class-id AND the concrete file paths you will write.** List the files — reserving a class does not reserve files you didn't name.
- Release when your PR merges or you abandon the work. A class with no active `RESERVED` row is free.
- GUARD/verify-after (read-only) does **not** reserve files — it writes only docs-only evidence and never collides on product code.

---

## Mechanism 2 — BATCH CLAIM BLOCKS (Rule 37 verify-step numbers)

**Retire the even/odd hand-off.** It only ever existed to avoid cross-agent collision on a shared counter; per-agent blocks make it unnecessary and remove the wait.

**Allocation.** At session start (or when a block is ~80% used), Cascade allocates a **contiguous, non-overlapping block of verify-step numbers per agent**, recorded in the ledger:
```
| CLAIM-BLOCK | CC-1     | 2640-2669 |
| CLAIM-BLOCK | CC-3     | 2670-2699 |
| CLAIM-BLOCK | CC-2     | 2700-2729 |
| CLAIM-BLOCK | Cascade  | 2730-2759 |
```
*(Cascade sets the true base = next free number above the current max in `scripts/verify-steps/`. The numbers above are an example — confirm the base before seeding.)*

**Use.** An agent draws the next unused number from **its own block**, records `| CLAIM-<n> | <agent> | <finding> |`, and proceeds — no waiting on another agent. Rule 37's "claim before author, verified on main" is unchanged; only the number **source** changes (own block, not a shared counter). Blocks never overlap → two agents can never claim the same number. When a block runs low, the agent appends a request line and Cascade allocates the next contiguous block.

---

## Mechanism 3 — SCOREBOARD-REGEN RULE (kills the generated-block merge conflict)

The Scoreboard block of `AUDIT-COVERAGE-LIVE.md` is **generated** (Rule 8) and is **NEVER hand-merged.**

**On ANY merge conflict inside the Scoreboard block:**
1. Take the **UNION of the Findings rows** from both sides (Findings rows are append-only and never destructively conflict).
2. Discard **both** generated Scoreboard blocks.
3. Regenerate: `node scripts/audit-coverage-scoreboard.mjs --write`.
4. Commit the regenerated block. Verify each side's rows survived (appended Findings row present; CODER `Status` edits intact; no `Verdict`/`Evidence`/`Auditor` cell touched).

*(This is exactly what CC-1 did to resolve #4491 — this rule codifies it so it isn't re-derived each time.)*

**Reduce the conflict happening at all — append-lease.** Appending to `AUDIT-COVERAGE-LIVE.md` takes a short lease in the reservation ledger, held only for the seconds it takes to pull → append → regen → push, then released:
```
| <ts> | <agent> | APPEND-LEASE | AUDIT-COVERAGE-LIVE.md | RESERVED | — |
| <ts> | <agent> | APPEND-LEASE | AUDIT-COVERAGE-LIVE.md | RELEASED | — |
```
One appender at a time; others wait a few seconds on the lease, not on a person.

---

## Wiring (so the amendment is discoverable)
- **`docs/audit/AUDIT-COVERAGE-LIVE.md` header** — add: *"Before starting a class/finding, RESERVE it in `RESERVATION-LEDGER.md` (multi-writer, carved out of Rule 28). Draw verify-step numbers from your own CLAIM-BLOCK. On a Scoreboard conflict: union the Findings rows and regenerate — never hand-merge."*
- **`docs/specs/DELIVERY-METHOD-LOCKED.md`** — one-line pointer to this protocol (CC-3 lands, sole author).
- **`docs/audit/wave-queue.json`** — each class card MAY carry an informational `reserved_by` mirror of the ledger; the **ledger is source of truth**.

## Who lands what
- **Cascade:** this protocol doc, the initial `RESERVATION-LEDGER.md` (seeded — below), and the `AUDIT-COVERAGE-LIVE.md` header line. Self-merge on green (non-financial, docs-only).
- **CC-3:** the one-line pointer in `DELIVERY-METHOD-LOCKED.md`.
- **All agents:** adopt reserve-before-start immediately.

## Immediate seed (so nobody waits this session)
Cascade seeds `RESERVATION-LEDGER.md` on creation with:

**Claim blocks** (base = next free ≥ current max in `scripts/verify-steps/`; example base 2640):
```
| CLAIM-BLOCK | CC-1 | 2640-2669 |
| CLAIM-BLOCK | CC-3 | 2670-2699 |
| CLAIM-BLOCK | CC-2 | 2700-2729 |
| CLAIM-BLOCK | Cascade | 2730-2759 |
```

**Active class reservations (in-flight now):**
```
| CC-1 | CLS-DISP-WIRE-06 | integrations/relay-payments/relay-fuel-canonical-bridge.ts, expense_attribution.expense_load_links | RESERVED |
| CC-1 | CLS-GL-DARK (ratchet) | scripts/verify-gl-posting-coverage.mjs | RESERVED |
| CC-1 | CLS-DUAL-PATH (ratchet) | scripts/verify-qbo-canonical-recon.mjs | RESERVED |
| CC-3 | CLS-DISP-WIRE-07 | apps/backend/.../delivery-evidence-latch.ts, driver/loads.routes.ts, driver-pwa/dispatch-view.routes.ts, mdata/loads.routes.ts | RESERVED |
| CC-3 | CLS-ORPHAN-SURFACE / CLS-UUID-LABEL / CLS-SILENT-CAP | (list on start) | RESERVED |
| CC-2 | verify-after (read-only, docs-only evidence) | — | N/A |
```

## Landing checklist (docs-only)
- DoD-A PASS (protocol stated, root cause named) · DoD-B/C/D N/A (no schema/RLS/product code) · DoD-E PASS (reads main).
- No migration. No flag. No money surface. Non-financial → self-merge on green CI.
