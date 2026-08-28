# Seat feed (overwrite)

Each `NOW-<SEAT>.md` is the **current instruction**. History lives in INBOX. Seats that only read INBOX TOP of a 1,000-line file miss the GO.

**Sync to Desktop** (seats that do not pull git):

```bash
node scripts/ops/sync-seat-feed.mjs
```

Writes `~/Desktop/IH35-SEAT-FEED/NOW-<SEAT>.md`.
