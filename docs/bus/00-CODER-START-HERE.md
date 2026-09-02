# START HERE

0. `git pull --ff-only origin main`
1. **NOW** = `docs/bus/INBOX-<SEAT>.md` TOP + `docs/bus/NOW-ONE-SOURCE.md`
2. Packet if named: `docs/bus/PASTE-ALL-SEATS-STOP-NO-SEAT-LOADS-2026-09-01.md` · `docs/bus/PASTE-ALL-SEATS-GO-19-2026-09-01.md` · `docs/lockdown/GO-19-BUILD-QUEUE.md` · NEVER POST Book Load
3. `curl -sS https://api.ih35dispatch.com/api/v1/healthz/shallow` — expect **12bfbd6** (or later tip that contains it)
4. FAST-MERGE. Never `gh pr checks --watch`. CC never `trigger_deploy`.

**SEARCH BEFORE YOU ASK.** If GO-12 / GO-13 / your INBOX already answers it, do not ping Jorge or Cursor.

Ignore Urgent 6, WAVE*, U14 hops, Desktop `_SUPERSEDED-*`, `docs/bus/archive/`. Those are not NOW.
