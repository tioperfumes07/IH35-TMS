# IH35 Agent Bus — NOT in this git repo

If you grepped the repo for `INBOX-DEVIN` / `OUTBOX` / `00-AGENT-BUS` and got **no matches**, that is expected.

**Canonical bus folder (absolute):**
`/Users/jorgemunoz/Desktop/IH35-CURSOR-AUDIT/USMCA-WEEKEND-LEAD-2026-08-07/`

| Seat | Read first | Write |
|------|------------|-------|
| Devin-A | `INBOX-DEVIN.md` + `STATUS-NOW.md` | `OUTBOX-DEVIN.md` line prefix `DEVIN-A \|` |
| Devin-B | `INBOX-DEVIN-2.md` + `STATUS-NOW.md` | `OUTBOX-DEVIN.md` line prefix `DEVIN-B \|` |
| Cascade | `INBOX-CASCADE.md` + `STATUS-NOW.md` | `OUTBOX-CASCADE.md` |
| Cursor | authors bus | `OUTBOX-CURSOR.md` |

Law file: `00-AGENT-BUS.md` in that folder.

**Every cycle:** Read STATUS-NOW → Read your INBOX → work → one OUTBOX line. Chat is not the command channel.
