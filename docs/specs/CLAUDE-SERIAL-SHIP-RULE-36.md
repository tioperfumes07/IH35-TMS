# RULE 36 — Claude serial ship sequence (canonical mirror)

Autoload: `.cursor/rules/36-claude-serial-ship-sequence.mdc` (`alwaysApply: true`).

Owner 2026-08-05: Cursor rebase thrash vs Claude’s ~50 clean merges. Cursor must copy Claude’s **serial tip-main ship** method.

See the rule file for the full HARD SEQUENCE. Delivery plan: `docs/specs/DELIVERY-METHOD-LOCKED.md` §9.2.1 (rev G+).

Mechanical tooth: `scripts/ops/cursor-ship-preflight.mjs` fails if `origin/main` is not an ancestor of `HEAD`.
