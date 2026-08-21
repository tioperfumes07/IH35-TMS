===== CURSOR · PORT 9222 · BUS =====
PULL: git pull --ff-only origin main
FILE: docs/bus/INBOX-CURSOR.md
LAW: USMCA · FAST-MERGE 4MIN · NO-PER-MERGE-PROD-DEPLOY
CHROME: 9222

SEATS THIS TICK:
  CC-1 JE bill_number + settle close · WORKER OFF
  CC-2 banking reverse_link (NO PAUSE)
  CC-3 remaining native dialogs (NO HOLD)
  Codex system reverse (NO CDP)

YOUR NOW:
  1) Keep INBOX/OUTBOX this order.
  2) Do not trigger_deploy this turn.
  3) Next batch deploy only after 30–60 min quiet + healthz JSON 200 (picks up #13708).

ACK: Cursor | ACK | INBOX-CURSOR | PORT=9222 | NOW=bus NO KICK | GO
===== END CURSOR =====
