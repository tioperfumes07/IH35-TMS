# NOW-CURSOR — 2026-09-30 ROUND 292 · FE+API LIVE eac3748

## HARD LINE
AlwaysTrack Dispatched = 16. Boards @ 16. No seat fixtures. No baseline raises.

## DONE
- `#23332` Load Costs FACTOR-BUT-NOT-DELIVERED
- `#23334` `394697bbf8` Needs delivery authorization FE queue
- **FE+API deploy LIVE** tip `eac37483fa` / version=`eac3748`
  - FE dep `dep-dauebg3ncjis73faafgg` · API dep `dep-dauebgbncjis73faaga0`
  - bundle HIT `needs-delivery-authorization` in `assets/index-C8LmCctm.js`
  - GET queue returns HTTP 401 unauthorized (mounted; auth-gated — not 404)

## NEXT (Owner Chrome only — no seat fixtures)
1. https://app.ih35dispatch.com/dispatch/awaiting-bol-invoice → **13615** BOL → invoice → Faro (screenshots + live row)
2. https://app.ih35dispatch.com/dispatch/needs-delivery-authorization — Authorize when rolling+invoiced
3. METHOD Print when detention approve stamps `approval_method`
