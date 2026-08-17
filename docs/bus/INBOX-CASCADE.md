# INBOX-CASCADE · SYNC 2026-08-16 20:55 CT · OFF LIVE · NO IDLE MERGE

**READ:** `docs/bus/CONTINUOUS-LIVE-NO-STALL.md` §6

## OWNER
You do **not** Live VERIFY. Cursor/CC-1/Codex own Live.

## CONTINUOUS (never stop at 0 PRs)
1. REST list open PRs → squash-merge greens (`gh api` — avoid GraphQL rate limit)
2. CONFLICTING → OUTBOX one-liner naming PR# (owner seat fixes) — keep scanning
3. Do not OAuth-idle as a stop condition
4. Defect while merging → GUARD-WORKORDERS OPEN + OUTBOX — do not deep-Live

Loop forever until owner says stop.
