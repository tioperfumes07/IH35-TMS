# USMCA seat-junk purge — COMPLETE · 2026-09-01

**Entity:** USMCA `5c854333-6ea5-4faa-af31-67cb272fef80`  
**Script:** `scripts/run-usmca-seat-junk-purge-once.mts --commit`  
**REAL GL fingerprint:** `874a67bcac0aafdc20d25ea5f6ecea7d` — **unchanged** before/after all phases.

## Results

| Metric | Before | After |
|--------|--------|-------|
| Sample loads not cancelled | 37 | **7** |
| Test policies (TEST/SAMPLE/POL-TEST) | 4 | **0** |
| Phase 4 sample JEs reversed (run) | — | **283** |
| Plaid bank txns (kept) | 368 | 368 |

Phase 5: **27** sample loads cancelled · **10 skipped** (real invoice/settlement contamination — manual follow-up).  
Phase 6: **4** test policies cancelled.

## 10 loads held (manual CC-1)

| Load | Blocker |
|------|---------|
| L-20260830-0006 | Real invoice ($2,500, `is_sample_data=false`) |
| L-20260809-0007, L-20260827-0850 | Real settlement line |
| L-20260831-0003/0004/0006/0010 | Real settlement line |
| L-20260808-0085, L-20260808-0090, L-20260831-0017 | Settlement lines block cancel gate |

**Law:** void/reverse/deactivate only — no DELETE. Unwind via cancel/null-FK after real doc handling.

## Script fix on main

#19069 — `cancelLoads` sample-only filter + skip real invoice/settlement/driver bill.
