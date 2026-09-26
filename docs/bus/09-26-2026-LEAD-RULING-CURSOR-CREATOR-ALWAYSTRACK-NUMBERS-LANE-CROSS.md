# LANE_CROSS — CURSOR — Settlement Creator AlwaysTrack numbers — 2026-09-26

## Authorization

Owner, verbatim (session 2026-09-26 CT), continuing R-186.2 Settlement Creator:

> "ok, yes and we follow always numbers."

Preceding owner order (same session): Settlement Creator must create NEW only — next number
automatically, locked until small Edit. Cursor already shipped that path as #22811 (P-series peek).
This ruling authorizes the immediate correction: default identity is AlwaysTrack
`source_document_ref` digits (Rule 03), not P-series `display_id`.

Cursor owns R-186.2 Creator live delivery (OUTBOX-CURSOR 2026-09-26 · #22789 / #22811). CC-3 lane
map still lists `settlement-creator.*` filenames; this is owner-ordered continuation of the same
Creator vertical Cursor is already on, not a new CC-3 sweep.

## Files touched outside CURSOR's default lane map

1. `apps/backend/src/driver-finance/settlement-creator.routes.ts` — peek → AlwaysTrack next_number
2. `apps/backend/src/driver-finance/settlement-creator.service.ts` — empty Post allocate AT ref
3. `apps/backend/src/driver-finance/settlement-source-document-ref.service.ts` — peekNext helper
4. `apps/backend/src/driver-finance/settlement-display-id.ts` — comment only (P peek no longer Creator default)
5. `scripts/verify-settlement-creator-ties-document.mjs` — guard asserts AT peek/mint (CC-1 filename; Creator contract Cursor owns)

## What is NOT claimed

- R-186.1 (no AT mint on Book Load / open pre-settlement) unchanged
- No QBO write-back
- No Neon INSERT seed; no attach to existing open P
- P-NNNN remains Edit-only override only

## Gate wire

```
LANE_CROSS=docs/bus/09-26-2026-LEAD-RULING-CURSOR-CREATOR-ALWAYSTRACK-NUMBERS-LANE-CROSS.md
```
