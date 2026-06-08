# GAP-50 — AI Photo Comparison (Pre-Trip vs Post-Trip Damage Detection)

**Block:** GAP-50 (Wave G-X, Lane A)  
**Dependencies:** GAP-40 (EXIF chain-of-custody), GAP-38 (damage continuity)

## Problem

Drivers capture pre-trip photos but no automated diff detects new in-transit damage. Disputes lack definitive before/after evidence.

## Solution

1. **Migration** `202606071830_pre_post_trip_photo_sessions.sql` — `safety.photo_comparison_sessions` with pre/post evidence UUID arrays, diff status, findings JSONB.
2. **Session service** — start pre-trip session, submit post-trip photos, list/get sessions, manual override (Manager+).
3. **Anthropic vision** (`anthropic-client.ts`) — Claude `claude-sonnet-4-20250514` compares paired angle photos via `ANTHROPIC_API_KEY`.
4. **Diff engine** — pairs photos by `angle_label` in EXIF metadata (GAP-40), aggregates findings, auto-creates damage report + continuity chain (GAP-38) on high-confidence damage.
5. **API routes** — `/api/safety/photo-comparison/*`
6. **Driver PWA** — 8-angle guided capture with EXIF-preserving upload (`preserve-exif-on-upload.ts`).
7. **Frontend** — `SessionDetail`, `PhotoDiffViewer`, `DiffFindingsList` for dispatcher/safety review.

## EXIF chain (GAP-40)

Trip photos upload through `uploadTripPhotoEvidence`, which calls `validateAndPreserveExif` and `appendCustodyEvent` from the GAP-40 chain-of-custody service. `angle_label` is stored in `exif_metadata` for pairing.

## Status machine

| Status | Meaning |
|--------|---------|
| `pending` | Pre-trip only |
| `analyzing` | Post-trip submitted, AI running |
| `clean` | No new damage |
| `damage_detected` | High-confidence findings → auto damage report |
| `review_required` | Low-confidence findings for Manager review |
| `manual_override` | Manager+ audited override |

## CI

`verify:photo-comparison-ai` — structural guard in CI chain.
