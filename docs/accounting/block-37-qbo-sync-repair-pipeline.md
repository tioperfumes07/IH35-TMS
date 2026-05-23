# Block-37: Fix QBO sync repair pipeline

## Scope

Block-37 hardens manual QBO sync repair so only true dead-letter runs can be reopened.

## In scope

- Lock `transitionTerminalToPending` to `status='dead_letter'` only.
- Tighten state transitions so success/failure mutations require `status='running'`.
- Make retry route return clear outcomes:
  - `404 sync_run_not_found` when run does not exist in tenant scope
  - `409 retry_not_dead_letter` when run exists but is not terminal
- Align dashboard actions so "Retry now" is shown only for dead-letter rows.
- Add static CI guard and unit tests for the dead-letter repair gate.

## Out of scope

- New migrations.
- New QBO entities or outbound payload shape changes.
- Conflict auto-resolution behavior.

## Verification

- `npm run build:backend`
- `cd apps/frontend && npx tsc -b`
- `npm run verify:arch-design`
- `npx vitest run apps/backend/src/qbo/sync-state-machine.test.ts`
