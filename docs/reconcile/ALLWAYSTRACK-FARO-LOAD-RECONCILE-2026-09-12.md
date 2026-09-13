# AllwaysTrack ↔ App ↔ Faro reconciliation — 2026-09-12 (Cursor)

**Source of truth (owner-provided, Downloads):**
- **Loads / settlements / rates / drivers:** AllwaysTrack `Report (52).xlsx` (LOAD HISTORY 2026-08-28→2026-09-12, "all loads current+dispatched"), `Report (53)` settlements, `Report (58)` expenses, `Report (59)` deductions, and the per-tour `Company_Settlement_57xx..5803.pdf` / `Driver_Settlement_*.pdf`.
- **Factoring:** Faro purchase-report exports (`export (17|18|20).csv`, `FARO-IH-35-Transportation-export-*.csv`, `export.csv`, `export-8/9.csv`) — 128 unique purchases 07/17→09/11, purchase total **$441,128.00**, net adv **$427,795.14**.

Neon `tiny-field-89581227` / `br-fancy-credit-akjnd07a`, USMCA `5c854333-6ea5-4faa-af31-67cb272fef80`, `bypass_rls=lucia`.

## A. Loads MISSING from our DB (create from AllwaysTrack)
| Load | Customer | WO | Charge | Settl |
|---|---|---|---|---|
| 13579 | Semares Forwarding Services | SEM66511 | $4,900 | 5802 |
| 13585 | Direct Connect Logistix, INC | 6492969 | $2,100 | (Faro 09/10 #061) |

## B. Off-by-one scramble (our load numbers hold the NEXT AllwaysTrack load's data)
| Our load# | Currently holds | Should be (AllwaysTrack) |
|---|---|---|
| 13580 | Semares SEM66511 $4,900 | **Triple T** 42-1269653 **$3,300** (AT 13580) |
| 13581 | Triple T 42-1269653 $4,900 | **Semares** WO 56210 **$0** (AT 13581) |
| (SEM66511/Semares $4,900 belongs on the NEW 13579) | | |

## PRINCIPLE (proven from both sources 2026-09-12)
**Load customer / WO / existence = AllwaysTrack (Report 52). Invoice + factoring AMOUNT = Faro purchase.**
AllwaysTrack "Charges" is the linehaul base; the customer invoice (and thus the Faro purchase) is the
TOTAL incl. accessorials. Do NOT force invoice amounts to AllwaysTrack "Charges".

## C. Corrections
| Load | Our DB | Truth | Faro purchase | Action |
|---|---|---|---|---|
| 13584 | Armstrong $0 | **Tennessee Steel $1,000** WO 2160672 | inv 062 = **$1,000** ✓ | **APPLIED** (load fixed, proforma inv $1,000) |
| 13572 | Value Logistics | **EGRO TRANSPORT LLC** $3,200 | (customer-only fix) | **APPLIED** (INV-2026-00009, EGRO, $3,200) |
| 13570 | XPR $6,115 | AT Charges $5,900 (linehaul) | inv 052 = **$6,115** ✓ | **NO ACTION — already matches Faro** |
| 13563 | Hawkeye $600 | AT Charges $500 (linehaul) | inv 046 = **$600** ✓ | **NO ACTION — already matches Faro** |
| 13580 | Semares $4,900 | **Triple T $3,300** WO 42-1269653 | inv 063 = **$3,300** ✓ | HELD (entangled trio + 13579 create) |
| 13581 | Triple T $4,900 | **Semares $0** WO 56210 | (no Faro purchase) | HELD (trio) |
| 13587 | WO null | WO **131527406** (Key Global) | — | pending WO backfill (non-money) |
| 13589 | WO null | WO **0712370** (Kirsch) | — | pending WO backfill (non-money) |

## A. MISSING loads to create (amounts confirmed against Faro)
| Load | Customer | WO | Amount | Faro inv |
|---|---|---|---|---|
| 13579 | Semares Forwarding | SEM66511 | **$4,900** | inv 060 (09/08) |
| 13585 | Direct Connect Logistix | 6492969 | **$2,100** | inv 061 (09/10) |

## D. Verify against settlement PDFs before changing ($0-revenue legs in AllwaysTrack)
13554 (Big G, AT charge $0 / DB $3,500), 13564 (Armstrong, AT $0 / DB $3,000), 13581 (AT $0). These may be non-billed tour legs; do not blind-zero.

## E. In our DB but NOT in AllwaysTrack 08/28→today window (confirm cancelled/out-of-scope)
13553, 13555, 13556, 13565.

## F. Factoring (Faro) — after loads are corrected
- Prior reconcile (`scripts/ops/cursor-2026-09-07-faro-factor-and-reconcile.mts`) closed through **09/04** (inv ≤054 / load ≤13573).
- New Faro days to reconcile: **09/08 $23,910 · 09/10 $3,100 · 09/11 $33,100**.
- Our app Purchase Report currently shows 09/11 = 12 rows **$53,420** (6 are really 09/08 mis-dated + amount drift). Correct via the sanctioned factoring route (create/advance/void — never raw GL SQL), matching Faro by WO==PO, so daily purchase totals equal Faro exactly.

## Method (money-safe)
Loads corrected through the load-edit path so invoice/factoring/settlement linkage recomputes; factoring through `/api/v1/accounting/factoring-advances` + `/advance` + Faro CSV import; **void, never delete**; no raw SQL on money; dry-run → apply; Lead/owner verify.
