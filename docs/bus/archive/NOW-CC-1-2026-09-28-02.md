# AUTH-073 ROLLED BACK CLEAN — root cause is bigger than the settlement_lines void — CC-1 — 2026-09-27 9:56 PM CT (02:56Z 09-28).
Prior content archived: `docs/bus/archive/NOW-CC-1-2026-09-28-01.md` (WORM).

CC-1 | ROUND 143 STEP 5 / AUTH-073 | ATTEMPTED, SAFELY ROLLED BACK, NOT BASELINED | ran the void under
AUTH-073 exactly as scoped (12 lines / $2,898.24 / 6 settlements P-0002,0004,0008,0009,0010,0011 —
corrected from the AUTH's 4-item list; live population is 6, not 4, matching my earlier live
re-verify at 22:24Z 2026-09-27, not the archived FLAG's recollection). Script's own refusal check
caught it before commit and rolled back cleanly (tb unchanged, nothing baselined, nothing left
half-done):

**Voiding the 12 settlement_lines was NOT enough — the 6 loads are STILL excluded from
`views.live_loads` after void + `aggregateSettlementTotals`, because of a SECOND, independent
exclusion clause I hadn't checked before running:**
```sql
-- pulled live via pg_get_viewdef('views.live_loads'::regclass, true) just now:
AND NOT EXISTS (SELECT 1 FROM driver_finance.driver_bills b
                 WHERE b.load_id = l.id AND b.settled_in_settlement_id IS NOT NULL)
```
All 6 loads' `driver_bills` rows have `settled_in_settlement_id` pointing at their pre-settlement —
**set by AUTH-071 on purpose** ("link the 6 ROUND 189 driver bills to their pre-settlements",
commit 1cc514b598). This clause has NO status check on either the bill or the settlement — it
excludes on the FK's mere presence, whether the settlement is open or closed. Verified live just now:
all 6 bills `status='open'`, all 6 settlements `status='open'` — not settled/closed by any reasonable
meaning, yet excluded anyway.

**This means AUTH-071 (correct, deliberate) and the live-loads view (as currently written) are in
direct tension: linking a bill to its OPEN pre-settlement is exactly what makes the view treat the
load as finished.** The settlement_lines void alone can never fix this — the real gap is
`views.live_loads`'s predicate not distinguishing "linked to an open pre-settlement" from "linked to
a closed settlement" (e.g. it should join `driver_finance.driver_settlements` and require
`ds.status = 'closed'`, not just check the FK is non-null).

**NOT touching `driver_bills.settled_in_settlement_id` or the view definition — both are outside
AUTH-073's scope (settlement_lines only) and the view change affects every load in the system, not
just these 6.** Holding for a new authorization scoped to the actual fix (either the view predicate,
or an explicit call to null the 6 bills' `settled_in_settlement_id` if that's the intended
remediation instead).

## Still open
Same as before, unaffected: G4 Sch Fee GL · G3a · ROUND 202 STEP 3 (5812 header close) · 13619
customer/WO mismatch. Plus ROUND 144: STEP 2 cancelled · 5819 restore · 5817/5818 create · 18
unmatched cleared checks ($19,329.95, also flagged by CC-2 in #22887) · 5814 $100 variance · 3
short-pays ($3,750 → 4970).

CC-1 | 02:56Z | Moving to 5819 restoration (ROUND 144 item 2) while this is pending a call.
