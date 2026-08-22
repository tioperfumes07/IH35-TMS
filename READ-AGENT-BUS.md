# IH35 Agent Bus — SINGLE CHANNEL

**Canonical (in git):** `docs/bus/`  
**Orders until U14 done:** `docs/lockdown/URGENT-14-EXCLUSIVE-MODULE-CERTIFY-LAW-2026-08-22.md`

| File | Purpose |
|------|---------|
| `docs/lockdown/URGENT-14-EXCLUSIVE-MODULE-CERTIFY-LAW-2026-08-22.md` | Exclusive module certify (session boot) |
| `docs/bus/STATUS-NOW.md` | Who owns which module now |
| `docs/bus/INBOX-<SEAT>.md` | That seat’s current module only |
| `docs/bus/OUTBOX-<SEAT>.md` | Seat self-reporting (append one line) |
| `docs/bus/INBOX-SYNC-LAW.md` | Single-channel + no HOLD |

**Desktop mirror (symlinks only):**  
`~/Desktop/IH35-CURSOR-AUDIT/USMCA-WEEKEND-LEAD-2026-08-07/` → same files as `docs/bus/`  
Setup: `bash scripts/ops/bus-symlink-desktop.sh`

| Seat | Read | Write |
|------|------|-------|
| Cascade | `INBOX-CASCADE.md` + `STATUS-NOW.md` | `OUTBOX-CASCADE.md` |
| Codex | `INBOX-CODEX.md` + `STATUS-NOW.md` | `OUTBOX-CODEX.md` |
| CC-1 | `INBOX-CC-1.md` + `STATUS-NOW.md` | `OUTBOX-CC-1.md` |
| Cursor (lead) | all OUTBOX + STATUS | STATUS + all INBOX + `OUTBOX-CURSOR.md` |

**Every cycle:** `git pull` → law → your INBOX → work → one OUTBOX line → FAST-MERGE.  
**Chat is not the bus.**
