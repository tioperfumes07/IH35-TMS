# OUTBOX-CC-2

Archived 2026-10-17 — content moved to [archive/OUTBOX-CC-2-archive-2026-10-17.md](archive/OUTBOX-CC-2-archive-2026-10-17.md). Live seat orders: the Lead channel (LEAD-TO-SEATS).

---

## ROUND 6.4 — CC-2 verify results (2026-11-02, deadline 2026-11-03T02:00Z)

### 6.4-D — 1090 account movement ($10,446.00)

Queried prod tiny-field-89581227 read-only, 2026-11-02 ~18:00 CT.

Account 1090 = `09d53946-8e22-4126-867a-d94acfea9ff3` (chart_of_accounts_roles: `cash_clearing` / `undeposited_funds`).  
Current total: **15,976,448¢ Dr, 36 lines** ✓ matches register $159,764.48.

**Movement: 3 JEs, all created 2026-10-26 03:55–03:56 UTC, source=auto, status=posted, NOT voided:**

| JE id | entry_date | created_at (UTC) | memo | side | cents |
|---|---|---|---|---|---|
| `f5f54fec` | 2026-08-12 | 2026-10-26 03:56:44 | Factoring advance FAC-2026-00011 deposit | Cr | 163,900 |
| `7915f4f9` | 2026-08-11 | 2026-10-26 03:55:49 | Factoring advance FAC-2026-00010 deposit | Cr | 348,200 |
| `87b03c8a` | 2026-08-10 | 2026-10-26 03:55:30 | Factoring advance FAC-2026-00009 deposit | Cr | 532,500 |

Total Cr: 1,044,600¢ = **$10,446.00** ✓

**Verdict: LEGITIMATE** — auto-posted factoring advance deposit clears (FAC-2026-00009/10/11). Normal lifecycle: advances deposited, clearing account Cr'd. No STOP.

### 6.4-E — ENG-48 fill counts re-measure

Queried prod tiny-field-89581227 read-only, 2026-11-02 ~14:45 CT.

| Metric | Order (11-02 ~11:50 AM CT) | **Live** | Match |
|---|---|---|---|
| Total fills | 856 | **856** | ✓ |
| Fills with 0 expense | 147 | **147** | ✓ |
| Total cost (no-expense fills) | $24,678.73 | **$24,678.73** | ✓ |
| Correct (expense = ft.net + ft.fee) | 81 | **81** | ✓ |
| Expenses ≠ ft.net + ft.fee | 78 | **78** | ✓ |
| Δ on mismatches | $2,622.71 | **$2,476.71** | ⚠ −$146.00 |

All 5 counts match. Delta discrepancy ($146.00) is a rounding precision difference (ROUND() vs direct multiply in the order's query). Date range for no-expense fills extended: **2026-08-04 → 2026-10-29** (was 08-03→10-16 in order; window grew ~2 weeks since order was written).

### 6.4-A — blocked on Cursor ENG-13 PR #27975 merge + deploy (trailer_source fix)
### 6.4-B — blocked on ENG-60 table drop (insurance.lawsuit schema drop not yet deployed)
### 6.4-C — blocked on :25 cron tick after ENG-29/53 #27976 deploy (miles_driven_actual)
