# RESERVATION LEDGER PROTOCOL — 2026-08-05

**Owner-stated, CC-3 recorded.** Three rules that stop multi-agent lanes from colliding on the same
class, the same verify-step number, or the same generated scoreboard.

---

## 1. Reserve the class-id + files BEFORE starting

Before touching a class-drain wave, reserve **both** the class-id and the file list in Cascade's
ledger (`docs/audit/AUDIT-COVERAGE-LIVE.md`, instances in `docs/audit/wave-queue.json`).

Reserving the class alone is not enough: two classes can share a hotfile and collide even though their
ids differ. That is not hypothetical — `CLS-UUID-LABEL` and `CLS-SILENT-CAP` both live in
`apps/backend/src/legal/matters.service.ts`, **nine lines apart** in the same query. Reserved as one
unit they became one PR (#4501); reserved separately they would have been two PRs fighting over the
same `SELECT`.

**Rule:** when two classes share a file, reserve them as ONE reservation so they cannot be re-split.

## 2. Draw verify-step numbers from your OWN claim-block

Never take "the next free number". Take the next free number **in your lane's band** (Rule 25 mod-4:
Cursor/CC-3 EVEN · CC-1 ≡1 · CC-2 ≡3), and claim it in a claim-only PR that merges to `origin/main`
**before** the step file is authored (Rule 37).

Why the ordering is absolute: the number is not yours until it is on `main`. Two agents that both
"discover" the same free number produce a duplicate-step CI failure that reds `main` for every lane —
which has already happened here (duplicate step 2360).

## 3. Scoreboard conflicts = union the Findings rows, then regenerate

The scoreboard is **generated**, never hand-merged. On a conflict:

1. Union the `Findings` rows — never drop a row, never pick one side.
2. Re-run the generator (`node scripts/audit-coverage-scoreboard.mjs --write`).
3. Commit the regenerated output.

Hand-resolving a generated file silently discards another lane's finding and then presents the
result as authoritative. Column ownership still applies (Rule 28): CASCADE appends rows and owns
Module/Layer/Entity/Verdict/Evidence; CODER owns Status + Block/PR; GUARD owns VERIFIED/REOPENED.

---

## Why this file exists

Every rule above is a scar. Reservation is what turns "three agents working in parallel" into three
agents working on *different* things — without it, parallelism is just a slower way to produce merge
conflicts and duplicate guards.
