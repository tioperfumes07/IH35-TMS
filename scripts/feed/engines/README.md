# Settlement feed engines — canonical copy

`parse_settlements.py` (signed settlement text -> parsed.json) and `build_feed_input.py` (parsed.json -> feed_input.json,
consumed by `scripts/feed/feed-settlement-day.mts`). Versioned here 2026-10-04 so a fix is reviewed, guarded and cannot
silently drift; the working copies in `IH35-RECONCILIATION-AND-FEED/01-ENGINES/` are synced FROM this folder.

Guard: `scripts/verify-feed-expense-load-by-proof.mjs` (verify-step 14881).

Run (from any scratch directory):
    SETTLEMENT_TEXT_DIR=<settlement-text dir> python3 <repo>/scripts/feed/engines/parse_settlements.py
    python3 <repo>/scripts/feed/engines/build_feed_input.py
