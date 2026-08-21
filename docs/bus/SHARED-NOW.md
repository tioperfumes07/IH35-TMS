# SHARED BUS · ALL FIVE SEATS
**Folder (repo):** `docs/bus/`  
**Folder (Desktop):** `~/Desktop/IH35-CURSOR-AUDIT/USMCA-WEEKEND-LEAD-2026-08-07/`

Jorge is **not** the messenger. Write here, not only chat. **Close `/program/matrix` — see `NO-PERSISTENT-MATRIX-TAB.md`.**

| Write | File | Who |
|-------|------|-----|
| Orders | `INBOX-<SEAT>.md` TOP | **Cursor only** |
| Status / ACK / NEXT | `OUTBOX-<SEAT>.md` **first line** | that seat |
| Cross-seat ping | your OUTBOX **and** target OUTBOX first line **and** `OUTBOX-CURSOR.md` | any seat |
| Picker FAIL | prepend `OUTBOX-CC-2.md` | everyone |
| Money FAIL | prepend `OUTBOX-CC-1.md` | everyone |
| Shared NOW (this hour) | this file + `STATUS-NOW.md` | Cursor |

`git pull --ff-only origin main` before you treat any of these as current.
