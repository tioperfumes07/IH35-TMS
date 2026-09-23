# LANE_CROSS — CURSOR — ROUND 117 / 119 / 120 — Direction-1 purge-window on verify-void-is-whole — 2026-09-23

Owner / Lead ROUND 117–120: after #22423 landed `stampDocumentVoided()` on main, Cursor resumes
the production E10 void loop on the #22423 tip AND makes `verify-void-is-whole` window-aware
using the repo's own purge-window mechanism — not a bypass, not a baseline edit.

## CROSS GRANTED

CURSOR may touch, for this work:

- `scripts/verify-void-is-whole.mjs` (CC-1 money guard; originally R-102-C)
- `scripts/lib/purge-window.mjs` (CC-1; PURGE_WINDOW_GUARDS list)
- `scripts/verify-purge-window-exemption.mjs` (CC-1 static exemption)
- `scripts/verify-purge-window-state.mjs` (CC-1 state)
- `purge_state.json` (open the window for the mass-void / pre-purge campaign)

## RULED BEHAVIOR (non-negotiable)

1. Direction 1 (ledger dead / header live) MAY exit `EMPTY_BY_PURGE_EXIT` (75) while the purge
   window in `purge_state.json` is open. Transient by construction during a void run (incl. the
   factoring two-tx race: reverseFactoringAdvanceEvent outside inTx, stamp in a separate inTx).
2. Direction 2 (header stamped VOIDED over LIVE postings) STAYS HARD, always. Never
   window-exempt.
3. Do NOT widen `scripts/verify-void-is-whole.baseline.json` (the 92). Re-price once from fed
   data after the feed.
4. Cite: `PURGE_WINDOW_GUARDS` + `acceptedAsEmptyByPurge()` in `money-pr-local-gate.mjs` +
   `verify-purge-window-state.mjs`.

## CITE

```
LANE_CROSS=09-23-2026-LEAD-RULING-CURSOR-ROUND117-VOID-D1-PURGE-WINDOW.md
```
