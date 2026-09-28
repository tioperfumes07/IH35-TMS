# LEAD RULING — verify-control-totals 5804–5815 net pay after AUTH-089 (5812 deductions)

**Date:** 2026-09-28  
**Seat:** Cursor (ROUND 157-C PR1 gate)  
**USMCA only.**

## Measured (not described)

Live Neon `br-fancy-credit-akjnd07a`, `bypass_rls=lucia`, SUM `net_pay` for
`source_document_ref IN (5804..5815)` = **$21,743.54**.

| ref | live net_pay | AlwaysTrack TOTAL DUE (control) |
|-----|-------------:|-------------------------------:|
| 5804 | 1601.08 | 1601.08 (`_st_txt` + feed-input) |
| 5805 | 2002.65 | 2002.65 |
| 5806 | 2008.15 | 2008.15 |
| 5807 | 1702.05 | 1702.05 |
| 5808 | 2001.25 | 2001.25 (ALLWAYS DRIVER SETTLEMENTS REPORT 09-18..09-27) |
| 5809 | 2075.97 | 2075.97 |
| 5810 | 1700.77 | 1700.77 |
| 5811 | 1964.35 | 1964.35 |
| **5812** | **1502.47** | **1502.47** (ALLWAYS DRIVER SETTLEMENTS + `feed-input/settlement-truth-from-pdfs.json`; deductions **$225.00**) |
| 5813 | 1986.05 | 1986.05 |
| 5814 | 1992.65 | 1992.65 |
| 5815 | 1206.10 | 1206.10 |
| **SUM** | **21743.54** | **21743.54** |

Owner Downloads pack (2026-09-28): `ALLWAYS DRIVER SETTLEMENTS REPORT.xlsx`,
`09-25-26-DRIVER CARRIER DEDUCTIONS.xlsx` — 5812 carries escrow + admin/phone + cash-advance wire
totaling **$225**, not the AUTH-056-only escrow **$75**.

## Identity (no plug)

Prior control after AUTH-056: **$21,893.54** (5812 net **$1,652.47** = gross $1,727.47 − escrow $75).  
AUTH-089 (ROUND 155.11-B, CC-2): void duplicate escrow on 13588 + insert missing phone $75 + CA wire $100
→ deductions **$225** → 5812 net **$1,502.47**.

`21893.54 − 150.00 = 21743.54` — the entire delta is AUTH-089’s 5812 deduction completion.
Live Neon and AlwaysTrack both already print $1,502.47; the gate expect was the only stale number.

## Authorized change

Update `scripts/verify-control-totals.mjs` “Driver settlements 5804-5815 net pay” `expect`
from **21893.54 → 21743.54**. Cite this ruling in the comment block.

**Supersedes** `docs/bus/RULING-2026-09-28-control-totals-5812-auth056.md`’s SUM only for the
post–AUTH-089 state. AUTH-056’s re-price of 5812 at $0.45/mi remains in force; AUTH-089 completes
the deduction side of the same document.
