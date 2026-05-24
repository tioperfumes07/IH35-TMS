# BLOCK-READY Process

`npm run block-ready` is a mechanical pre-push gate that enforces scope, verification, runtime parity, and pause-point discipline for each block.

## 10 Checks (in order)

1. C1 Clean branch start
2. C2 Block manifest present
3. C3 Clean build
4. C4 Arch + standing guards
5. C5 Canonical verify chain
6. C6 Extra gates
7. C7 Runtime parity
8. C8 Guard-required check
9. C9 Allowed-files enforcement
10. C10 DB-gate deferral declaration

## Authoring `.block-ready.json`

Required keys:

- `block_id`: string
- `phase`: string
- `task`: string
- `allowed_files`: array of glob strings
- `extra_gates`: array of npm script names
- `runtime_path`: `src`, `dist`, or `both`
- `db_required`: boolean
- `guard_required`: boolean

## Pause-Point Discipline

If any check fails, stop immediately at the failing check, surface the command tail, do not push, and rerun `npm run block-ready` after fixing the issue.

## Worked Example (MAGNET-4-FINAL)

Use `docs/block-ready-examples/MAGNET-4-FINAL.json` as `.block-ready.json`.

- Scope is constrained to accounting autoload files + guard wiring.
- Extra gates run `verify:accounting-route-map` and `verify:accounting-autoload-coverage`.
- `runtime_path` is `both` to enforce src+dist parity.
- `db_required` is true, so DB-only checks are deferred to CI per Standing Order #16 v2.
