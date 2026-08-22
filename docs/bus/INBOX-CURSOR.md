# INBOX-CURSOR · 9222 · ACCOUNTING LIVE · FAST-MERGE BUS

`git pull --ff-only origin main`. **No second `trigger_deploy`.**

## FAST-MERGE (ON — every ship ~4–5 min)

Canonical: `docs/bus/FAST-MERGE-4MIN-LAW.md`

1. `node scripts/ops/cursor-ship-preflight.mjs --body-file /tmp/pr-body.txt` → exit 0
2. `git push`; ENV-VERIFY-STATIC → `git push --no-verify` after gate PASS (do not sit on verify-static)
3. `gh pr create` — never `gh pr checks --watch`
4. `gh pr merge N --squash --delete-branch --admin` immediately
5. Neon if money/migrations
6. OUTBOX → next Accounting leaf / next INBOX rewrite

Seats are **not** held for Accounting CERTIFIED.

## NOW

Accounting Fully-Wired 1–12 Live Chrome on **current** healthz SHA (`0cec933` JSON 200 until it moves). CERTIFIED only if all applicable items pass on that SHA. Unique FINDINGs. Keep rewriting seat INBOX if they idle.

## PASTE BOX

```text
===== CURSOR · PORT 9222 · FAST-MERGE · ACCOUNTING LIVE =====
PULL: git pull --ff-only origin main
FILE: docs/bus/INBOX-CURSOR.md
FAST-MERGE: preflight 0 → push (ENV --no-verify after gate) → pr → merge --admin NOW
SEATS: CC-1 view _cents · CC-2 /factoring INV-2026-00038 · CC-3 SAVE-NOOP · Codex banking reverse
NOW: Accounting FW 1–12 on current healthz SHA
ACK: Cursor | ACK | INBOX-CURSOR | PORT=9222 | NOW=Accounting Live FAST-MERGE | GO
===== END CURSOR =====
```
