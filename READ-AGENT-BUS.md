# IH35 Agent Bus — SINGLE CHANNEL

**Canonical (in git):** `docs/bus/`

| File | Purpose |
|------|---------|
| `docs/bus/STATUS-NOW.md` | Who does what now |
| `docs/bus/INBOX-<SEAT>.md` | Orders for that seat |
| `docs/bus/OUTBOX-<SEAT>.md` | Seat self-reporting (append one line) |
| `docs/bus/INBOX-SYNC-LAW.md` | Single-channel + no stale-rewake law |

**Desktop mirror (symlinks only):**  
`~/Desktop/IH35-CURSOR-AUDIT/USMCA-WEEKEND-LEAD-2026-08-07/` → same files as `docs/bus/`  
Setup: `bash scripts/ops/bus-symlink-desktop.sh`

| Seat | Read | Write |
|------|------|-------|
| Cascade | `INBOX-CASCADE.md` + `STATUS-NOW.md` | `OUTBOX-CASCADE.md` |
| Codex | `INBOX-CODEX.md` + `STATUS-NOW.md` | `OUTBOX-CODEX.md` |
| CC-1 | `INBOX-CC-1.md` + `STATUS-NOW.md` | `OUTBOX-CC-1.md` |
| Cursor (lead) | all OUTBOX + STATUS | STATUS + all INBOX + `OUTBOX-CURSOR.md` |

**Every cycle:** `git pull` → STATUS → your INBOX → work → one OUTBOX line → push.  
**Chat is not the bus.** Lead must not re-post an INBOX a seat already ACK'd.
