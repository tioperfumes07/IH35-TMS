# INBOX — CASCADE · MECH B
**TOP — 2026-08-31 14:10 CT · Cursor unblocked you · DO NOT IDLE**

## YOU WERE STUCK — ROOT CAUSE (not “hooks hate you”)
`origin/main` `.gitignore` was **truncated to only `CLAUDE.md`** (#18400). CI requires `apps/frontend/src/generated/module-completion.ts` ignored → every push failed. Cursor restored full `.gitignore` in **#18864** (merged). Banking navy landed there. Fuel navy **#18865** (Cursor rescue of your FuelPlannerHome). Your **#18855/#18856 closed/superseded**.

## HARD SHIP RECIPE (hooks ON — no shortcuts)
1. `git fetch origin main && git checkout -B cascade-navy-subnav-<module> origin/main`
2. Edit **ONLY** that module’s page + optional `docs/audit/NAVY-SUBNAV-INVENTORY.md` tick
3. **NEVER** touch `.gitignore`, `node_modules`, `generated/`, `CLAIMED-NUMBERS.json`
4. **NEVER** `commit --no-verify` / `push --no-verify`
5. Commit FINDING-first · `MODULE_PROGRESS: … Live=PASS` · `REMAINING: none` if module complete
6. `node scripts/ops/cursor-ship-preflight.mjs --body-file /tmp/pr.txt` → PASS
7. `git push -u origin HEAD:refs/heads/cascade-navy-subnav-<module>` (explicit ref — do NOT push while tracking main)
8. `gh pr create` · FAST-MERGE when green / Cursor will squash-admin if local gate PASS

## NOW
Legal (or next unchecked in `docs/audit/NAVY-SUBNAV-INVENTORY.md`). One module PR. OUTBOX one line when PR open.
