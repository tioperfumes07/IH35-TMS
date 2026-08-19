# SEAT COMMS LAW · 2026-08-19T23:10Z · PERMANENT

**Owner:** Jorge. **Lead:** Cursor. **Jorge is not the messenger.**

Coders talk to **Cursor (lead)** and **to each other** on the repo bus. Chat-only is a defect. A stale INBOX that nobody reports is a defect.

## Channel (only)

| Write | File | Who |
|-------|------|-----|
| Orders | `docs/bus/INBOX-<SEAT>.md` TOP | **Cursor lead only** |
| Status / pings / findings | `docs/bus/OUTBOX-<SEAT>.md` first line | **that seat** |
| Cross-seat ping | your OUTBOX **and** `OUTBOX-CURSOR.md` (append) | any seat |
| Never | rewrite another seat’s INBOX | everyone except Cursor |

`git pull --ff-only origin main` before you treat an INBOX as current.

## Stale INBOX (HARD)

An INBOX is **stale** when any of these is true:

- TOP NOW names a FO already **merged** on `origin/main` (example: Codex `CLS-SILENT-LIST-CAP-FACTORING` after [#10144](https://github.com/tioperfumes07/IH35-TMS/pull/10144))
- TOP contradicts `SESSION-BOOT-MANDATE.md` / `CODER-INSTRUCTIONS-NOW.md` (wrong CDP, OFF seat building, money on Codex, Clicked on Codex)
- TOP is older than a Cursor `REWAKE` / `INBOX …Z` line in `OUTBOX-CURSOR.md` that you never pulled
- You are looping a shipped SHA and calling it NOW

**If you notice it (your seat or another):**

1. Same turn, OUTBOX first line:
   ` <SEAT> | STALE INBOX | target=<Codex\|CC-1\|…> | why=<FO already PR #N / wrong CDP / …> | GO `
2. Same turn, append the **same line** to `docs/bus/OUTBOX-CURSOR.md` so the lead cannot miss it.
3. Keep working from `CODER-INSTRUCTIONS-NOW.md` §4 ladder for **your** seat until Cursor rewrites the INBOX. Do **not** idle. Do **not** ask Jorge.
4. Cursor rewrites that INBOX TOP **same turn** after seeing the ping, then OUTBOX: `Cursor | INBOX FIXED | seat=… | NOW=… | GO`

## Between seats

- Different files, same hour. Tip the other seat’s OUTBOX if you collide on a hotfile: `CC-2 | PING Codex | hotfile=X | you take reverse I take picker | GO`
- Do not steal another seat’s NOW. Do not wait for them to “finish the module.”
- Devin 502 / healthz: ping Cursor + Devin OUTBOX; **never** a 502-diary PR.

## Cursor lead duty

On every STALE INBOX ping, and whenever a seat OUTBOX says idle / awaiting FO: rewrite that INBOX TOP, bump `STATUS-NOW.md` seat row, ACK on `OUTBOX-CURSOR.md`.
