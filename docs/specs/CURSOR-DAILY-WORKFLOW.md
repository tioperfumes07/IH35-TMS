# Cursor Daily Workflow (Phase 7+)

This is the default operator workflow for block-by-block delivery.

## Start of session

1. Run `npm run sync`.
2. Confirm branch, main head, open PR signal, env readiness, and recommended next action.
3. If branch is already merged upstream, switch back to `main` and start the next block branch.

## Implementing a block

1. Create/switch branch safely:
   - `npm run branch:safe-switch -- <branch>` (or create from `origin/main` first).
2. Make block-scoped changes only.
3. Ship via one command:
   - `npm run block:ship -- "<commit message>"`

`block:ship` handles sync, commit decision, precheck, and push guardrails.

## Recovering from confusion/state drift

1. Run `npm run sync`.
2. Follow the `RECOMMENDED NEXT` line from the report.
3. If behind main, rebuild linearly before trying to push:
   - `npm run branch:rebuild-linear -- --source <sha> --message "<msg>"`

## Cleanup

Preview stale branches:

- `npm run branch:cleanup-stale -- --dry-run`

Delete stale branches after review:

- `npm run branch:cleanup-stale`

## Notes

- Never bypass pre-push hooks.
- Use `--force-with-lease` only.
- Keep `.block-ready.json` aligned to the active block before shipping.
