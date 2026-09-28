# Lead ruling — verify-control-totals 5804–5815 expect after AUTH-056

**Date:** 2026-09-28  
**Seat:** Cursor (ROUND 154.4 company settlement PDF ship)  
**Authority:** AUTH-056 (CONSUMED) re-priced settlement 5812 at $0.45/mi.

## Measured (Neon `br-fancy-credit-akjnd07a`, bypass_rls=lucia, USMCA)

| ref | net_pay |
|-----|---------|
| 5804–5811, 5813–5815 | unchanged vs prior control base |
| **5812** | **1652.47** (was −50.00 paperwork escrow-only) |
| **SUM 5804–5815** | **21893.54** |

Identity check: `20191.07 − (−50) + 1652.47 = 21893.54` — the entire delta is AUTH-056’s 5812 pay-at-0.45 close (escrow 75 on header → net 1652.47).

## Ruling

Update `scripts/verify-control-totals.mjs` expect for “Driver settlements 5804-5815 net pay” from **20191.07 → 21893.54**. This is not plugging a variance; it re-anchors the control to the post–AUTH-056 AlwaysTrack-truth driver net after 5812 stopped printing $0.00/mi.

Filename cited in PR body per verify-control-totals header law.
