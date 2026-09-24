# FARO PURCHASE DAY FEED — NO DEVIATION LAW (2026-09-24)

**Status:** LAW. Always-apply Cursor rule `52-faro-purchase-day-feed-no-deviation.mdc`.
**Owner order (verbatim):** guarantee no deviation; write it as law that cannot be worked around,
disobeyed, or forgotten; continue.

## Binding process

1. Unit = **Faro purchase day** (`day_control.json` `inv[]`). Round 152.1.
2. Every invoice that day gets **full** composition: load + stops + charges + invoice + Faro
   advance + driver bill + fuel + expenses + cash advances as bill payments + escrow/admin + tour.
3. **App writers only** — no raw Neon inserts into money tables as the feed.
4. Gates green → `feed_cursor` close → only then the next day.
5. Faro and AlwaysTrack must both tie that day; surfaces share one source of truth.

## Forbidden

Advance-only Faro. Neon bulk-seed catch-up. Skipping day close. Feeding ahead of a dirty/pending day.

## Package

`~/Downloads/IH35-RECONCILIATION-AND-FEED/` — engines, controls, gates, source PDFs.
Live start: first non-closed purchase day (8/10/26 until closed).

## Guard

`scripts/verify-faro-purchase-day-feed-law.mjs`
