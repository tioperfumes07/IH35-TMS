# LEAD RULING — GATE-SCOPE-02 (CC-2 lane cross on `scripts/lib/**`, `scripts/verify-*.mjs`, CI)

Owner/Lead packet, verbatim (P0, three seats blocked):

> CC-2 — GATE-SCOPE-02. Third instance of the same defect, P0.
>
> DATA_WRITE_PATHS = ["db/migrations/", "scripts/ops/"] in
> money-pr-local-gate.mjs is a blunt path match. It triggers every
> live-domain guard on files that write nothing:
>   db/migrations/CLAIMED-MIGRATION-NUMBERS.json — a claim registry, not a
>     migration. Blocks Codex's claim-only PR right now.
>   scripts/ops/settlement-truth-target.mjs — reads a static JSON file, imports
>     no DB client. Blocks CC-3's branch right now.
>
> GATE-SCOPE-01 fixed the DATABASE_URL over-trigger. This is the other half.
>
> FIX — CC-3's proposal (b), it needs no upkeep: a file under a
> DATA_WRITE_PATH triggers live-domain guards only if it actually imports a DB
> client (pg, Client, Pool, DATABASE_URL). A .json registry and a read-only
> script never do. Keep (a) as the escape hatch: an explicit read-only
> manifest for edge cases.
>
> GUARD: scripts/verify-data-write-path-detection-is-content-based.mjs —
> fails when a file under a DATA_WRITE_PATH that imports no DB client still
> triggers the live-domain set. Required 0.
>
> This has now blocked three seats on three different files. Fix the mechanism,
> not the files.

This authorizes CC-2 to edit `scripts/money-pr-local-gate.mjs` (CC-1 lane), add
`scripts/lib/data-write-path-detection.mjs` (CC-1 lane, `scripts/lib/**`), add
`scripts/verify-data-write-path-detection-is-content-based.mjs` (CC-1 lane, `scripts/verify-*.mjs`)
and wire it into `.github/workflows/ci.yml` (SHARED, declared here anyway) plus
`money-pr-local-gate.mjs`'s own STEPS array. No other guard logic touched.
