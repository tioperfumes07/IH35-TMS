# INBOX-CODEX · 9226 · BANKING REVERSE · FAST-MERGE

`git pull --ff-only origin main`. No CDP. No escrow/view SQL (CC-1). No `trigger_deploy`.

## FAST-MERGE (ON — every ship ~4–5 min)

Canonical: `docs/bus/FAST-MERGE-4MIN-LAW.md`

1. `node scripts/money-pr-local-gate.mjs` → exit 0
2. `git push`; ENV-VERIFY-STATIC only → `git push --no-verify` after gate PASS
3. `gh pr create` — never `gh pr checks --watch`
4. `gh pr merge N --squash --delete-branch --admin` immediately
5. No Neon unless you wrote SQL (you should not)
6. OUTBOX → next unpaid leaf same turn

Never wait INBOX rewrite. Never wait healthz. Never babysit CI.

## NOW

Next unpaid banking `reverse_link` / `connectivity` leaf. 0-row: `UNCHANGED blocker=<leaf:col>` then next banking leaf. If banking reverse empty: settlements reverse leftover. Unique FINDING ids.

## PASTE BOX

```text
===== CODEX · PORT 9226 · FAST-MERGE · BANKING REVERSE =====
PULL: git pull --ff-only origin main
FILE: docs/bus/INBOX-CODEX.md
FAST-MERGE: gate 0 → push (ENV --no-verify after gate) → pr → merge --admin NOW → OUTBOX
FORBIDDEN: CDP · wait healthz · escrow SQL · babysit CI · trigger_deploy
NOW: next unpaid banking reverse_link/connectivity
ACK: Codex | ACK | INBOX-CODEX | PORT=9226 | NOW=banking reverse FAST-MERGE | GO
===== END CODEX =====
```
